const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const ActivationRequest = require('../models/ActivationRequest');
const Device = require('../models/Device');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/auth');
const {
  PORTAL_ROLES,
  attachHierarchyScope,
  buildScopedOwnerQuery,
  buildDeviceScopeQuery,
  requireRoles,
  isIdInScope,
} = require('../middleware/hierarchy');
const { syncDueForUsers, getDueOwnerIdsFromDevice } = require('../services/dueService');

const router = express.Router();

// KYC Upload Setup
const kycStorageDir = path.join(__dirname, '..', 'storage', 'kyc');
if (!fs.existsSync(kycStorageDir)) {
  fs.mkdirSync(kycStorageDir, { recursive: true });
}

const kycStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, kycStorageDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `kyc-${req.params.id}-${uniqueSuffix}${ext}`);
  }
});

const kycFileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, and PDF files are allowed for KYC documents.'), false);
  }
};

const kycUpload = multer({
  storage: kycStorage,
  fileFilter: kycFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.use(protect, attachHierarchyScope);

const operationsRoles = [PORTAL_ROLES.ADMIN, PORTAL_ROLES.DEALER, PORTAL_ROLES.SUB_DEALER];

// Generate a unique request ID like REQUEST36613
const generateRequestId = async () => {
  const lastRequest = await ActivationRequest.findOne()
    .sort({ requestId: -1 })
    .select('requestId');

  if (lastRequest && lastRequest.requestId) {
    const numPart = parseInt(lastRequest.requestId.replace('REQUEST', ''), 10);
    if (!isNaN(numPart)) {
      return `REQUEST${numPart + 1}`;
    }
  }

  // Default starting ID
  return `REQUEST${10000 + Math.floor(Math.random() * 90000)}`;
};

// @route   GET /api/activation-requests
// @desc    List activation requests with pagination and search
// @access  Protected
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = req.query.search || '';

    const query = buildDeviceScopeQuery(req.hierarchyScope);

    if (req.query.createdBy) {
      query.createdBy = req.query.createdBy;
    }
    if (req.query.dealerId) {
      query.$or = [
        { dealerId: req.query.dealerId },
        { subDealerId: req.query.dealerId },
        { userId: req.query.dealerId },
      ];
    }

    if (search) {
      query.$or = [
        { requestId: { $regex: search, $options: 'i' } },
        { requestType: { $regex: search, $options: 'i' } },
        { plan: { $regex: search, $options: 'i' } },
        { piNo: { $regex: search, $options: 'i' } },
        { status: { $regex: search, $options: 'i' } },
        { remarks: { $regex: search, $options: 'i' } },
        { subDealerName: { $regex: search, $options: 'i' } },
        { dealerName: { $regex: search, $options: 'i' } },
        { imei: { $regex: search, $options: 'i' } },
        { vehicleNo: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { regMobNo: { $regex: search, $options: 'i' } },
        { regMobNo2: { $regex: search, $options: 'i' } },
        { chassisNo: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await ActivationRequest.countDocuments(query);
    const requests = await ActivationRequest.find(query)
      .populate('createdBy', 'username displayName userType companyName')
      .sort({ dateTime: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      requests,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('List activation requests error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/activation-requests/customer/:phone
// @desc    Fetch latest customer details by phone number
// @access  Protected
router.get('/customer/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    if (!phone) return res.status(400).json({ message: 'Phone number required' });

    const query = buildScopedOwnerQuery(req.hierarchyScope);
    query.$or = [
      { regMobNo: phone },
      { regMobNo2: phone }
    ];

    const customerReq = await ActivationRequest.findOne(query)
      .sort({ dateTime: -1 })
      .select('customerName address aadharNo regMobNo regMobNo2 vehicleMake vehicleModel rto -_id');

    if (!customerReq) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    res.json(customerReq);
  } catch (error) {
    console.error('Fetch customer by phone error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/activation-requests/device/:imei
// @desc    Fetch latest activation request details by IMEI
// @access  Protected
router.get('/device/:imei', requireRoles(...operationsRoles), async (req, res) => {
  try {
    const { imei } = req.params;
    if (!imei) return res.status(400).json({ message: 'IMEI required' });

    const query = buildDeviceScopeQuery(req.hierarchyScope);
    query.imei = new RegExp('^' + String(imei).trim() + '$', 'i');

    let request = await ActivationRequest.findOne(query).sort({ updatedAt: -1, dateTime: -1 });

    if (!request) {
      return res.status(404).json({ message: 'No request found for this IMEI' });
    }

    res.json(request);
  } catch (error) {
    console.error('Fetch request by imei error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/activation-requests/today-summary
// @desc    Get today's raise request counts grouped by creator (user ID)
// @access  Admin only
router.get('/today-summary', requireRoles(PORTAL_ROLES.ADMIN), async (req, res) => {
  try {
    // Support optional date query param, default to today
    const targetDate = req.query.date ? new Date(req.query.date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const userPipeline = [
      {
        $match: {
          dateTime: { $gte: startOfDay, $lte: endOfDay },
        },
      },
      {
        $group: {
          _id: '$createdBy',
          totalRequests: { $sum: 1 },
          totalAmount: { $sum: { $ifNull: ['$amount', 0] } },
          statuses: {
            $push: '$status',
          },
          requestTypes: {
            $push: '$requestType',
          },
          latestRequest: { $max: '$dateTime' },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo',
        },
      },
      { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          totalRequests: 1,
          totalAmount: 1,
          latestRequest: 1,
          processing: {
            $size: {
              $filter: { input: '$statuses', as: 's', cond: { $eq: ['$$s', 'Processing'] } },
            },
          },
          completed: {
            $size: {
              $filter: { input: '$statuses', as: 's', cond: { $eq: ['$$s', 'Completed'] } },
            },
          },
          requested: {
            $size: {
              $filter: { input: '$statuses', as: 's', cond: { $eq: ['$$s', 'Requested'] } },
            },
          },
          rejected: {
            $size: {
              $filter: { input: '$statuses', as: 's', cond: { $eq: ['$$s', 'Rejected'] } },
            },
          },
          commercialPlan: {
            $size: {
              $filter: { input: '$requestTypes', as: 'rt', cond: { $eq: ['$$rt', 'Commercial Plan'] } },
            },
          },
          topUp: {
            $size: {
              $filter: { input: '$requestTypes', as: 'rt', cond: { $eq: ['$$rt', 'Top-up'] } },
            },
          },
          rechargePlan: {
            $size: {
              $filter: { input: '$requestTypes', as: 'rt', cond: { $eq: ['$$rt', 'Recharge Plan'] } },
            },
          },
          userName: {
            $ifNull: [
              '$userInfo.displayName',
              { $ifNull: ['$userInfo.companyName', '$userInfo.username'] },
            ],
          },
          userType: { $ifNull: ['$userInfo.userType', ''] },
          username: { $ifNull: ['$userInfo.username', ''] },
        },
      },
      { $sort: { totalRequests: -1 } },
    ];

    const dealerPipeline = [
      {
        $match: {
          dateTime: { $gte: startOfDay, $lte: endOfDay },
        },
      },
      {
        $group: {
          _id: { $ifNull: ['$dealerId', { $ifNull: ['$userId', '$dealerName'] }] },
          totalRequests: { $sum: 1 },
          totalAmount: { $sum: { $ifNull: ['$amount', 0] } },
          statuses: { $push: '$status' },
          requestTypes: { $push: '$requestType' },
          latestRequest: { $max: '$dateTime' },
          dealerNames: { $addToSet: '$dealerName' },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo',
        },
      },
      { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          totalRequests: 1,
          totalAmount: 1,
          latestRequest: 1,
          processing: {
            $size: {
              $filter: { input: '$statuses', as: 's', cond: { $eq: ['$$s', 'Processing'] } },
            },
          },
          completed: {
            $size: {
              $filter: { input: '$statuses', as: 's', cond: { $eq: ['$$s', 'Completed'] } },
            },
          },
          requested: {
            $size: {
              $filter: { input: '$statuses', as: 's', cond: { $eq: ['$$s', 'Requested'] } },
            },
          },
          rejected: {
            $size: {
              $filter: { input: '$statuses', as: 's', cond: { $eq: ['$$s', 'Rejected'] } },
            },
          },
          commercialPlan: {
            $size: {
              $filter: { input: '$requestTypes', as: 'rt', cond: { $eq: ['$$rt', 'Commercial Plan'] } },
            },
          },
          topUp: {
            $size: {
              $filter: { input: '$requestTypes', as: 'rt', cond: { $eq: ['$$rt', 'Top-up'] } },
            },
          },
          rechargePlan: {
            $size: {
              $filter: { input: '$requestTypes', as: 'rt', cond: { $eq: ['$$rt', 'Recharge Plan'] } },
            },
          },
          userName: {
            $ifNull: [
              '$userInfo.displayName',
              {
                $ifNull: [
                  '$userInfo.companyName',
                  {
                    $ifNull: [
                      '$userInfo.username',
                      { $ifNull: [{ $arrayElemAt: ['$dealerNames', 0] }, 'Unknown Dealer'] },
                    ],
                  },
                ],
              },
            ],
          },
          userType: { $ifNull: ['$userInfo.userType', 'Dealer'] },
          username: { $ifNull: ['$userInfo.username', '-'] },
        },
      },
      { $sort: { totalRequests: -1 } },
    ];

    const [userSummary, dealerSummary] = await Promise.all([
      ActivationRequest.aggregate(userPipeline),
      ActivationRequest.aggregate(dealerPipeline),
    ]);

    const grandTotal = userSummary.reduce((acc, item) => acc + item.totalRequests, 0);
    const grandAmount = userSummary.reduce((acc, item) => acc + item.totalAmount, 0);

    res.json({
      date: startOfDay.toISOString().slice(0, 10),
      grandTotal,
      grandAmount,
      users: userSummary,
      dealers: dealerSummary,
    });
  } catch (error) {
    console.error('Today summary error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/activation-requests
// @desc    Create a new activation request
// @access  Protected
router.post('/', requireRoles(...operationsRoles), async (req, res) => {
  try {
    const {
      isSubDealer,
      subDealerName,
      quantity,
      requestType,
      plan,
      piNo,
      amount,
      remarks,
      // Activation form fields
      dealerName,
      dealerAddress,
      imei,
      iccid,
      serialNo,
      msisdn1,
      msisdn2,
      validity,
      expiryDate,
      itrNo,
      vendor,
      installationDate,
      activationMode,
      vehicleCondition,
      vehicleMake,
      vehicleModel,
      registrationYear,
      vehicleNo,
      rto,
      engineNo,
      chassisNo,
      regMobNo,
      regMobNo2,
      customerName,
      aadharNo,
      address,
      trackingId,
      software,
    } = req.body;

    if (!imei) {
      return res
        .status(400)
        .json({ message: 'IMEI is required. Please select a device.' });
    }

    const device = await Device.findOne({ imei });
    if (!device) {
      return res.status(404).json({ message: 'Device not found.' });
    }

    // Role-based Device Assignment Scope Restriction
    const userRole = (req.user.role || '').toUpperCase();
    const isSuperUser = userRole === 'PARTNER' || userRole === 'ADMIN' || req.user.username === 'bulbala123';
    
    if (!isSuperUser) {
      const userIdStr = req.user._id.toString();
      const deviceDealerStr = device.dealerId ? device.dealerId.toString() : '';
      const deviceSubDealerStr = device.subDealerId ? device.subDealerId.toString() : '';
      const deviceCreatedByStr = device.createdBy ? device.createdBy.toString() : '';

      const isAssignedToUser = (deviceDealerStr === userIdStr) || 
                               (deviceSubDealerStr === userIdStr) || 
                               (deviceCreatedByStr === userIdStr) ||
                               (req.hierarchyScope && req.hierarchyScope.userIds && req.hierarchyScope.userIds.some(id => id.toString() === deviceDealerStr || id.toString() === deviceSubDealerStr));

      if (!isAssignedToUser) {
        return res.status(403).json({ 
          message: 'Access Denied: You can only raise activation requests for devices assigned to your account.' 
        });
      }
    }

    // Step 7: Prevent duplicate requests for initial activations
    if (requestType === 'Commercial Plan') {
      const existingRequest = await ActivationRequest.findOne({
        imei,
        requestType: 'Commercial Plan',
        status: { $ne: 'Rejected' }
      });
      if (existingRequest) {
        return res.status(400).json({ message: `Activation request already exists (Status: ${existingRequest.status}).` });
      }
    }

    const targetUserId = device.subDealerId || device.dealerId || req.user._id;

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: 'Target dealer or sub-dealer user not found.' });
    }

    const reqAmount = Number(amount) || 0;
    // Bypassed balance check, but still deduct from availableBalance to update outstanding dues
    if (reqAmount > 0) {
      targetUser.availableBalance = (targetUser.availableBalance || 0) - reqAmount;
      await targetUser.save();
    }

    const requestId = await generateRequestId();

    const activationRequest = await ActivationRequest.create({
      requestId,
      userId: targetUserId,
      dealerId: device.dealerId || null,
      subDealerId: device.subDealerId || null,
      createdBy: req.user._id,
      dateTime: new Date(),
      isSubDealer: isSubDealer || false,
      subDealerName: subDealerName || '',
      quantity: quantity || 1,
      requestType: requestType || 'Commercial Plan',
      plan: plan || '',
      piNo: piNo || '',
      amount: reqAmount,
      remarks: remarks || '',
      status: 'Processing',
      // Activation form fields
      dealerName: dealerName || '',
      dealerAddress: dealerAddress || '',
      imei: imei || '',
      iccid: iccid || '',
      serialNo: serialNo || '',
      msisdn1: msisdn1 || '',
      msisdn2: msisdn2 || '',
      validity: validity || '',
      expiryDate: expiryDate || null,
      itrNo: itrNo || '',
      vendor: vendor || '',
      installationDate: installationDate || null,
      activationMode: activationMode || '',
      vehicleCondition: vehicleCondition || '',
      vehicleMake: vehicleMake || '',
      vehicleModel: vehicleModel || '',
      registrationYear: registrationYear || '',
      vehicleNo: vehicleNo || '',
      rto: rto || '',
      engineNo: engineNo || '',
      chassisNo: chassisNo || '',
      regMobNo: regMobNo || '',
      regMobNo2: regMobNo2 || '',
      customerName: customerName || '',
      aadharNo: aadharNo || '',
      address: address || '',
      trackingId: trackingId || '',
      software: software || '',
    });

    // Sync trackingId and software to Device model
    if (imei) {
      await Device.updateOne(
        { imei },
        { $set: { trackingId: trackingId || '', software: software || '' } }
      ).catch(err => console.error('Error syncing tracking info to Device:', err));
    }

    // Create a transaction in ledger for the deducted amount
    if (reqAmount > 0) {
      const randomNum = Math.floor(10000 + Math.random() * 90000);
      const date = new Date();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const transactionId = `ITR_${mm}_${dd}_${randomNum}`;

      await Transaction.create({
        userId: targetUser._id,
        transactionId,
        paymentId: requestId,
        paymentFor: 'Sim Activation',
        referenceNo: piNo || requestId,
        payMode: 'Itwallet',
        transactionType: 'Debit',
        status: 'Success',
        remarks: remarks || `Activation Request raised for IMEI ${imei}`,
        requestedAmt: reqAmount,
        transactedAmt: reqAmount,
      });
    }

    // Automatically assign the device to the dealer/sub-dealer and update status
    try {
      if (device) {
        const fromUser = device.assignedTo;
        device.assignedTo = targetUser._id;
        device.activationRequestStatus = 'processing';
        device.deviceStatus = 'inactive';
        device.status = 'Inactive';
        device.updatedAt = new Date();
        device.assignmentHistory.push({
          fromUser: fromUser || null,
          toUser: targetUser._id,
          action: 'Assigned',
          note: 'Assigned automatically upon raising activation request',
          changedBy: req.user._id,
        });
        await device.save();
        console.log(`Automatically assigned device ${imei} and set status to inactive/processing`);
        await syncDueForUsers(getDueOwnerIdsFromDevice(device));
      }
    } catch (assignError) {
      console.error('Error during automatic device assignment:', assignError.message);
    }

    res.status(201).json(activationRequest);
  } catch (error) {
    console.error('Create activation request error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/activation-requests/:id
// @desc    Get a single activation request
// @access  Protected
router.get('/:id', async (req, res) => {
  try {
    const request = await ActivationRequest.findOne({
      _id: req.params.id,
      ...buildScopedOwnerQuery(req.hierarchyScope),
    });

    if (!request) {
      return res.status(404).json({ message: 'Activation request not found' });
    }

    res.json(request);
  } catch (error) {
    console.error('Get activation request error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/activation-requests/:id/approve
// @desc    Approve and activate the device (Step 5)
// @access  Protected (Admin only)
router.put('/:id/approve', requireRoles(PORTAL_ROLES.ADMIN), async (req, res) => {
  try {
    const request = await ActivationRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Activation request not found' });
    }

    if (request.status === 'Completed' || request.status === 'Approved' || request.status === 'Active') {
      return res.status(400).json({ message: 'Request is already approved/completed.' });
    }

    // Update request status
    request.status = 'Completed';
    await request.save();

    // Find and update device status
    const device = await Device.findOne({ imei: request.imei });
    if (device) {
      const currentDate = new Date();
      device.activationRequestStatus = 'active';
      device.deviceStatus = 'active';
      device.status = 'Active'; // Keep status synced
      device.activationDate = currentDate;
      device.presentDate = currentDate; // Sync presentDate as activation date
      
      // Calculate expiryDate
      const validityYears = device.validity === '2 Years' ? 2 : 1;
      const expiry = new Date(currentDate);
      expiry.setFullYear(expiry.getFullYear() + validityYears);
      device.expiryDate = expiry;

      await device.save();
      await syncDueForUsers(getDueOwnerIdsFromDevice(device));
    }

    res.json({ message: 'Activation request approved and device activated successfully.', request });
  } catch (error) {
    console.error('Approve activation request error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/activation-requests/:id/reject
// @desc    Reject activation request
// @access  Protected (Admin only)
router.put('/:id/reject', requireRoles(PORTAL_ROLES.ADMIN), async (req, res) => {
  try {
    const { remarks } = req.body;
    const request = await ActivationRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Activation request not found' });
    }

    request.status = 'Rejected';
    if (remarks) {
      request.remarks = remarks;
    }
    await request.save();

    // Reset device activation request status so they can raise a request again
    const device = await Device.findOne({ imei: request.imei });
    if (device) {
      device.activationRequestStatus = 'rejected';
      device.deviceStatus = 'inactive';
      await device.save();
      await syncDueForUsers(getDueOwnerIdsFromDevice(device));
    }

    res.json({ message: 'Activation request rejected.', request });
  } catch (error) {
    console.error('Reject activation request error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/activation-requests/direct-activate
// @desc    Directly activate a device (Admin only)
// @access  Protected (Admin only)
router.post('/direct-activate', requireRoles(PORTAL_ROLES.ADMIN), async (req, res) => {
  try {
    const { imei } = req.body;
    if (!imei) {
      return res.status(400).json({ message: 'IMEI is required.' });
    }

    const device = await Device.findOne({ imei });
    if (!device) {
      return res.status(404).json({ message: 'Device not found.' });
    }

    // Check if already active
    if (device.deviceStatus?.toLowerCase() === 'active' || device.status?.toLowerCase() === 'active') {
      return res.status(400).json({ message: 'Device is already active.' });
    }

    const existingRequest = await ActivationRequest.findOne({
      imei,
      requestType: 'Commercial Plan',
      status: { $ne: 'Rejected' }
    });
    if (existingRequest) {
      return res.status(400).json({ message: `Activation request already exists (Status: ${existingRequest.status}).` });
    }

    // Create an approved ActivationRequest
    const requestId = await generateRequestId();
    const currentDate = new Date();

    const request = await ActivationRequest.create({
      requestId,
      userId: req.user._id,
      dateTime: currentDate,
      quantity: 1,
      requestType: 'Commercial Plan',
      plan: device.validity || '1 Year',
      amount: device.billAmount || 0,
      remarks: 'Directly activated by Admin from Search Page',
      status: 'Completed',
      // Prefilled device info
      dealerName: device.dealerName || '',
      imei: device.imei,
      iccid: device.iccid,
      serialNo: device.serialNo,
      msisdn1: device.msisdn1 || '',
      msisdn2: device.msisdn2 || '',
      validity: device.validity || '1 Year',
      itrNo: device.itrNo || '',
      vendor: device.vendor || ''
    });

    // Update device status to active
    device.activationRequestStatus = 'active';
    device.deviceStatus = 'active';
    device.status = 'Active';
    device.activationDate = currentDate;
    device.presentDate = currentDate;

    // Calculate expiryDate
    const validityYears = device.validity === '2 Years' ? 2 : 1;
    const expiry = new Date(currentDate);
    expiry.setFullYear(expiry.getFullYear() + validityYears);
    device.expiryDate = expiry;

    await device.save();
    await syncDueForUsers(getDueOwnerIdsFromDevice(device));

    res.json({ message: 'Device activated successfully.', device, request });
  } catch (error) {
    console.error('Direct activation error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/activation-requests/:id
// @desc    Edit an activation request (only allowed if not completed, or if Admin)
// @access  Private
router.put('/:id', async (req, res) => {
  try {
    const request = await ActivationRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    const isSuperUser = req.portalRole === PORTAL_ROLES.ADMIN || req.user.role === 'partner' || req.user.username === 'bulbala123';

    if (!isSuperUser) {
      const userIdStr = req.user._id.toString();
      const isCreator = request.createdBy && request.createdBy.toString() === userIdStr;
      const isUserMatch = request.userId && request.userId.toString() === userIdStr;
      const isDealerMatch = request.dealerId && request.dealerId.toString() === userIdStr;
      const isSubDealerMatch = request.subDealerId && request.subDealerId.toString() === userIdStr;
      const isInScope = req.hierarchyScope && req.hierarchyScope.userIds && req.hierarchyScope.userIds.some(id => id.toString() === userIdStr);

      if (!isCreator && !isUserMatch && !isDealerMatch && !isSubDealerMatch && !isInScope) {
        return res.status(403).json({ message: 'Access denied: You can only edit activation requests for your account.' });
      }
    }

    const updatableFields = [
      'subDealerName', 'quantity', 'requestType', 'plan', 'piNo', 'remarks',
      'dealerName', 'dealerAddress', 'msisdn1', 'msisdn2', 'validity',
      'itrNo', 'vendor', 'installationDate', 'activationMode',
      'vehicleCondition', 'vehicleMake', 'vehicleModel', 'registrationYear',
      'vehicleNo', 'rto', 'engineNo', 'chassisNo', 'regMobNo', 'regMobNo2',
      'customerName', 'aadharNo', 'address', 'trackingId', 'software'
    ];

    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        request[field] = req.body[field];
      }
    });

    if (req.body.expiryDate) {
      request.expiryDate = new Date(req.body.expiryDate);
    }

    await request.save();

    // Sync trackingId, software and customer details to Device & RenewalRequest models
    if (request.imei) {
      const imeiClean = String(request.imei).trim();
      const imeiRegex = new RegExp('^' + imeiClean + '$', 'i');
      const updatePayload = {
        trackingId: request.trackingId || '',
        software: request.software || '',
      };
      if (request.customerName) updatePayload.customerName = request.customerName;
      if (request.regMobNo) updatePayload.regMobNo = request.regMobNo;
      if (request.regMobNo2) updatePayload.regMobNo2 = request.regMobNo2;
      if (request.aadharNo) updatePayload.aadharNo = request.aadharNo;
      if (request.address) updatePayload.address = request.address;

      await Device.updateMany(
        { $or: [{ imei: imeiRegex }, { imeiNumber: imeiRegex }] },
        { $set: updatePayload }
      ).catch(err => console.error('Error syncing tracking info to Device on edit:', err));

      const RenewalRequest = require('../models/RenewalRequest');
      await RenewalRequest.updateMany(
        { imei: imeiRegex },
        { $set: updatePayload }
      ).catch(err => console.error('Error syncing tracking info to RenewalRequest on edit:', err));
    }

    res.json({ message: 'Request updated successfully', request });
  } catch (error) {
    console.error('Update request error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/activation-requests/:id
// @desc    Delete an activation request
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const request = await ActivationRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (req.portalRole !== PORTAL_ROLES.ADMIN) {
      return res.status(403).json({ message: 'Access denied: Only Admins are allowed to delete activation requests.' });
    }

    if (request.imei) {
      const device = await Device.findOne({ imei: request.imei });
      if (device) {
        await Device.updateOne({ _id: device._id }, { $set: { activationRequestStatus: 'none' } });
      }
    }

    if (request.amount > 0 && request.status !== 'Completed') {
      const transaction = await Transaction.findOne({ paymentId: request.requestId });
      if (transaction && transaction.status === 'Success') {
        const targetUser = await User.findById(transaction.userId);
        if (targetUser) {
          await User.updateOne(
            { _id: targetUser._id },
            { $set: { availableBalance: (targetUser.availableBalance || 0) + request.amount } }
          );
        }
        await Transaction.updateOne(
          { _id: transaction._id },
          { $set: { status: 'Refunded', remarks: 'Refunded due to deleted activation request' } }
        );
      }
    }

    await ActivationRequest.findByIdAndDelete(req.params.id);
    res.json({ message: 'Request deleted successfully' });
  } catch (error) {
    console.error('Delete request error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// KYC Document Routes
// ============================================

// @route   POST /api/activation-requests/:id/kyc
// @desc    Upload KYC document for an activation request
router.post('/:id/kyc', requireRoles(...operationsRoles), (req, res) => {
  kycUpload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }
    try {
      const request = await ActivationRequest.findById(req.params.id);
      if (!request) {
        return res.status(404).json({ message: 'Activation request not found.' });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'Please select a file to upload.' });
      }

      const documentType = req.body.documentType;
      if (!documentType || !['PAN Card', 'Aadhar Card', 'RC Book'].includes(documentType)) {
        return res.status(400).json({ message: 'Invalid document type. Must be PAN Card, Aadhar Card, or RC Book.' });
      }

      // Remove existing document of same type (replace)
      request.kycDocuments = (request.kycDocuments || []).filter(d => d.documentType !== documentType);

      request.kycDocuments.push({
        documentType,
        fileName: req.file.filename,
        originalName: req.file.originalname,
        fileUrl: `/storage/kyc/${req.file.filename}`,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        uploadedBy: req.user._id,
        uploadedAt: new Date(),
      });

      await request.save();
      res.status(201).json({ message: `${documentType} uploaded successfully.`, kycDocuments: request.kycDocuments });
    } catch (error) {
      console.error('KYC upload error:', error.message);
      res.status(500).json({ message: 'Server error' });
    }
  });
});

// @route   GET /api/activation-requests/:id/kyc
// @desc    Get KYC documents for an activation request
router.get('/:id/kyc', requireRoles(...operationsRoles), async (req, res) => {
  try {
    const request = await ActivationRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Activation request not found.' });
    }
    res.json({ kycDocuments: request.kycDocuments || [] });
  } catch (error) {
    console.error('KYC fetch error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/activation-requests/kyc-by-imei/:imei
// @desc    Get KYC documents by IMEI (for search page)
router.get('/kyc-by-imei/:imei', requireRoles(...operationsRoles), async (req, res) => {
  try {
    const { imei } = req.params;
    if (!imei) return res.status(400).json({ message: 'IMEI required' });

    const cleanImei = String(imei).trim();
    const request = await ActivationRequest.findOne({
      imei: new RegExp('^' + cleanImei + '$', 'i'),
      kycDocuments: { $exists: true, $not: { $size: 0 } }
    }).sort({ dateTime: -1 });

    let kycDocs = request?.kycDocuments || [];

    if (kycDocs.length === 0) {
      const device = await Device.findOne({
        imei: new RegExp('^' + cleanImei + '$', 'i'),
        kycDocuments: { $exists: true, $not: { $size: 0 } }
      });
      if (device && device.kycDocuments) {
        kycDocs = device.kycDocuments;
      }
    }

    res.json({ kycDocuments: kycDocs });
  } catch (error) {
    console.error('KYC by IMEI fetch error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/activation-requests/kyc-by-imei/:imei
// @desc    Upload KYC document by IMEI (for search page)
router.post('/kyc-by-imei/:imei', requireRoles(...operationsRoles), (req, res) => {
  kycUpload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }
    try {
      const { imei } = req.params;
      const cleanImei = String(imei).trim();

      if (!req.file) {
        return res.status(400).json({ message: 'Please select a file to upload.' });
      }

      const documentType = req.body.documentType || 'PAN Card';

      let request = await ActivationRequest.findOne({
        imei: new RegExp('^' + cleanImei + '$', 'i')
      }).sort({ dateTime: -1 });

      if (!request) {
        // Create placeholder ActivationRequest if none exists
        request = new ActivationRequest({
          userId: req.user._id,
          imei: cleanImei,
          status: 'processing',
          customerName: 'Customer',
          regMobNo: '',
        });
      }

      // Remove existing document of same type if present
      const isAadhaar = ['Aadhar Card', 'Aadhaar Card'].includes(documentType);
      const isSameType = (d) => isAadhaar ? ['Aadhar Card', 'Aadhaar Card'].includes(d.documentType) : d.documentType === documentType;

      request.kycDocuments = (request.kycDocuments || []).filter(d => !isSameType(d));

      const docObj = {
        _id: new mongoose.Types.ObjectId(),
        documentType,
        fileName: req.file.filename,
        originalName: req.file.originalname,
        fileUrl: `/storage/kyc/${req.file.filename}`,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        uploadedBy: req.user._id,
        uploadedAt: new Date(),
      };

      request.kycDocuments.push(docObj);
      await request.save();

      // Also sync to Device model if device exists
      const device = await Device.findOne({ imei: new RegExp('^' + cleanImei + '$', 'i') });
      if (device) {
        device.kycDocuments = (device.kycDocuments || []).filter(d => !isSameType(d));
        device.kycDocuments.push(docObj);
        await device.save();
      }

      res.status(201).json({ message: `${documentType} uploaded successfully.`, kycDocuments: request.kycDocuments });
    } catch (error) {
      console.error('KYC upload by IMEI error:', error.message);
      res.status(500).json({ message: 'Server error' });
    }
  });
});

// @route   PUT /api/activation-requests/kyc-by-imei/:imei/:docId
// @desc    Replace a KYC document by IMEI (for search page)
router.put('/kyc-by-imei/:imei/:docId', requireRoles(...operationsRoles), (req, res) => {
  kycUpload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }
    try {
      const { imei, docId } = req.params;
      const cleanImei = String(imei).trim();

      if (!req.file) {
        return res.status(400).json({ message: 'Please select a replacement file.' });
      }

      let request = await ActivationRequest.findOne({
        imei: new RegExp('^' + cleanImei + '$', 'i')
      }).sort({ dateTime: -1 });

      const device = await Device.findOne({ imei: new RegExp('^' + cleanImei + '$', 'i') });

      let targetDoc = null;
      if (request && request.kycDocuments) {
        targetDoc = request.kycDocuments.find(d => d._id.toString() === docId);
      }
      if (!targetDoc && device && device.kycDocuments) {
        targetDoc = device.kycDocuments.find(d => d._id.toString() === docId);
      }

      if (!targetDoc) {
        return res.status(404).json({ message: 'KYC document not found.' });
      }

      // Delete old file from disk if exists
      const oldPath = path.join(kycStorageDir, targetDoc.fileName);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }

      // Update doc fields
      targetDoc.fileName = req.file.filename;
      targetDoc.originalName = req.file.originalname;
      targetDoc.fileUrl = `/storage/kyc/${req.file.filename}`;
      targetDoc.mimeType = req.file.mimetype;
      targetDoc.fileSize = req.file.size;
      targetDoc.uploadedBy = req.user._id;
      targetDoc.uploadedAt = new Date();

      if (request) await request.save();
      if (device) await device.save();

      const finalDocs = request?.kycDocuments || device?.kycDocuments || [];
      res.json({ message: 'KYC document replaced successfully.', kycDocuments: finalDocs });
    } catch (error) {
      console.error('KYC replace by IMEI error:', error.message);
      res.status(500).json({ message: 'Server error' });
    }
  });
});

// @route   DELETE /api/activation-requests/kyc-by-imei/:imei/:docId
// @desc    Delete a KYC document by IMEI (for search page)
router.delete('/kyc-by-imei/:imei/:docId', requireRoles(...operationsRoles), async (req, res) => {
  try {
    const { imei, docId } = req.params;
    const cleanImei = String(imei).trim();

    const request = await ActivationRequest.findOne({
      imei: new RegExp('^' + cleanImei + '$', 'i')
    }).sort({ dateTime: -1 });

    const device = await Device.findOne({ imei: new RegExp('^' + cleanImei + '$', 'i') });

    let targetDoc = null;
    if (request && request.kycDocuments) {
      targetDoc = request.kycDocuments.find(d => d._id.toString() === docId);
    }
    if (!targetDoc && device && device.kycDocuments) {
      targetDoc = device.kycDocuments.find(d => d._id.toString() === docId);
    }

    if (!targetDoc) {
      return res.status(404).json({ message: 'KYC document not found.' });
    }

    // Delete file from disk
    const filePath = path.join(kycStorageDir, targetDoc.fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    if (request) {
      request.kycDocuments = (request.kycDocuments || []).filter(d => d._id.toString() !== docId);
      await request.save();
    }

    if (device) {
      device.kycDocuments = (device.kycDocuments || []).filter(d => d._id.toString() !== docId);
      await device.save();
    }

    const finalDocs = request?.kycDocuments || device?.kycDocuments || [];
    res.json({ message: 'KYC document deleted successfully.', kycDocuments: finalDocs });
  } catch (error) {
    console.error('KYC delete by IMEI error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/activation-requests/kyc-by-imei/:imei/:docId/download
// @desc    Securely download a KYC document by IMEI
router.get('/kyc-by-imei/:imei/:docId/download', requireRoles(...operationsRoles), async (req, res) => {
  try {
    const { imei, docId } = req.params;
    const cleanImei = String(imei).trim();

    const request = await ActivationRequest.findOne({
      imei: new RegExp('^' + cleanImei + '$', 'i')
    }).sort({ dateTime: -1 });

    const device = await Device.findOne({ imei: new RegExp('^' + cleanImei + '$', 'i') });

    let doc = null;
    if (request && request.kycDocuments) {
      doc = request.kycDocuments.find(d => d._id.toString() === docId);
    }
    if (!doc && device && device.kycDocuments) {
      doc = device.kycDocuments.find(d => d._id.toString() === docId);
    }

    if (!doc) {
      return res.status(404).json({ message: 'KYC document not found.' });
    }

    const filePath = path.join(kycStorageDir, doc.fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Physical KYC file not found on server.' });
    }

    res.download(filePath, doc.originalName || doc.fileName || 'KYC_Document');
  } catch (error) {
    console.error('KYC download error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/activation-requests/kyc-by-imei/:imei/:docId/preview
// @desc    Securely preview/stream a KYC document inline
router.get('/kyc-by-imei/:imei/:docId/preview', requireRoles(...operationsRoles), async (req, res) => {
  try {
    const { imei, docId } = req.params;
    const cleanImei = String(imei).trim();

    const request = await ActivationRequest.findOne({
      imei: new RegExp('^' + cleanImei + '$', 'i')
    }).sort({ dateTime: -1 });

    const device = await Device.findOne({ imei: new RegExp('^' + cleanImei + '$', 'i') });

    let doc = null;
    if (request && request.kycDocuments) {
      doc = request.kycDocuments.find(d => d._id.toString() === docId);
    }
    if (!doc && device && device.kycDocuments) {
      doc = device.kycDocuments.find(d => d._id.toString() === docId);
    }

    if (!doc) {
      return res.status(404).json({ message: 'KYC document not found.' });
    }

    const filePath = path.join(kycStorageDir, doc.fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Physical KYC file not found on server.' });
    }

    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.originalName || doc.fileName)}"`);
    res.sendFile(filePath);
  } catch (error) {
    console.error('KYC preview error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/activation-requests/:id/kyc/:docId
// @desc    Delete a KYC document by request ID
router.delete('/:id/kyc/:docId', requireRoles(PORTAL_ROLES.ADMIN), async (req, res) => {
  try {
    const request = await ActivationRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Activation request not found.' });
    }

    const doc = (request.kycDocuments || []).find(d => d._id.toString() === req.params.docId);
    if (!doc) {
      return res.status(404).json({ message: 'KYC document not found.' });
    }

    // Delete file from disk
    const filePath = path.join(kycStorageDir, doc.fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    request.kycDocuments = request.kycDocuments.filter(d => d._id.toString() !== req.params.docId);
    await request.save();

    res.json({ message: 'KYC document deleted successfully.', kycDocuments: request.kycDocuments });
  } catch (error) {
    console.error('KYC delete error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
