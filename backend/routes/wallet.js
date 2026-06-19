const express = require('express');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const {
  PORTAL_ROLES,
  getPortalRole,
  getDescendantUsers,
  ensureUserInHierarchy,
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

// @route   GET /api/wallet/users
// @desc    Get all users in hierarchy with balances (except current user)
// @access  Protected
router.get('/users', requireRoles(...operationsRoles), async (req, res) => {
  try {
    const role = getPortalRole(req.user);
    let list;
    if (role === PORTAL_ROLES.ADMIN) {
      list = await User.find({ role: { $ne: 'partner' } }).select('-password');
    } else {
      list = await getDescendantUsers(req.user._id);
    }
    res.json(list);
  } catch (error) {
    console.error('Get ledger users error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/wallet/transactions/:targetUserId
// @desc    Get transactions of a specific user in hierarchy
// @access  Protected
router.get('/transactions/:targetUserId', requireRoles(...operationsRoles), async (req, res) => {
  try {
    const { fromDate, toDate, search, limit = 10, page = 1 } = req.query;
    const { targetUserId } = req.params;

    // Ensure targetUserId is in hierarchy
    const targetUser = await ensureUserInHierarchy(targetUserId, req.hierarchyScope);
    if (!targetUser) {
      return res.status(403).json({ message: 'Access denied: User not in your hierarchy' });
    }

    const query = { userId: targetUser._id };

    // Date filters
    if (fromDate || toDate) {
      query.date = {};
      if (fromDate) query.date.$gte = new Date(fromDate);
      if (toDate) query.date.$lte = new Date(toDate);
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
      currentPage: parseInt(page, 10),
      user: {
        _id: targetUser._id,
        displayName: targetUser.displayName,
        companyName: targetUser.companyName,
        username: targetUser.username,
        availableBalance: targetUser.availableBalance,
        userType: targetUser.userType
      }
    });
  } catch (error) {
    console.error('Get target transactions error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/wallet/transaction/:targetUserId
// @desc    Record a transaction (Credit/Debit) for a specific user in hierarchy
// @access  Protected
router.post('/transaction/:targetUserId', requireRoles(...operationsRoles), async (req, res) => {
  try {
    const { targetUserId } = req.params;
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

    // Ensure target user is in hierarchy
    const targetUser = await ensureUserInHierarchy(targetUserId, req.hierarchyScope);
    if (!targetUser) {
      return res.status(403).json({ message: 'Access denied: User not in your hierarchy' });
    }

    // If Debit, verify available balance
    if (type === 'Debit' && targetUser.availableBalance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    // Update user balance
    if (type === 'Credit') {
      targetUser.availableBalance += Number(amount);
    } else {
      targetUser.availableBalance -= Number(amount);
    }
    await targetUser.save();

    // Create unique Transaction ID
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    const date = new Date();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const transactionId = `ITR_${mm}_${dd}_${randomNum}`;

    const transaction = await Transaction.create({
      userId: targetUser._id,
      transactionId,
      paymentId: paymentId || '',
      paymentFor: paymentFor || 'Adjustment Entry',
      referenceNo: referenceNo || '',
      payMode: payMode || 'Manualentry',
      transactionType: type,
      status: 'Success',
      remarks: remarks || `Adjustment by ${req.user.displayName || req.user.username}`,
      maxDays: maxDays || '-',
      requestedAmt: requestedAmt || '-',
      transactedAmt: Number(amount)
    });

    res.json({
      message: 'Transaction recorded successfully',
      transaction,
      availableBalance: targetUser.availableBalance
    });
  } catch (error) {
    console.error('Create ledger transaction error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
