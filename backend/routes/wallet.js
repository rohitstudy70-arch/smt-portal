const express = require('express');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const {
  PORTAL_ROLES,
  attachHierarchyScope,
  requireRoles,
} = require('../middleware/hierarchy');

const router = express.Router();

router.use(protect, attachHierarchyScope);

const operationsRoles = [PORTAL_ROLES.ADMIN, PORTAL_ROLES.DEALER, PORTAL_ROLES.SUB_DEALER];

// @route   GET /api/wallet/transactions
// @desc    Get transactions of current user
// @access  Protected
router.get('/transactions', requireRoles(...operationsRoles), async (req, res) => {
  try {
    const { fromDate, toDate, search, limit = 10, page = 1 } = req.query;

    const query = { userId: req.user._id };

    // Date filters
    if (fromDate || toDate) {
      query.date = {};
      if (fromDate) {
        query.date.$gte = new Date(fromDate);
      }
      if (toDate) {
        query.date.$lte = new Date(toDate);
      }
    }

    // Search query
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { transactionId: searchRegex },
        { paymentId: searchRegex },
        { paymentFor: searchRegex },
        { referenceNo: searchRegex },
        { remarks: searchRegex }
      ];
    }

    const options = {
      limit: parseInt(limit, 10),
      skip: (parseInt(page, 10) - 1) * parseInt(limit, 10),
      sort: { date: -1 } // newest first
    };

    const transactions = await Transaction.find(query, null, options);
    const total = await Transaction.countDocuments(query);

    res.json({
      transactions,
      total,
      pages: Math.ceil(total / limit),
      currentPage: parseInt(page, 10)
    });
  } catch (error) {
    console.error('Get transactions error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/wallet/add
// @desc    Add funds (Credit) or spend (Debit)
// @access  Protected
router.post('/add', requireRoles(...operationsRoles), async (req, res) => {
  try {
    const {
      amount,
      type, // 'Debit' or 'Credit'
      paymentFor,
      paymentId,
      referenceNo,
      payMode,
      remarks,
      maxDays,
      requestedAmt
    } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    if (!type || !['Debit', 'Credit'].includes(type)) {
      return res.status(400).json({ message: 'Type must be Debit or Credit' });
    }

    const user = await User.findById(req.user._id);

    // If Debit, check available balance
    if (type === 'Debit' && user.availableBalance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    // Update user balance
    if (type === 'Credit') {
      user.availableBalance += Number(amount);
    } else {
      user.availableBalance -= Number(amount);
    }
    await user.save();

    // Create unique Transaction ID
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    const date = new Date();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const transactionId = `ITR_${mm}_${dd}_${randomNum}`;

    const transaction = await Transaction.create({
      userId: req.user._id,
      transactionId,
      paymentId: paymentId || '',
      paymentFor: paymentFor || 'Wallet Load',
      referenceNo: referenceNo || '',
      payMode: payMode || 'Itwallet',
      transactionType: type,
      status: 'Success',
      remarks: remarks || '',
      maxDays: maxDays || '-',
      requestedAmt: requestedAmt || '-',
      transactedAmt: Number(amount)
    });

    res.json({
      message: 'Transaction completed successfully',
      transaction,
      availableBalance: user.availableBalance
    });
  } catch (error) {
    console.error('Wallet transaction error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
