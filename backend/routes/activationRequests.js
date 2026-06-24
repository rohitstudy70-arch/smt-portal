const express = require('express');
const ActivationRequest = require('../models/ActivationRequest');
const Device = require('../models/Device');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/auth');
const {
  PORTAL_ROLES,
  attachHierarchyScope,
  buildScopedOwnerQuery,
  requireRoles,
  isIdInScope,
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
        { imei: { $regex: search, $options: 'i' } },
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

    const query = buildScopedOwnerQuery(req.hierarchyScope);
    query.imei = new RegExp('^' + String(imei).trim() + '$', 'i');

    const request = await ActivationRequest.findOne(query).sort({ dateTime: -1 });

    if (!request) {
      return res.status(404).json({ message: 'No request found for this IMEI' });
    }

    res.json(request);
  } catch (error) {
    console.error('Fetch request by imei error:', error.message);
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
      userId: req.user._id,
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
    });

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

    if (request.status === 'Completed' && req.portalRole !== PORTAL_ROLES.ADMIN) {
      return res.status(400).json({ message: 'Cannot edit a completed request' });
    }

    if (req.portalRole !== PORTAL_ROLES.ADMIN && !isIdInScope(req.hierarchyScope, request.userId)) {
      return res.status(403).json({ message: 'Unauthorized to edit this request' });
    }

    const updatableFields = [
      'subDealerName', 'quantity', 'requestType', 'plan', 'piNo', 'remarks',
      'dealerName', 'dealerAddress', 'msisdn1', 'msisdn2', 'validity',
      'itrNo', 'vendor', 'installationDate', 'activationMode',
      'vehicleCondition', 'vehicleMake', 'vehicleModel', 'registrationYear',
      'vehicleNo', 'rto', 'engineNo', 'chassisNo', 'regMobNo', 'regMobNo2',
      'customerName', 'aadharNo', 'address'
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

    if (request.status === 'Completed' && req.portalRole !== PORTAL_ROLES.ADMIN) {
      return res.status(400).json({ message: 'Cannot delete a completed request' });
    }

    if (req.portalRole !== PORTAL_ROLES.ADMIN && !isIdInScope(req.hierarchyScope, request.userId)) {
      return res.status(403).json({ message: 'Unauthorized to delete this request' });
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

module.exports = router;
