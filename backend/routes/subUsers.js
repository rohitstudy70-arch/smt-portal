const express = require('express');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { getPortalRole, getDescendantUsers } = require('../middleware/hierarchy');

const router = express.Router();

// @route   GET /api/users/sub-users
// @desc    Get sub-users and dealers of current user
// @access  Protected
router.get('/sub-users', protect, async (req, res) => {
  try {
    const role = getPortalRole(req.user);
    if (role === 'CUSTOMER') {
      return res.status(403).json({ message: 'Access denied: Customers cannot access user management.' });
    }

    let subUsers;
    if (role === 'ADMIN') {
      subUsers = await User.find({}).select('-password');
    } else {
      subUsers = await getDescendantUsers(req.user._id);
    }
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
    const role = getPortalRole(req.user);
    if (role === 'CUSTOMER') {
      return res.status(403).json({ message: 'Access denied: Customers cannot access user management.' });
    }

    const { userType, displayName, mobileNo, email, username, password, parentId } = req.body;
    const allowedUserTypesByRole = {
      ADMIN: ['Dealer', 'Sub Dealer', 'End Customer'],
      DEALER: ['Sub Dealer', 'End Customer'],
      SUB_DEALER: ['End Customer'],
    };

    if (!userType || !displayName || !username || !password) {
      return res.status(400).json({ message: 'Please fill in all required fields' });
    }

    if (!allowedUserTypesByRole[role]?.includes(userType)) {
      return res.status(403).json({ message: 'Access denied: You cannot create this user type.' });
    }

    // Check if user already exists
    const userExists = await User.findOne({ username });
    if (userExists) {
      return res.status(400).json({ message: 'Username is already taken' });
    }

    // Determine parentId based on role
    let finalParentId = req.user._id;
    if (role === 'ADMIN') {
      if (userType === 'Dealer') {
        finalParentId = null;
      } else if (parentId) {
        finalParentId = parentId;
      }
    } else if (role === 'DEALER') {
      if (parentId) {
        const descendants = await getDescendantUsers(req.user._id);
        const descendantIds = descendants.map((d) => d._id.toString());
        if (!descendantIds.includes(parentId.toString()) && parentId.toString() !== req.user._id.toString()) {
          return res.status(403).json({ message: 'Access denied: Parent user must belong to your hierarchy.' });
        }
        finalParentId = parentId;
      }
    }

    // Create sub-user
    const subUser = await User.create({
      username,
      password, // will be hashed by pre-save hook
      role: 'customer',
      parentId: finalParentId,
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
    const role = getPortalRole(req.user);
    if (role === 'CUSTOMER') {
      return res.status(403).json({ message: 'Access denied: Customers cannot access user management.' });
    }

    const { userType, displayName, mobileNo, email, status } = req.body;

    const subUser = await User.findById(req.params.id);
    if (!subUser) {
      return res.status(404).json({ message: 'Sub-user not found' });
    }

    // Hierarchy check
    if (role !== 'ADMIN') {
      const descendants = await getDescendantUsers(req.user._id);
      const descendantIds = descendants.map((d) => d._id.toString());
      if (!descendantIds.includes(subUser._id.toString())) {
        return res.status(403).json({ message: 'Access denied: User is not in your hierarchy.' });
      }
    }

    if (userType) {
      if (role === 'SUB_DEALER' && userType !== 'End Customer') {
        return res.status(403).json({ message: 'Access denied: Sub Dealers can only manage End Customers.' });
      }
      if (role === 'DEALER' && userType === 'Dealer') {
        return res.status(403).json({ message: 'Access denied: Dealers cannot manage Dealers.' });
      }
      subUser.userType = userType;
    }

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
    const role = getPortalRole(req.user);
    if (role === 'CUSTOMER') {
      return res.status(403).json({ message: 'Access denied: Customers cannot access user management.' });
    }

    const subUser = await User.findById(req.params.id);
    if (!subUser) {
      return res.status(404).json({ message: 'Sub-user not found' });
    }

    // Hierarchy check
    if (role !== 'ADMIN') {
      const descendants = await getDescendantUsers(req.user._id);
      const descendantIds = descendants.map((d) => d._id.toString());
      if (!descendantIds.includes(subUser._id.toString())) {
        return res.status(403).json({ message: 'Access denied: User is not in your hierarchy.' });
      }
    }

    subUser.status = subUser.status === 'Active' ? 'Inactive' : 'Active';
    await subUser.save();

    res.json({ message: `Sub-user status updated to ${subUser.status}`, status: subUser.status });
  } catch (error) {
    console.error('Delete sub user error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/users/dealers
// @desc    Get list of dealers/customers for dropdown
// @access  Protected
router.get('/dealers', protect, async (req, res) => {
  try {
    const role = getPortalRole(req.user);
    let query = {};

    if (role === 'ADMIN') {
      query = {
        role: 'customer',
        userType: { $nin: ['Sub Dealer', 'End Customer'] },
      };
    } else if (role === 'DEALER') {
      query = { _id: req.user._id };
    } else if (role === 'SUB_DEALER') {
      if (req.user.parentId) {
        query = { _id: req.user.parentId };
      } else {
        query = { _id: req.user._id };
      }
    } else {
      return res.status(403).json({ message: 'Access denied: Customers cannot access dealer lists.' });
    }

    const dealers = await User.find(
      query,
      { _id: 1, displayName: 1, companyName: 1, username: 1, userType: 1, parentId: 1 }
    ).sort({ displayName: 1 });
    res.json(dealers);
  } catch (error) {
    console.error('Get dealers error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
