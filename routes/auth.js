const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { sendOTP } = require('../utils/emailService');

// Generate OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Initial Registration
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Validate input
        if (!username || !email || !password) {
            return res.status(400).json({ message: 'Please enter all fields' });
        }

        // Check existing user
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        
        // If user exists but isn't verified, we can resend OTP
        if (existingUser && !existingUser.isVerified) {
            // Generate new OTP
            const otp = generateOTP();
            const otpExpiry = new Date();
            otpExpiry.setMinutes(otpExpiry.getMinutes() + 10);

            // Update existing user's OTP
            existingUser.otp = {
                code: otp,
                expiry: otpExpiry
            };
            await existingUser.save();

            // Send new OTP
            try {
                await sendOTP(email, otp);
                console.log('New OTP for existing unverified user:', otp); // For testing
                return res.status(200).json({
                    message: 'User exists but not verified. New OTP sent.',
                    userId: existingUser._id
                });
            } catch (emailError) {
                console.error('Failed to send OTP:', emailError);
                return res.status(500).json({ 
                    message: 'Failed to send OTP email',
                    error: emailError.message 
                });
            }
        }

        // If user exists and is verified, return error
        if (existingUser && existingUser.isVerified) {
            return res.status(400).json({ message: 'User already exists and is verified' });
        }

        // If user doesn't exist, create new user
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Generate OTP for new user
        const otp = generateOTP();
        const otpExpiry = new Date();
        otpExpiry.setMinutes(otpExpiry.getMinutes() + 10);

        // Create new user
        const newUser = new User({
            username,
            email,
            password: hashedPassword,
            otp: {
                code: otp,
                expiry: otpExpiry
            }
        });

        // Save user
        await newUser.save();

        // Send OTP
        try {
            await sendOTP(email, otp);
            console.log('OTP for new user:', otp); // For testing
            return res.status(201).json({
                message: 'Registration initiated. Please verify your email with OTP',
                userId: newUser._id
            });
        } catch (emailError) {
            console.error('Failed to send OTP:', emailError);
            // Delete the created user since email failed
            await User.findByIdAndDelete(newUser._id);
            return res.status(500).json({ 
                message: 'Failed to send OTP email',
                error: emailError.message 
            });
        }

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: error.message });
    }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
    try {
        const { userId, otp } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if OTP is expired
        if (new Date() > user.otp.expiry) {
            return res.status(400).json({ message: 'OTP has expired' });
        }

        // Verify OTP
        if (otp !== user.otp.code) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        // Mark user as verified
        user.isVerified = true;
        user.otp = undefined; // Clear OTP
        await user.save();

        // Create token
        const token = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Email verified successfully',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                credits: user.credits
            }
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Resend OTP
router.post('/resend-otp', async (req, res) => {
    try {
        const { userId } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Generate new OTP
        const otp = generateOTP();
        const otpExpiry = new Date();
        otpExpiry.setMinutes(otpExpiry.getMinutes() + 10);

        // Update user's OTP
        user.otp = {
            code: otp,
            expiry: otpExpiry
        };
        await user.save();

        // Send new OTP
        const emailSent = await sendOTP(user.email, otp);
        if (!emailSent) {
            return res.status(500).json({ message: 'Error sending OTP email' });
        }

        res.json({ message: 'New OTP sent successfully' });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Login Route
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        let user = await User.findOne({ email });
        
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const payload = {
            id: user.id
        };

        const token = jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Send both user data and token
        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                credits: user.credits
            }
        });
        
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// Get User Data Route
router.get('/user', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;