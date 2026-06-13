const express = require('express');
const Device = require('../models/Device');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/devices
// @desc    Get devices of current user (assigned or unassigned)
// @access  Protected
router.get('/', protect, async (req, res) => {
  try {
    const { status, assignedTo, vendor, search, limit = 10, page = 1 } = req.query;

    const query = {};
    if (req.user.role !== 'partner') {
      query.userId = req.user._id;
    }

    // Assigned vs Unassigned filter
    if (search) {
      // Ignore tab filters on search, but keep user/assignedTo filter if explicitly chosen
      if (assignedTo) {
        query.assignedTo = assignedTo;
      }
    } else {
      if (status === 'Assigned') {
        query.assignedTo = { $ne: null };
        if (assignedTo) {
          query.assignedTo = assignedTo;
        }
      } else if (status === 'Unassigned') {
        query.assignedTo = null;
      }
    }

    // Vendor filter
    if (vendor) {
      query.vendor = vendor;
    }

    // Search query (IMEI, ICCID, Serial No)
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { imei: searchRegex },
        { iccid: searchRegex },
        { serialNo: searchRegex },
        { msisdn1: searchRegex },
        { msisdn2: searchRegex }
      ];
    }

    const options = {
      limit: parseInt(limit, 10),
      skip: (parseInt(page, 10) - 1) * parseInt(limit, 10),
      sort: { createdAt: -1 }
    };

    const devices = await Device.find(query, null, options).populate('assignedTo', 'displayName username');
    const total = await Device.countDocuments(query);

    res.json({
      devices,
      total,
      pages: Math.ceil(total / limit),
      currentPage: parseInt(page, 10)
    });
  } catch (error) {
    console.error('Get devices error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/devices/assign
// @desc    Assign device(s) to a sub-user
// @access  Protected
router.post('/assign', protect, async (req, res) => {
  try {
    const { subUserId, type, fileContent, imeisText } = req.body;

    if (!subUserId) {
      return res.status(400).json({ message: 'Please select a sub-user' });
    }

    const subUser = await User.findOne({ _id: subUserId, parentId: req.user._id });
    if (!subUser) {
      return res.status(404).json({ message: 'Selected sub-user not found' });
    }

    // Parse list of IMEIs or choose a batch of unassigned devices
    let targetImeis = [];
    if (imeisText) {
      const inputImeis = imeisText.split(/[\s,;\n]+/).map(i => i.trim()).filter(Boolean);
      
      // Resolve any partial IMEIs (like 6-digits) to the customer's full IMEI in the database
      for (const inputImei of inputImeis) {
        if (inputImei.length < 15) {
          const matched = await Device.findOne({
            userId: req.user._id,
            $or: [
              { imei: new RegExp(inputImei, 'i') },
              { iccid: new RegExp(inputImei, 'i') }
            ]
          });
          if (matched) {
            targetImeis.push(matched.imei);
          } else {
            targetImeis.push(inputImei); // fallback if not found
          }
        } else {
          targetImeis.push(inputImei);
        }
      }
    }

    // If no IMEIs are supplied, we will assign a batch of 5 devices for demo/test purposes
    if (targetImeis.length === 0) {
      const batch = await Device.find({ userId: req.user._id, assignedTo: null }).limit(5);
      if (batch.length === 0) {
        return res.status(400).json({ message: 'No unassigned devices available to assign.' });
      }
      targetImeis = batch.map(d => d.imei);
    }

    const action = type || 'Assign';

    if (action === 'Assign') {
      // Set assignedTo to subUserId
      const result = await Device.updateMany(
        { userId: req.user._id, imei: { $in: targetImeis } },
        { $set: { assignedTo: subUserId } }
      );
      return res.json({ 
        message: `Successfully assigned ${result.modifiedCount} devices to ${subUser.displayName || subUser.username}`
      });
    } else {
      // Unassign: Set assignedTo back to null
      const result = await Device.updateMany(
        { userId: req.user._id, imei: { $in: targetImeis }, assignedTo: subUserId },
        { $set: { assignedTo: null } }
      );
      return res.json({ 
        message: `Successfully unassigned ${result.modifiedCount} devices from ${subUser.displayName || subUser.username}`
      });
    }
  } catch (error) {
    console.error('Assign devices error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
