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
  buildDeviceScopeQuery,
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

const Device = require('../models/Device');

const syncOldDeviceTransactions = async (userIds) => {
  try {
    const devices = await Device.find({
      userId: { $in: userIds },
      billAmount: { $gt: 0 }
    });

    if (devices.length === 0) return;

    // Get all existing transaction referenceNos or paymentIds in one query to optimize
    const existingTx = await Transaction.find({
      userId: { $in: userIds }
    }, 'paymentId referenceNo');

    const txPaymentIds = new Set(existingTx.map(t => t.paymentId));
    const txRefNos = new Set(existingTx.map(t => t.referenceNo));

    const toCreate = [];

    for (const dev of devices) {
      const devIdStr = dev._id.toString();
      const hasTx = txPaymentIds.has(devIdStr) || txRefNos.has(dev.imei);

      if (!hasTx) {
        const randomNum = Math.floor(10000 + Math.random() * 90000);
        const date = dev.presentDate || dev.createdAt || new Date();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const transactionId = `ITR_${mm}_${dd}_${randomNum}`;

        toCreate.push({
          userId: dev.userId,
          transactionId,
          paymentId: devIdStr,
          paymentFor: 'Device Purchase',
          referenceNo: dev.imei,
          payMode: 'Itwallet',
          transactionType: 'Debit',
          status: 'Success',
          remarks: `Auto-synced: Device Purchase (IMEI ${dev.imei})`,
          requestedAmt: dev.billAmount,
          transactedAmt: dev.billAmount,
          deviceName: dev.deviceName,
          imei: dev.imei,
          iccid: dev.iccid,
          serialNo: dev.serialNo,
          balanceAfterTransaction: 0,
          createdBy: dev.createdBy || dev.userId,
          date: date
        });
      }
    }

    if (toCreate.length > 0) {
      await Transaction.insertMany(toCreate);
      console.log(`Auto-synced ${toCreate.length} missing device transactions to ledger.`);
    }
  } catch (err) {
    console.error('Error during auto-sync of old device transactions:', err.message);
  }
};

const syncUserBalances = async (userIds) => {
  try {
    if (!userIds || userIds.length === 0) return;

    const summaryAgg = await Transaction.aggregate([
      { $match: { userId: { $in: userIds } } },
      {
        $group: {
          _id: { userId: '$userId', type: '$transactionType' },
          total: { $sum: '$transactedAmt' }
        }
      }
    ]);

    const balanceMap = {};
    userIds.forEach(uid => {
      balanceMap[uid.toString()] = 0;
    });

    summaryAgg.forEach(item => {
      if (!item._id || !item._id.userId) return;
      const uid = item._id.userId.toString();
      const type = item._id.type;
      const amount = item.total;

      if (type === 'Credit') {
        balanceMap[uid] += amount;
      } else if (type === 'Debit') {
        balanceMap[uid] -= amount;
      }
    });

    const bulkOps = Object.keys(balanceMap).map(uid => ({
      updateOne: {
        filter: { _id: uid },
        update: { $set: { availableBalance: balanceMap[uid] } }
      }
    }));

    if (bulkOps.length > 0) {
      await User.bulkWrite(bulkOps);
    }
  } catch (err) {
    console.error('Error during bulk syncUserBalances:', err.message);
  }
};

// @route   GET /api/wallet/ledger-dashboard
// @desc    Get ledger dashboard summaries, analytics, and paginated transactions
// @access  Protected
router.get('/ledger-dashboard', requireRoles(...operationsRoles), async (req, res) => {
  try {
    // Auto-sync missing transactions from devices
    await syncOldDeviceTransactions(req.hierarchyScope.userIds);

    // Sync user balances with transaction history
    await syncUserBalances(req.hierarchyScope.userIds);

    const { fromDate, toDate, search, type, dealerId, limit = 10, page = 1 } = req.query;

    let targetUserId = null;
    let selectedUser = null;

    if (dealerId) {
      // Validate that the dealerId is in hierarchy
      selectedUser = await ensureUserInHierarchy(dealerId, req.hierarchyScope);
      if (!selectedUser) {
        return res.status(403).json({ message: 'Access denied: Selected dealer is not in your hierarchy.' });
      }
      targetUserId = selectedUser._id;
    } else if (req.portalRole !== PORTAL_ROLES.ADMIN) {
      // Default non-admin to themselves
      targetUserId = req.user._id;
      selectedUser = req.user;
    }

    const transactionQuery = {};
    if (targetUserId) {
      transactionQuery.userId = targetUserId;
    } else {
      // If Admin and no dealerId is selected, show transactions for all users in Admin's scope
      transactionQuery.userId = { $in: req.hierarchyScope.userIds };
    }

    // Date filters
    if (fromDate || toDate) {
      transactionQuery.date = {};
      if (fromDate) {
        transactionQuery.date.$gte = new Date(fromDate);
      }
      if (toDate) {
        const end = new Date(toDate);
        if (!isNaN(end.getTime())) {
          end.setHours(23, 59, 59, 999);
          transactionQuery.date.$lte = end;
        }
      }
    }

    // Type filter
    if (type && ['Credit', 'Debit'].includes(type)) {
      transactionQuery.transactionType = type;
    }

    // Search query
    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      transactionQuery.$or = [
        { transactionId: searchRegex },
        { paymentId: searchRegex },
        { paymentFor: searchRegex },
        { referenceNo: searchRegex },
        { remarks: searchRegex },
        { deviceName: searchRegex },
        { imei: searchRegex },
        { iccid: searchRegex },
        { serialNo: searchRegex }
      ];
    }

    const parsedLimit = Math.min(parseInt(limit, 10) || 10, 100000);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);

    const [transactions, total] = await Promise.all([
      Transaction.find(transactionQuery)
        .populate('userId', 'displayName companyName username userType')
        .populate('createdBy', 'displayName companyName username userType')
        .sort({ date: -1 })
        .skip((parsedPage - 1) * parsedLimit)
        .limit(parsedLimit),
      Transaction.countDocuments(transactionQuery),
    ]);

    // Calculate Summary Metrics
    const summaryAgg = await Transaction.aggregate([
      { $match: transactionQuery },
      {
        $group: {
          _id: '$transactionType',
          total: { $sum: '$transactedAmt' }
        }
      }
    ]);

    let totalCredit = 0;
    let totalDebit = 0;
    summaryAgg.forEach(item => {
      if (item._id === 'Credit') totalCredit = item.total;
      if (item._id === 'Debit') totalDebit = item.total;
    });

    let currentBalance = 0;
    if (targetUserId) {
      const userDoc = await User.findById(targetUserId);
      currentBalance = userDoc ? (userDoc.availableBalance || 0) : 0;
    } else {
      // Sum of all users' balances in hierarchy scope
      const usersBalances = await User.find({ _id: { $in: req.hierarchyScope.userIds } }, 'availableBalance');
      currentBalance = usersBalances.reduce((sum, u) => sum + (u.availableBalance || 0), 0);
    }

    // Calculate total devices assigned
    let totalDevicesAssigned = 0;
    if (targetUserId) {
      totalDevicesAssigned = await Device.countDocuments({
        $or: [
          { dealerId: targetUserId },
          { subDealerId: targetUserId },
          { userId: targetUserId }
        ]
      });
    } else {
      totalDevicesAssigned = await Device.countDocuments(buildDeviceScopeQuery(req.hierarchyScope));
    }

    // Calculate Analytics
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayQuery = {
      userId: transactionQuery.userId,
      date: { $gte: todayStart, $lte: todayEnd }
    };

    const todayAgg = await Transaction.aggregate([
      { $match: todayQuery },
      {
        $group: {
          _id: '$transactionType',
          total: { $sum: '$transactedAmt' }
        }
      }
    ]);

    let todayTotalCredit = 0;
    let todayTotalDebit = 0;
    todayAgg.forEach(item => {
      if (item._id === 'Credit') todayTotalCredit = item.total;
      if (item._id === 'Debit') todayTotalDebit = item.total;
    });

    // Monthly Sales
    const currentYearStart = new Date(new Date().getFullYear(), 0, 1);
    const monthlyQuery = {
      userId: transactionQuery.userId,
      transactionType: 'Debit',
      date: { $gte: currentYearStart }
    };

    const monthlyAgg = await Transaction.aggregate([
      { $match: monthlyQuery },
      {
        $group: {
          _id: { $month: '$date' },
          total: { $sum: '$transactedAmt' }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    const monthlySales = Array.from({ length: 12 }, (_, i) => ({
      month: new Date(0, i).toLocaleString('default', { month: 'short' }),
      total: 0
    }));

    monthlyAgg.forEach(item => {
      const monthIndex = item._id - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        monthlySales[monthIndex].total = item.total;
      }
    });

    // Pending Dues
    let pendingDues = 0;
    if (targetUserId) {
      if (selectedUser && selectedUser.availableBalance < 0) {
        pendingDues = Math.abs(selectedUser.availableBalance);
      } else {
        const userDoc = await User.findById(targetUserId);
        if (userDoc && userDoc.availableBalance < 0) {
          pendingDues = Math.abs(userDoc.availableBalance);
        }
      }
    } else {
      const negativeUsers = await User.find({
        _id: { $in: req.hierarchyScope.userIds },
        availableBalance: { $lt: 0 }
      }, 'availableBalance');
      pendingDues = negativeUsers.reduce((sum, u) => sum + Math.abs(u.availableBalance), 0);
    }

    // Dealer-wise Debit Breakdown
    let topDealers = [];
    if (req.hierarchyScope.userIds && req.hierarchyScope.userIds.length > 0) {
      const topDealersAgg = await Transaction.aggregate([
        {
          $match: {
            transactionType: 'Debit',
            userId: { $in: req.hierarchyScope.userIds }
          }
        },
        {
          $group: {
            _id: '$userId',
            totalDebit: { $sum: '$transactedAmt' }
          }
        },
        { $sort: { totalDebit: -1 } },
        { $limit: 500 }
      ]);

      const dealerIds = topDealersAgg.map(item => item._id);
      const dealerDocs = await User.find({ _id: { $in: dealerIds } }, 'displayName companyName username userType availableBalance');

      topDealers = topDealersAgg.map(item => {
        const userDoc = dealerDocs.find(d => d._id.toString() === item._id.toString());
        return {
          userId: item._id,
          name: userDoc ? (userDoc.displayName || userDoc.companyName || userDoc.username) : 'Unknown Dealer',
          role: userDoc ? userDoc.userType : 'Dealer',
          totalDebit: item.totalDebit,
          availableBalance: userDoc ? (userDoc.availableBalance || 0) : 0
        };
      });
    }

    res.json({
      transactions,
      total,
      pages: Math.ceil(total / parsedLimit),
      currentPage: parsedPage,
      summary: {
        totalCredit,
        totalDebit,
        currentBalance,
        totalDevicesAssigned
      },
      analytics: {
        todayTotalCredit,
        todayTotalDebit,
        monthlySales,
        pendingDues,
        topDealers
      }
    });

  } catch (error) {
    console.error('Ledger dashboard error:', error.message);
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
