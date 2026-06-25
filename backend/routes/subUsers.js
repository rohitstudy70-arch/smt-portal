const express = require('express');
const User = require('../models/User');
const Device = require('../models/Device');
const { protect } = require('../middleware/auth');
const { getPortalRole, getDescendantUsers } = require('../middleware/hierarchy');

const router = express.Router();

const userManagementRoles = ['ADMIN', 'DEALER'];
const allowedCreateTypesByRole = {
  ADMIN: ['Dealer', 'Sub Dealer'],
  DEALER: ['Sub Dealer'],
};

const isSupportedUserType = (userType) => ['Dealer', 'Sub Dealer', 'Administration', ''].includes(userType || '');

// @route   GET /api/users/sub-users
// @desc    Get sub-users and dealers of current user
// @access  Protected
router.get('/sub-users', protect, async (req, res) => {
  try {
    const role = getPortalRole(req.user);
    if (!userManagementRoles.includes(role)) {
      return res.status(403).json({ message: 'Access denied: You cannot access user management.' });
    }

    let subUsers;
    if (role === 'ADMIN') {
      subUsers = await User.find({}).select('-password').lean();
    } else {
      const descendants = await getDescendantUsers(req.user._id);
      subUsers = descendants
        .map(d => d.toObject ? d.toObject() : d)
        .filter((user) => isSupportedUserType(user.userType));
    }

    // Fetch device counts for the matched users
    const userIds = subUsers.map((u) => u._id);
    const dealerCounts = await Device.aggregate([
      { $match: { dealerId: { $in: userIds } } },
      { $group: { _id: '$dealerId', count: { $sum: 1 } } },
    ]);
    const subDealerCounts = await Device.aggregate([
      { $match: { subDealerId: { $in: userIds } } },
      { $group: { _id: '$subDealerId', count: { $sum: 1 } } },
    ]);

    const dealerCountMap = {};
    dealerCounts.forEach((c) => {
      if (c._id) dealerCountMap[c._id.toString()] = c.count;
    });

    const subDealerCountMap = {};
    subDealerCounts.forEach((c) => {
      if (c._id) subDealerCountMap[c._id.toString()] = c.count;
    });

    subUsers = subUsers.map((user) => {
      const uId = user._id.toString();
      const userType = user.userType || 'Dealer';
      let deviceCount = 0;
      if (userType === 'Sub Dealer') {
        deviceCount = subDealerCountMap[uId] || 0;
      } else {
        deviceCount = dealerCountMap[uId] || 0;
      }
      return {
        ...user,
        deviceCount,
      };
    });

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
    if (!userManagementRoles.includes(role)) {
      return res.status(403).json({ message: 'Access denied: You cannot create users.' });
    }

    const { userType, displayName, mobileNo, email, username, password, parentId } = req.body;

    if (!userType || !displayName || !username || !password) {
      return res.status(400).json({ message: 'Please fill in all required fields' });
    }

    const allowedUserTypes = allowedCreateTypesByRole[role] || [];

    if (!allowedUserTypes.includes(userType)) {
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
      } else if (userType === 'Sub Dealer') {
        if (!parentId) {
          return res.status(400).json({ message: 'Please select a dealer for this Sub Dealer.' });
        }
        const dealer = await User.findById(parentId).select('-password');
        if (!dealer || getPortalRole(dealer) !== 'DEALER') {
          return res.status(400).json({ message: 'Please select a valid dealer for this Sub Dealer.' });
        }
        finalParentId = dealer._id;
      }
    } else if (role === 'DEALER') {
      finalParentId = req.user._id;
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
    if (!userManagementRoles.includes(role)) {
      return res.status(403).json({ message: 'Access denied: You cannot manage users.' });
    }

    const { userType, displayName, mobileNo, email, status } = req.body;

    const subUser = await User.findById(req.params.id);
    if (!subUser) {
      return res.status(404).json({ message: 'Sub-user not found' });
    }

    const targetRole = getPortalRole(subUser);
    if (subUser._id.toString() === req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied: You cannot manage your own profile here.' });
    }

    // Hierarchy check
    if (role !== 'ADMIN') {
      const descendants = await getDescendantUsers(req.user._id);
      const descendantIds = descendants.map((d) => d._id.toString());
      if (!descendantIds.includes(subUser._id.toString())) {
        return res.status(403).json({ message: 'Access denied: User is not in your hierarchy.' });
      }
    }

    // Administration restriction
    if (req.user.userType === 'Administration') {
      if (targetRole === 'ADMIN' || subUser.userType === 'Administration') {
        return res.status(403).json({ message: 'Access denied: Administration users cannot manage Admin/Administration accounts.' });
      }
    }

    if (role === 'DEALER' && targetRole !== 'SUB_DEALER') {
      return res.status(403).json({ message: 'Access denied: Dealers can only manage Sub Dealers.' });
    }

    if (userType) {
      const allowedUserTypes = allowedCreateTypesByRole[role] || [];
      if (!allowedUserTypes.includes(userType)) {
        return res.status(403).json({ message: 'Access denied: You cannot assign this user type.' });
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
    if (!userManagementRoles.includes(role)) {
      return res.status(403).json({ message: 'Access denied: You cannot manage users.' });
    }

    const subUser = await User.findById(req.params.id);
    if (!subUser) {
      return res.status(404).json({ message: 'Sub-user not found' });
    }

    const targetRole = getPortalRole(subUser);
    if (subUser._id.toString() === req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied: You cannot manage your own profile here.' });
    }

    // Hierarchy check
    if (role !== 'ADMIN') {
      const descendants = await getDescendantUsers(req.user._id);
      const descendantIds = descendants.map((d) => d._id.toString());
      if (!descendantIds.includes(subUser._id.toString())) {
        return res.status(403).json({ message: 'Access denied: User is not in your hierarchy.' });
      }
    }

    // Administration restriction
    if (req.user.userType === 'Administration') {
      if (targetRole === 'ADMIN' || subUser.userType === 'Administration') {
        return res.status(403).json({ message: 'Access denied: Administration users cannot manage Admin/Administration accounts.' });
      }
    }

    if (role === 'DEALER' && targetRole !== 'SUB_DEALER') {
      return res.status(403).json({ message: 'Access denied: Dealers can only manage Sub Dealers.' });
    }

    subUser.status = subUser.status === 'Active' ? 'Inactive' : 'Active';
    await subUser.save();

    res.json({ message: `Sub-user status updated to ${subUser.status}`, status: subUser.status });
  } catch (error) {
    console.error('Delete sub user error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/users/sub-user/:id/permanent
// @desc    Permanently delete a sub-user
// @access  Protected
router.delete('/sub-user/:id/permanent', protect, async (req, res) => {
  try {
    const role = getPortalRole(req.user);
    if (!userManagementRoles.includes(role)) {
      return res.status(403).json({ message: 'Access denied: You cannot delete users.' });
    }

    const subUser = await User.findById(req.params.id);
    if (!subUser) {
      return res.status(404).json({ message: 'Sub-user not found' });
    }

    const targetRole = getPortalRole(subUser);
    if (!targetRole) {
      return res.status(403).json({ message: 'Access denied: Unsupported account type.' });
    }

    if (subUser._id.toString() === req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied: You cannot delete your own profile.' });
    }

    // Enforce role-based deletion authority
    if (targetRole === 'DEALER') {
      if (role !== 'ADMIN') {
        return res.status(403).json({ message: 'Access denied: Only Admins can delete Dealers.' });
      }
    } else if (targetRole === 'SUB_DEALER') {
      if (role !== 'ADMIN' && role !== 'DEALER') {
        return res.status(403).json({ message: 'Access denied: Only Admins and Dealers can delete Sub Dealers.' });
      }
    } else {
      return res.status(403).json({ message: 'Access denied: Unsupported account type.' });
    }

    // Hierarchy check
    if (role !== 'ADMIN') {
      const descendants = await getDescendantUsers(req.user._id);
      const descendantIds = descendants.map((d) => d._id.toString());
      if (!descendantIds.includes(subUser._id.toString())) {
        return res.status(403).json({ message: 'Access denied: User is not in your hierarchy.' });
      }
    }

    // Administration restriction
    if (req.user.userType === 'Administration') {
      const targetRole = getPortalRole(subUser);
      if (targetRole === 'ADMIN' || subUser.userType === 'Administration') {
        return res.status(403).json({ message: 'Access denied: Administration users cannot manage Admin/Administration accounts.' });
      }
    }

    // Cleanup device assignments/references
    const Device = require('../models/Device');
    if (targetRole === 'DEALER') {
      await Device.updateMany({ dealerId: subUser._id }, { $set: { dealerId: null, dealerName: '', assignedTo: null } });
    } else if (targetRole === 'SUB_DEALER') {
      await Device.updateMany({ subDealerId: subUser._id }, { $set: { subDealerId: null, subDealerName: '', assignedTo: null } });
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({ message: 'User permanently deleted successfully.' });
  } catch (error) {
    console.error('Delete sub user permanent error:', error.message);
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
        userType: { $nin: ['Sub Dealer', 'Administration'] },
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
      return res.status(403).json({ message: 'Access denied: You cannot access dealer lists.' });
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
