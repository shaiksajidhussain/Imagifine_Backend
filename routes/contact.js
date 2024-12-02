const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');
const auth = require('../middleware/auth');
const nodemailer = require('nodemailer');

// Configure nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD  // Changed from EMAIL_PASS to EMAIL_PASSWORD
  }
});

// Submit contact form
router.post('/submit', async (req, res) => {
  try {
    const { firstName, lastName, email, query } = req.body;

    // Create new contact entry
    const contact = new Contact({
      firstName,
      lastName,
      email,
      query
    });

    await contact.save();

    // Send confirmation email to user
    const userMailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Thank you for contacting Imagifine',
      html: `
        <h2>Thank you for reaching out!</h2>
        <p>Dear ${firstName},</p>
        <p>We have received your query and will get back to you soon.</p>
        <p>Your query details:</p>
        <p>${query}</p>
        <br>
        <p>Best regards,</p>
        <p>Team Imagifine</p>
      `
    };

    // Send notification email to admin
    const adminMailOptions = {
      from: process.env.EMAIL_USER,
      to: 'sanjusazid0@gmail.com', // Admin email
      subject: 'New Contact Form Submission',
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${firstName} ${lastName}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Query:</strong> ${query}</p>
      `
    };

    await transporter.sendMail(userMailOptions);
    await transporter.sendMail(adminMailOptions);

    res.status(201).json({ 
      success: true, 
      message: 'Your message has been sent successfully!' 
    });

  } catch (error) {
    console.error('Contact submission error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to submit contact form. Please try again.' 
    });
  }
});

// Get all contacts (admin only)
router.get('/all', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.isAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }

    const contacts = await Contact.find().sort({ createdAt: -1 });
    res.json({ success: true, contacts });

  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch contacts' 
    });
  }
});

// Update contact status (admin only)
router.patch('/:id/status', auth, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }

    const { status } = req.body;
    const contact = await Contact.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!contact) {
      return res.status(404).json({ 
        success: false, 
        message: 'Contact not found' 
      });
    }

    res.json({ success: true, contact });

  } catch (error) {
    console.error('Update contact status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update contact status' 
    });
  }
});

module.exports = router;