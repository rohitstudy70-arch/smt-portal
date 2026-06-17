const express = require('express');
const ActivationRequest = require('../models/ActivationRequest');
const { protect } = require('../middleware/auth');
const {
  PORTAL_ROLES,
  attachHierarchyScope,
  buildScopedOwnerQuery,
  requireRoles,
} = require('../middleware/hierarchy');

const router = express.Router();

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

    const query = buildScopedOwnerQuery(req.hierarchyScope);

    if (search) {
      query.$or = [
        { requestId: { $regex: search, $options: 'i' } },
        { requestType: { $regex: search, $options: 'i' } },
        { plan: { $regex: search, $options: 'i' } },
        { piNo: { $regex: search, $options: 'i' } },
        { status: { $regex: search, $options: 'i' } },
        { remarks: { $regex: search, $options: 'i' } },
        { subDealerName: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await ActivationRequest.countDocuments(query);
    const requests = await ActivationRequest.find(query)
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
    } = req.body;

    if (!imei) {
      return res
        .status(400)
        .json({ message: 'IMEI is required. Please select a device.' });
    }

    const requestId = await generateRequestId();

    const activationRequest = await ActivationRequest.create({
      requestId,
      userId: req.user._id,
      isSubDealer: isSubDealer || false,
      subDealerName: subDealerName || '',
      quantity: quantity || 1,
      requestType: requestType || 'Commercial Plan',
      plan: plan || '',
      piNo: piNo || '',
      amount: amount || 0,
      remarks: remarks || '',
      status: 'Requested',
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
    });

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

module.exports = router;
