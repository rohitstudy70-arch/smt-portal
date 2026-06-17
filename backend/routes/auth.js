const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
};

// @route   POST /api/auth/login
// @desc    Login user & return JWT token
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ message: 'Please provide username and password' });
    }

    // Find user by username
    const user = await User.findOne({ username });

    if (!user) {
      await AuditLog.create({
        userId: null,
        action: 'LOGIN_FAILED',
        ipAddress: req.ip || '',
        details: { username, reason: 'User not found' },
      }).catch(() => {});
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      await AuditLog.create({
        userId: user._id,
        action: 'LOGIN_FAILED',
        ipAddress: req.ip || '',
        details: { username, reason: 'Invalid password' },
      }).catch(() => {});
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    await AuditLog.create({
      userId: user._id,
      action: 'LOGIN_SUCCESS',
      ipAddress: req.ip || '',
      details: { username },
    }).catch(() => {});

    const responsePayload = {
      _id: user._id,
      username: user.username,
      role: user.role,
      parentId: user.parentId,
      userType: user.userType || '',
      displayName: user.displayName || '',
      mobileNo: user.mobileNo || '',
      email: user.email || '',
      contactPerson: user.contactPerson || '',
      address: user.address || '',
      city: user.city || '',
      state: user.state || '',
      pincode: user.pincode || '',
      companyName: user.companyName,
      availableBalance: user.availableBalance,
      overDrawnAmount: user.overDrawnAmount,
      token: generateToken(user._id),
    };
    responsePayload.user = {
      _id: user._id,
      username: user.username,
      role: user.role,
      parentId: user.parentId,
      userType: user.userType || '',
      displayName: user.displayName || '',
      mobileNo: user.mobileNo || '',
      email: user.email || '',
      contactPerson: user.contactPerson || '',
      address: user.address || '',
      city: user.city || '',
      state: user.state || '',
      pincode: user.pincode || '',
      companyName: user.companyName,
      availableBalance: user.availableBalance,
      overDrawnAmount: user.overDrawnAmount,
    };
    res.json(responsePayload);
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/auth/me
// @desc    Get current logged-in user
// @access  Protected
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    console.error('Get me error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/auth/change-password
// @desc    Change user password
// @access  Protected
router.post('/change-password', protect, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: 'Please enter both old and new passwords' });
    }

    // Get user
    const user = await User.findById(req.user._id);

    // Verify old password
    const isMatch = await user.matchPassword(oldPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Old password is incorrect' });
    }

    // Set new password (pre-save hook will hash it)
    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/auth/update-profile
// @desc    Update user profile
// @access  Protected
router.put('/update-profile', protect, async (req, res) => {
  try {
    const { username, companyName } = req.body;

    const user = await User.findById(req.user._id);

    if (username) {
      if (username !== user.username) {
        const userExists = await User.findOne({ username });
        if (userExists) {
          return res.status(400).json({ message: 'Username is already taken' });
        }
        user.username = username;
      }
    }

    if (companyName !== undefined) {
      user.companyName = companyName;
    }

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      username: updatedUser.username,
      role: updatedUser.role,
      parentId: updatedUser.parentId,
      companyName: updatedUser.companyName,
      availableBalance: updatedUser.availableBalance,
      overDrawnAmount: updatedUser.overDrawnAmount,
    });
  } catch (error) {
    console.error('Update profile error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
