const express = require('express');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/users/sub-users
// @desc    Get sub-users of current user
// @access  Protected
router.get('/sub-users', protect, async (req, res) => {
  try {
    const subUsers = await User.find({ parentId: req.user._id }).select('-password');
    res.json(subUsers);
  } catch (error) {
    console.error('Get sub users error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/users/sub-user
// @desc    Create a new sub-user
// @access  Protected
router.post('/sub-user', protect, async (req, res) => {
  try {
    const { userType, displayName, mobileNo, email, username, password } = req.body;

    if (!userType || !displayName || !username || !password) {
      return res.status(400).json({ message: 'Please fill in all required fields' });
    }

    // Check if user already exists
    const userExists = await User.findOne({ username });
    if (userExists) {
      return res.status(400).json({ message: 'Username is already taken' });
    }

    // Create sub-user
    const subUser = await User.create({
      username,
      password, // will be hashed by pre-save hook
      role: 'customer',
      parentId: req.user._id,
      userType,
      displayName,
      mobileNo: mobileNo || '',
      email: email || '',
      status: 'Active'
    });

    const returnedUser = await User.findById(subUser._id).select('-password');

    res.status(201).json(returnedUser);
  } catch (error) {
    console.error('Create sub user error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/users/sub-user/:id
// @desc    Update a sub-user details
// @access  Protected
router.put('/sub-user/:id', protect, async (req, res) => {
  try {
    const { userType, displayName, mobileNo, email, status } = req.body;

    const subUser = await User.findOne({ _id: req.params.id, parentId: req.user._id });

    if (!subUser) {
      return res.status(404).json({ message: 'Sub-user not found' });
    }

    if (userType) subUser.userType = userType;
    if (displayName) subUser.displayName = displayName;
    if (mobileNo !== undefined) subUser.mobileNo = mobileNo;
    if (email !== undefined) subUser.email = email;
    if (status) subUser.status = status;

    const updatedUser = await subUser.save();
    res.json(updatedUser);
  } catch (error) {
    console.error('Update sub user error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/users/sub-user/:id
// @desc    Toggle sub-user status
// @access  Protected
router.delete('/sub-user/:id', protect, async (req, res) => {
  try {
    const subUser = await User.findOne({ _id: req.params.id, parentId: req.user._id });

    if (!subUser) {
      return res.status(404).json({ message: 'Sub-user not found' });
    }

    subUser.status = subUser.status === 'Active' ? 'Inactive' : 'Active';
    await subUser.save();

    res.json({ message: `Sub-user status updated to ${subUser.status}`, status: subUser.status });
  } catch (error) {
    console.error('Delete sub user error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

const Transaction = require('../models/Transaction');

// @route   POST /api/users/transfer
// @desc    Pay to subdealer (purchase plan on behalf of subdealer)
// @access  Protected
router.post('/transfer', protect, async (req, res) => {
  try {
    const { subUserId, type, plan, quantity, piNo, remarks } = req.body;

    if (!subUserId || !type || !plan || !quantity || !piNo) {
      return res.status(400).json({ message: 'All required fields must be filled' });
    }

    const subUser = await User.findOne({ _id: subUserId, parentId: req.user._id });
    if (!subUser) {
      return res.status(404).json({ message: 'Selected subdealer not found' });
    }

    // Calculate unit cost based on type and plan
    let unitCost = 472; // default 1 Year commercial
    if (type === 'Commercial Plan' && plan === '2 Years') unitCost = 394;
    else if (type === 'Top-up') unitCost = 70.8;
    else if (type === 'Common Layer') unitCost = 100;

    const amount = unitCost * Number(quantity);

    const parentUser = await User.findById(req.user._id);
    if (parentUser.availableBalance < amount) {
      return res.status(400).json({ message: 'Insufficient available balance to make this payment' });
    }

    // Deduct parent balance
    parentUser.availableBalance -= amount;
    await parentUser.save();

    // Create Activation Request or Common Layer Request
    if (type === 'Common Layer') {
      const CommonLayerRequest = require('../models/CommonLayerRequest');
      
      const lastRequest = await CommonLayerRequest.findOne().sort({ requestId: -1 });
      let requestId = `CL-REQ${10000 + Math.floor(Math.random() * 90000)}`;
      if (lastRequest && lastRequest.requestId) {
        const numPart = parseInt(lastRequest.requestId.replace('CL-REQ', ''), 10);
        if (!isNaN(numPart)) requestId = `CL-REQ${numPart + 1}`;
      }

      await CommonLayerRequest.create({
        requestId,
        userId: parentUser._id,
        isSubDealer: true,
        subDealerName: subUser.displayName || subUser.username,
        quantity: Number(quantity),
        commonLayer: plan,
        piNo,
        piValue: amount,
        remarks: remarks || '',
        status: 'Completed'
      });
    } else {
      const ActivationRequest = require('../models/ActivationRequest');
      
      const lastRequest = await ActivationRequest.findOne().sort({ requestId: -1 });
      let requestId = `REQUEST${10000 + Math.floor(Math.random() * 90000)}`;
      if (lastRequest && lastRequest.requestId) {
        const numPart = parseInt(lastRequest.requestId.replace('REQUEST', ''), 10);
        if (!isNaN(numPart)) requestId = `REQUEST${numPart + 1}`;
      }

      await ActivationRequest.create({
        requestId,
        userId: parentUser._id,
        isSubDealer: true,
        subDealerName: subUser.displayName || subUser.username,
        quantity: Number(quantity),
        requestType: type,
        plan,
        piNo,
        amount,
        remarks: remarks || '',
        status: 'Completed'
      });
    }

    // Create Transaction history entry
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    const date = new Date();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');

    await Transaction.create({
      userId: parentUser._id,
      transactionId: `ITR_${mm}_${dd}_${randomNum}`,
      paymentId: piNo,
      paymentFor: type === 'Common Layer' ? 'Common Layer' : 'Sim Activation',
      referenceNo: `TRF-${subUser.username.toUpperCase()}`,
      payMode: 'Itwallet',
      transactionType: 'Debit',
      status: 'Success',
      remarks: remarks || `Paid for Subdealer (${subUser.displayName || subUser.username})`,
      transactedAmt: amount
    });

    res.json({
      message: `Successfully paid ₹${amount.toFixed(2)} on behalf of ${subUser.displayName || subUser.username}`,
      availableBalance: parentUser.availableBalance
    });
  } catch (error) {
    console.error('Pay to subdealer error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
