const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Razorpay = require('razorpay');
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const crypto = require('crypto');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Create order
router.post('/create-order', auth, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { planId } = req.body;
    
    const plans = {
      basic: { amount: 200, credits: 2 },      
      advanced: { amount: 1000, credits: 5 },    
      business: { amount: 5000, credits: 10 }    
    };

    if (!plans[planId]) {
      return res.status(400).json({ message: 'Invalid plan selected' });
    }

    const receiptId = `r_${Math.random().toString(36).substring(2, 10)}`;

    const options = {
      amount: plans[planId].amount,
      currency: "INR",
      receipt: receiptId,
      notes: {
        userId: req.user.id,
        credits: plans[planId].credits,
        planId
      }
    };

    const order = await razorpay.orders.create(options);
    
    // Create transaction record
    const transaction = new Transaction({
      userId: req.user.id,
      orderId: order.id,
      paymentId: 'pending',
      amount: plans[planId].amount,
      credits: plans[planId].credits,
      planId: planId,
      status: 'pending'
    });

    await transaction.save({ session });
    await session.commitTransaction();

    res.json({
      orderId: order.id,
      amount: plans[planId].amount,
      credits: plans[planId].credits,
      key: process.env.RAZORPAY_KEY_ID
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Order creation error:', error);
    res.status(500).json({ 
      message: 'Payment initialization failed',
      error: error.message 
    });
  } finally {
    session.endSession();
  }
});

// Verify payment
router.post('/verify-payment', auth, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature 
    } = req.body;

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Invalid payment signature' });
    }

    // Find transaction
    const transaction = await Transaction.findOne({ 
      orderId: razorpay_order_id 
    }).session(session);

    if (!transaction) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Transaction not found' });
    }

    // Update transaction
    transaction.paymentId = razorpay_payment_id;
    transaction.status = 'completed';
    await transaction.save({ session });

    // Update user credits
    const user = await User.findById(transaction.userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'User not found' });
    }

    user.credits += transaction.credits;
    await user.save({ session });

    await session.commitTransaction();

    res.json({ 
      success: true,
      credits: user.credits,
      transactionId: transaction._id
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Payment verification error:', error);
    res.status(500).json({ 
      message: 'Payment verification failed',
      error: error.message 
    });
  } finally {
    session.endSession();
  }
});

// Get transaction history
router.get('/transactions', auth, async (req, res) => {
  try {
    const transactions = await Transaction.find({ 
      userId: req.user.id 
    }).sort({ createdAt: -1 }); // Most recent first

    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ message: 'Failed to fetch transactions' });
  }
});

// Get single transaction
router.get('/transaction/:id', auth, async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    // Get payment details from Razorpay
    const payment = await razorpay.payments.fetch(transaction.paymentId);

    res.json({
      transaction,
      payment
    });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ message: 'Failed to fetch transaction details' });
  }
});

// Update credits route
router.put('/update', auth, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { credits } = req.body;
    
    const user = await User.findById(req.user.id).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'User not found' });
    }

    // Update user credits
    user.credits = credits;
    await user.save({ session });

    await session.commitTransaction();

    res.json({ 
      success: true, 
      credits: user.credits 
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Credits update error:', error);
    res.status(500).json({ 
      message: 'Failed to update credits',
      error: error.message 
    });
  } finally {
    session.endSession();
  }
});

module.exports = router;