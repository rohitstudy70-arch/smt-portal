const express = require('express');
const User = require('../models/User');
const Device = require('../models/Device');
const { protect } = require('../middleware/auth');
const { getPortalRole, getDescendantUsers } = require('../middleware/hierarchy');

const router = express.Router();

const userManagementRoles = ['ADMIN', 'DEALER'];
const getAllowedCreateTypes = (user) => {
  const role = getPortalRole(user);
  if (role === 'ADMIN') {
    return ['Administration', 'Dealer', 'Sub Dealer'];
  }
  if (role === 'DEALER') {
    return ['Sub Dealer'];
  }
  return [];
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
      // Auto-ensure that ArshiEnterprises and admin are strictly set as Administration admins
      await User.updateMany(
        { username: { $in: ['admin', 'ArshiEnterprises'] } },
        { $set: { role: 'partner', userType: 'Administration', status: 'Active' } }
      );

      // Ensure any Admin/partner accounts are properly labeled Administration
      await User.updateMany(
        { role: 'partner', userType: { $ne: 'Administration' } },
        { $set: { userType: 'Administration' } }
      );

      // Auto-ensure that any Admin/Administration account is set to Active if accidentally marked Inactive
      await User.updateMany(
        {
          $or: [
            { username: 'admin' },
            { username: 'ArshiEnterprises' },
            { role: 'partner' },
            { userType: 'Administration' },
          ],
          status: { $in: ['Inactive', 'inactive', '', null] },
        },
        { $set: { status: 'Active' } }
      );

      // Ensure any missing status defaults to Active
      await User.updateMany(
        { status: { $in: ['', null] } },
        { $set: { status: 'Active' } }
      );

      subUsers = await User.find({}).select('-password').lean();
    } else {
      const descendants = await getDescendantUsers(req.user._id);
      subUsers = descendants
        .map(d => d.toObject ? d.toObject() : d)
        .filter((user) => {
          if (!isSupportedUserType(user.userType)) return false;
          // Strict parentId check: Sub Dealers must directly belong to this dealer.
          // This prevents showing Sub Dealers of other dealers (e.g. HOD Dealer's sub dealers).
          if (user.userType === 'Sub Dealer') {
            const parentIdStr = user.parentId ? user.parentId.toString() : null;
            return parentIdStr === req.user._id.toString();
          }
          return true;
        });
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

// Aliases for /dealers and /
router.get('/dealers', protect, (req, res, next) => {
  // Redirect to sub-users handler
  req.url = '/sub-users';
  router.handle(req, res, next);
});
router.get('/', protect, (req, res, next) => {
  req.url = '/sub-users';
  router.handle(req, res, next);
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

    const { 
      userType, 
      displayName, 
      mobileNo, 
      email, 
      username, 
      password, 
      parentId,
      state,
      gstNo,
      panNo,
      address,
      city,
      pincode,
      companyName,
    } = req.body;

    if (!userType || !displayName || !username || !password) {
      return res.status(400).json({ message: 'Please fill in all required fields' });
    }

    const allowedUserTypes = getAllowedCreateTypes(req.user);

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
      if (userType === 'Dealer' || userType === 'Administration') {
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

    // Create sub-user with state, GST, PAN, and address
    const subUser = await User.create({
      username,
      password, // will be hashed by pre-save hook
      role: 'customer',
      parentId: finalParentId,
      userType,
      displayName,
      companyName: companyName || displayName || '',
      mobileNo: mobileNo || '',
      email: email || '',
      state: state || 'Bihar',
      gstNo: (gstNo || '').trim().toUpperCase(),
      panNo: (panNo || '').trim().toUpperCase(),
      address: address || '',
      city: city || '',
      pincode: pincode || '',
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
    if (role !== 'ADMIN') {
      return res.status(403).json({ message: 'Access denied: Only Admins are allowed to edit users.' });
    }

    const { 
      userType, 
      displayName, 
      mobileNo, 
      email, 
      status, 
      username,
      password,
      state,
      gstNo,
      panNo,
      address,
      city,
      pincode,
      companyName,
    } = req.body;

    const subUser = await User.findById(req.params.id);
    if (!subUser) {
      return res.status(404).json({ message: 'Sub-user not found' });
    }

    const targetRole = getPortalRole(subUser);
    const isSelf = subUser._id.toString() === req.user._id.toString();

    if (isSelf) {
      if (status && status !== 'Active') {
        return res.status(400).json({ message: 'You cannot deactivate your own logged-in account.' });
      }
      if (userType && userType !== subUser.userType) {
        return res.status(400).json({ message: 'You cannot change your own user type here.' });
      }
    }

    // Hierarchy check for non-admins
    if (role !== 'ADMIN') {
      const descendants = await getDescendantUsers(req.user._id);
      const descendantIds = descendants.map((d) => d._id.toString());
      if (!descendantIds.includes(subUser._id.toString())) {
        return res.status(403).json({ message: 'Access denied: User is not in your hierarchy.' });
      }
    }

    if (role === 'DEALER' && targetRole !== 'SUB_DEALER') {
      return res.status(403).json({ message: 'Access denied: Dealers can only manage Sub Dealers.' });
    }

    if (userType) {
      const allowedUserTypes = getAllowedCreateTypes(req.user);
      if (!allowedUserTypes.includes(userType)) {
        return res.status(403).json({ message: 'Access denied: You cannot assign this user type.' });
      }
      subUser.userType = userType;
    }

    if (displayName !== undefined) subUser.displayName = displayName;
    if (companyName !== undefined) subUser.companyName = companyName;
    if (mobileNo !== undefined) subUser.mobileNo = mobileNo;
    if (email !== undefined) subUser.email = email;
    if (state !== undefined) subUser.state = state;
    if (gstNo !== undefined) subUser.gstNo = String(gstNo).trim().toUpperCase();
    if (panNo !== undefined) subUser.panNo = String(panNo).trim().toUpperCase();
    if (address !== undefined) subUser.address = address;
    if (city !== undefined) subUser.city = city;
    if (pincode !== undefined) subUser.pincode = pincode;
    if (status) subUser.status = status;

    if (username !== undefined) {
      const trimmedUsername = String(username).trim();
      if (!trimmedUsername) {
        return res.status(400).json({ message: 'Username cannot be empty.' });
      }
      if (trimmedUsername !== subUser.username) {
        const usernameExists = await User.findOne({ username: trimmedUsername });
        if (usernameExists) {
          return res.status(400).json({ message: 'Username is already taken.' });
        }
        subUser.username = trimmedUsername;
      }
    }

    if (password && typeof password === 'string' && password.trim().length > 0) {
      subUser.password = password.trim();
    }

    if (subUser.userType === 'Dealer' || subUser.userType === 'Administration') {
      subUser.parentId = null;
    } else if (subUser.userType === 'Sub Dealer' && role === 'ADMIN') {
      if (req.body.parentId !== undefined) {
        const parentId = req.body.parentId;
        if (parentId) {
          const dealer = await User.findById(parentId).select('-password');
          if (!dealer || getPortalRole(dealer) !== 'DEALER') {
            return res.status(400).json({ message: 'Please select a valid dealer for this Sub Dealer.' });
          }
          subUser.parentId = dealer._id;
        } else {
          return res.status(400).json({ message: 'Please select a valid parent dealer for this Sub Dealer.' });
        }
      }
    }

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
    if (role !== 'ADMIN') {
      return res.status(403).json({ message: 'Access denied: Only Admins are allowed to manage user status.' });
    }

    const subUser = await User.findById(req.params.id);
    if (!subUser) {
      return res.status(404).json({ message: 'Sub-user not found' });
    }

    const targetRole = getPortalRole(subUser);
    const isSelf = subUser._id.toString() === req.user._id.toString();

    if (isSelf) {
      if (subUser.status === 'Inactive' || subUser.status === 'inactive') {
        subUser.status = 'Active';
        await subUser.save();
        return res.json({ message: 'Your admin account has been activated!', status: 'Active' });
      }
      return res.status(400).json({ message: 'You cannot deactivate your own logged-in account.' });
    }

    // Hierarchy check for non-admins
    if (role !== 'ADMIN') {
      const descendants = await getDescendantUsers(req.user._id);
      const descendantIds = descendants.map((d) => d._id.toString());
      if (!descendantIds.includes(subUser._id.toString())) {
        return res.status(403).json({ message: 'Access denied: User is not in your hierarchy.' });
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
    if (role !== 'ADMIN') {
      return res.status(403).json({ message: 'Access denied: Only Admins are allowed to delete users.' });
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

    // If target is an Administration/Admin account
    if (targetRole === 'ADMIN' || subUser.userType === 'Administration' || subUser.role === 'partner') {
      // Protect against deleting the only remaining Admin account
      const remainingAdmins = await User.countDocuments({
        _id: { $ne: subUser._id },
        $or: [{ role: 'partner' }, { userType: 'Administration' }],
      });
      if (remainingAdmins < 1) {
        return res.status(400).json({ message: 'Cannot delete the only remaining Admin account in the system.' });
      }
    } else if (targetRole === 'DEALER') {
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

    // Hierarchy check for non-admins
    if (role !== 'ADMIN') {
      const descendants = await getDescendantUsers(req.user._id);
      const descendantIds = descendants.map((d) => d._id.toString());
      if (!descendantIds.includes(subUser._id.toString())) {
        return res.status(403).json({ message: 'Access denied: User is not in your hierarchy.' });
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
        role: { $ne: 'partner' },
        userType: { $nin: ['Sub Dealer', 'Administration'] },
        username: { $nin: ['admin', 'ArshiEnterprises'] },
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
      { 
        _id: 1, 
        displayName: 1, 
        companyName: 1, 
        username: 1, 
        userType: 1, 
        parentId: 1,
        state: 1,
        gstNo: 1,
        panNo: 1,
        address: 1,
        city: 1,
        pincode: 1,
        mobileNo: 1,
        email: 1
      }
    ).sort({ displayName: 1 });
    res.json(dealers);
  } catch (error) {
    console.error('Get dealers error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
