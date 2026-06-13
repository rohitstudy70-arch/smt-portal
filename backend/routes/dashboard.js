const express = require('express');
const Device = require('../models/Device');
const ActivationRequest = require('../models/ActivationRequest');
const CommonLayerRequest = require('../models/CommonLayerRequest');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/dashboard/stats
// @desc    Get dashboard statistics
// @access  Protected
router.get('/stats', protect, async (req, res) => {
  try {
    let totalDevices = 0;
    let totalDevicesWithSim = 0;
    let taisysDevices = 0;
    let activationStatus = {
      requested: 0,
      processing: 0,
      completed: 0,
      rejected: 0,
    };
    let commonLayerStatus = {
      pending: 0,
      processing: 0,
      completed: 0,
      rejected: 0,
    };
    let simActivationTransactions = 0;
    let commonLayerTransactions = 0;

    if (req.user.userType === 'End Customer') {
      const clRequests = await CommonLayerRequest.find({
        $or: [
          { customerId: req.user._id },
          { rmn: req.user.mobileNo },
          { endCustomerName: req.user.displayName }
        ]
      });

      const imeis = clRequests.map(r => r.imei).filter(Boolean);

      totalDevices = await Device.countDocuments({ imei: { $in: imeis } });
      totalDevicesWithSim = await Device.countDocuments({ imei: { $in: imeis }, hasSim: true });
      taisysDevices = await Device.countDocuments({ imei: { $in: imeis }, isTaisys: true });

      clRequests.forEach((item) => {
        const key = item.status.toLowerCase();
        if (commonLayerStatus.hasOwnProperty(key)) {
          commonLayerStatus[key]++;
        }
        if (item.status === 'Completed') {
          commonLayerTransactions += (item.piValue || 0);
        }
      });

      const actRequests = await ActivationRequest.find({
        $or: [
          { subDealerName: req.user.displayName },
          { subDealerName: req.user.username }
        ]
      });
      actRequests.forEach((item) => {
        const key = item.status.toLowerCase();
        if (activationStatus.hasOwnProperty(key)) {
          activationStatus[key]++;
        }
        if (item.status === 'Completed') {
          simActivationTransactions += (item.amount || 0);
        }
      });
    } else {
      const userId = req.user._id;
      totalDevices = await Device.countDocuments({ userId });
      totalDevicesWithSim = await Device.countDocuments({
        userId,
        hasSim: true,
      });
      taisysDevices = await Device.countDocuments({
        userId,
        isTaisys: true,
      });

      const activationStatusAgg = await ActivationRequest.aggregate([
        { $match: { userId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);
      activationStatusAgg.forEach((item) => {
        const key = item._id.toLowerCase();
        if (activationStatus.hasOwnProperty(key)) {
          activationStatus[key] = item.count;
        }
      });

      const commonLayerStatusAgg = await CommonLayerRequest.aggregate([
        { $match: { userId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);
      commonLayerStatusAgg.forEach((item) => {
        const key = item._id.toLowerCase();
        if (commonLayerStatus.hasOwnProperty(key)) {
          commonLayerStatus[key] = item.count;
        }
      });

      const simActivationTxAgg = await ActivationRequest.aggregate([
        { $match: { userId, status: 'Completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]);
      simActivationTransactions = simActivationTxAgg.length > 0 ? simActivationTxAgg[0].total : 0;

      const commonLayerTxAgg = await CommonLayerRequest.aggregate([
        { $match: { userId, status: 'Completed' } },
        { $group: { _id: null, total: { $sum: '$piValue' } } },
      ]);
      commonLayerTransactions = commonLayerTxAgg.length > 0 ? commonLayerTxAgg[0].total : 0;
    }

    res.json({
      totalDevices,
      totalDevicesWithSim,
      taisysDevices,
      activationStatus,
      commonLayerStatus,
      simActivationTransactions,
      commonLayerTransactions,
      availableBalance: req.user.userType === 'End Customer' ? 0 : req.user.availableBalance,
      overDrawnAmount: req.user.userType === 'End Customer' ? 0 : req.user.overDrawnAmount,
      companyName: req.user.displayName || req.user.companyName,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/dashboard/sim-expiry
// @desc    Get devices with SIM expiring in next 2 months
// @access  Protected
router.get('/sim-expiry', protect, async (req, res) => {
  try {
    const now = new Date();
    const twoMonthsLater = new Date();
    twoMonthsLater.setMonth(twoMonthsLater.getMonth() + 2);

    let query = {
      hasSim: true,
      simExpiryDate: { $gte: now, $lte: twoMonthsLater },
    };

    if (req.user.userType === 'End Customer') {
      const clRequests = await CommonLayerRequest.find({
        $or: [
          { customerId: req.user._id },
          { rmn: req.user.mobileNo },
          { endCustomerName: req.user.displayName }
        ]
      });
      const imeis = clRequests.map(r => r.imei).filter(Boolean);
      query.imei = { $in: imeis };
    } else {
      query.userId = req.user._id;
    }

    const devices = await Device.find(query).sort({ simExpiryDate: 1 });
    res.json(devices);
  } catch (error) {
    console.error('SIM expiry error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/dashboard/cl-expiry
// @desc    Get devices with CL expiring in next 2 months
// @access  Protected
router.get('/cl-expiry', protect, async (req, res) => {
  try {
    const now = new Date();
    const twoMonthsLater = new Date();
    twoMonthsLater.setMonth(twoMonthsLater.getMonth() + 2);

    let query = {
      clExpiryDate: { $gte: now, $lte: twoMonthsLater },
    };

    if (req.user.userType === 'End Customer') {
      const clRequests = await CommonLayerRequest.find({
        $or: [
          { customerId: req.user._id },
          { rmn: req.user.mobileNo },
          { endCustomerName: req.user.displayName }
        ]
      });
      const imeis = clRequests.map(r => r.imei).filter(Boolean);
      query.imei = { $in: imeis };
    } else {
      query.userId = req.user._id;
    }

    const devices = await Device.find(query).sort({ clExpiryDate: 1 });
    res.json(devices);
  } catch (error) {
    console.error('CL expiry error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
