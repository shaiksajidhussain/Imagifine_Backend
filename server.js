const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const rateLimit = require('express-rate-limit');

// Load environment variables
dotenv.config();

// Initialize express
const app = express();

// Add rate limiter configuration here
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per window
  message: {
    error: 'Too many payment attempts. Please try again later.'
  }
});

// Middleware
app.use(cors({
    origin: [
        'https://imagifine.vercel.app',
        'https://imagifine.vercel.app/',

        'http://localhost:5173',
        'http://localhost:3000',
       
        
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));
app.use(express.json());

// Apply rate limiter to payment routes
app.use('/api/credits/create-order', paymentLimiter);
app.use('/api/credits/verify-payment', paymentLimiter);

// Connect to MongoDB without blocking server start
connectDB().catch(console.error);

// Basic route
app.get('/', (req, res) => {
    res.json({ message: 'API is running' });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/credits', require('./routes/credits'));
app.use('/api/contact', require('./routes/contact'));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app;