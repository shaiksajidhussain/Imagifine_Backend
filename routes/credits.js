const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Create order
router.post('/create-order', auth, async (req, res) => {
  try {
    const { planId } = req.body;
    
    // Define plans and their prices in paise (1 INR = 100 paise)
    const plans = {
      basic: { amount: 1000, credits: 100 },     // ₹10 for 100 credits
      advanced: { amount: 5000, credits: 500 },   // ₹50 for 500 credits
      business: { amount: 25000, credits: 2000 }  // ₹250 for 2000 credits
    };

    const plan = plans[planId];
    if (!plan) {
      return res.status(400).json({ message: 'Invalid plan' });
    }

    const options = {
      amount: plan.amount,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      notes: {
        userId: req.user.id,
        credits: plan.credits,
        planId
      }
    };

    const order = await razorpay.orders.create(options);
    res.json({
      orderId: order.id,
      amount: plan.amount,
      credits: plan.credits
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify payment
router.post('/verify-payment', auth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature === razorpay_signature) {
      // Payment is successful, update user credits
      const order = await razorpay.orders.fetch(razorpay_order_id);
      const { userId, credits } = order.notes;

      const user = await User.findById(userId);
      if (user) {
        user.credits += parseInt(credits);
        await user.save();
        res.json({ 
          success: true,
          credits: user.credits 
        });
      }
    } else {
      res.status(400).json({ message: 'Invalid signature' });
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;