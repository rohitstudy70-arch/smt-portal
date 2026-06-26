const express = require('express');
const Device = require('../models/Device');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const { protect } = require('../middleware/auth');
const {
  PORTAL_ROLES,
  attachHierarchyScope,
  buildDeviceScopeQuery,
  ensureUserInHierarchy,
  getPortalRole,
  labelForUser,
  requireRoles,
} = require('../middleware/hierarchy');
const {
  getDueOwnerIdsFromDevice,
  syncDueForUsers,
} = require('../services/dueService');

const router = express.Router();

router.use(protect, attachHierarchyScope);

const deviceManageRoles = [PORTAL_ROLES.ADMIN, PORTAL_ROLES.DEALER]; // assign/unassign
const deviceCreateRoles = [PORTAL_ROLES.ADMIN]; // add/edit/delete devices — ADMIN only


const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const combineQueries = (...queries) => {
  const activeQueries = queries.filter((query) => query && Object.keys(query).length > 0);
  if (activeQueries.length === 0) return {};
  if (activeQueries.length === 1) return activeQueries[0];
  return { $and: activeQueries };
};

const addYears = (date, years) => {
  const nextDate = new Date(date || Date.now());
  nextDate.setFullYear(nextDate.getFullYear() + years);
  return nextDate;
};

const normalizeValidity = (validity) => (
  validity === '2 Year' || validity === '2 Years' ? '2 Years' : '1 Year'
);

const normalizeDeviceInput = (body) => {
  let parsedPresentDate = null;
  if (body.presentDate) {
    const d = new Date(body.presentDate);
    if (!isNaN(d.getTime())) {
      parsedPresentDate = d;
    }
  }
  return {
    dealerId: String(body.dealerId || '').trim(),
    dealerName: String(body.dealerName || '').trim(),
    subDealerId: String(body.subDealerId || '').trim(),
    subDealerName: String(body.subDealerName || '').trim(),
    assignedTo: String(body.assignedTo || '').trim(),
    vendor: String(body.vendor || '').trim(),
    imei: String(body.imei || body.imeiNumber || '').trim(),
    iccid: String(body.iccid || body.iccidNumber || '').trim(),
    serialNo: String(body.serialNo || body.serialNumber || '').trim(),
    msisdn1: String(body.msisdn1 || '').trim(),
    msisdn2: String(body.msisdn2 || '').trim(),
    itrNo: String(body.itrNo || '').trim(),
    deviceName: String(body.deviceName || 'Aquila Track Bharat 101 With IRNSS').trim(),
    billAmount: Number(body.billAmount) || 0,
    validity: normalizeValidity(body.validity),
    status: String(body.status || 'Active').trim() || 'Active',
    presentDate: parsedPresentDate,
  };
};

const buildRegexCondition = (value, fields) => {
  if (!value) return null;
  const regex = new RegExp(escapeRegExp(String(value).trim()), 'i');
  return { $or: fields.map((field) => ({ [field]: regex })) };
};

const buildDeviceFilterQuery = (queryParams = {}, userRole = '', userId = null) => {
  const conditions = [];
  const {
    search = '',
    imei = '',
    iccid = '',
    serialNo = '',
    serialNumber = '',
    dealer = '',
    dealerName = '',
    dealerId = '',
    subDealer = '',
    subDealerName = '',
    subDealerId = '',
    msisdn = '',
    status = '',
    vendor = '',
    dateFrom = '',
    dateTo = '',
    fromDate = '',
    toDate = '',
  } = queryParams;

  const searchCondition = buildRegexCondition(search, [
    'imei',
    'imeiNumber',
    'iccid',
    'iccidNumber',
    'serialNo',
    'serialNumber',
    'msisdn1',
    'msisdn2',
    'dealerName',
    'subDealerName',
    'status',
  ]);
  if (searchCondition) conditions.push(searchCondition);

  const imeiCondition = buildRegexCondition(imei, ['imei', 'imeiNumber']);
  if (imeiCondition) conditions.push(imeiCondition);

  const iccidCondition = buildRegexCondition(iccid, ['iccid', 'iccidNumber']);
  if (iccidCondition) conditions.push(iccidCondition);

  const serialCondition = buildRegexCondition(serialNo || serialNumber, ['serialNo', 'serialNumber']);
  if (serialCondition) conditions.push(serialCondition);

  const dealerCondition = buildRegexCondition(dealer || dealerName, ['dealerName']);
  if (dealerCondition) conditions.push(dealerCondition);
  if (dealerId) conditions.push({ dealerId });

  const subDealerCondition = buildRegexCondition(subDealer || subDealerName, ['subDealerName']);
  if (subDealerCondition) conditions.push(subDealerCondition);
  if (subDealerId) conditions.push({ subDealerId });

  const msisdnCondition = buildRegexCondition(msisdn, ['msisdn1', 'msisdn2']);
  if (msisdnCondition) conditions.push(msisdnCondition);

  if (vendor) {
    conditions.push({ vendor: new RegExp(escapeRegExp(vendor), 'i') });
  }

  if (status && status !== 'all') {
    if (status === 'Assigned') {
      if (userRole === PORTAL_ROLES.ADMIN || !userId) {
        conditions.push({ assignedTo: { $ne: null } });
      } else {
        // For dealer/sub-dealer: "Assigned" = assigned to someone other than self
        conditions.push({ assignedTo: { $nin: [null, userId] } });
      }
    } else if (status === 'Unassigned') {
      if (userRole === PORTAL_ROLES.ADMIN || !userId) {
        conditions.push({ assignedTo: null });
      } else {
        // For dealer/sub-dealer: "Unassigned" = not yet assigned further (null or assigned to self)
        conditions.push({ $or: [{ assignedTo: null }, { assignedTo: userId }] });
      }
    } else if (status.toLowerCase() === 'active') {
      conditions.push({ status: { $in: ['Active', 'Activated'] } });
    } else if (status.toLowerCase() === 'inactive') {
      conditions.push({ status: 'Inactive' });
    } else {
      conditions.push({ status });
    }
  }

  const startDate = dateFrom || fromDate;
  const endDate = dateTo || toDate;
  if (startDate || endDate) {
    const range = {};
    if (startDate) {
      const parsedStart = new Date(startDate);
      if (!Number.isNaN(parsedStart.getTime())) range.$gte = parsedStart;
    }
    if (endDate) {
      const parsedEnd = new Date(endDate);
      if (!Number.isNaN(parsedEnd.getTime())) {
        parsedEnd.setHours(23, 59, 59, 999);
        range.$lte = parsedEnd;
      }
    }
    if (Object.keys(range).length > 0) {
      conditions.push({ presentDate: range });
    }
  }

  return combineQueries(...conditions);
};

const populateDevice = (query) => query
  .populate('assignedTo', 'displayName username userType mobileNo email')
  .populate('dealerId', 'displayName companyName username userType address city state pincode')
  .populate('subDealerId', 'displayName companyName username userType address city state pincode')
  .populate('createdBy', 'displayName companyName username userType');

const findDealerFromName = (scope, dealerName) => {
  if (!dealerName) return null;
  const normalized = dealerName.toLowerCase();

  return scope.users.find((candidate) => (
    getPortalRole(candidate) === PORTAL_ROLES.DEALER
    && labelForUser(candidate).toLowerCase() === normalized
  )) || null;
};

const resolveDeviceOwnership = async (req, input) => {
  const { portalRole: role, hierarchyScope: scope, user } = req;
  let dealer = null;
  let subDealer = null;

  if (role === PORTAL_ROLES.ADMIN) {
    dealer = input.dealerId
      ? await ensureUserInHierarchy(input.dealerId, scope)
      : findDealerFromName(scope, input.dealerName);

    if (!dealer || getPortalRole(dealer) !== PORTAL_ROLES.DEALER) {
      return { error: { status: 400, message: 'Please select a valid dealer.' } };
    }

    if (input.subDealerId) {
      subDealer = await ensureUserInHierarchy(input.subDealerId, scope);
      if (!subDealer || getPortalRole(subDealer) !== PORTAL_ROLES.SUB_DEALER) {
        return { error: { status: 400, message: 'Please select a valid sub dealer.' } };
      }
      if (subDealer.parentId?.toString() !== dealer._id.toString()) {
        return { error: { status: 400, message: 'Selected sub dealer does not belong to the selected dealer.' } };
      }
    }
  }

  if (role === PORTAL_ROLES.DEALER) {
    dealer = user;

    if (input.subDealerId) {
      subDealer = await ensureUserInHierarchy(input.subDealerId, scope, { allowSelf: false });
      if (!subDealer || getPortalRole(subDealer) !== PORTAL_ROLES.SUB_DEALER) {
        return { error: { status: 403, message: 'Forbidden: Sub dealer must belong to your hierarchy.' } };
      }
    }
  }

  if (role === PORTAL_ROLES.SUB_DEALER) {
    subDealer = user;
    dealer = user.parentId ? await User.findById(user.parentId).select('-password') : null;

    if (!dealer || getPortalRole(dealer) !== PORTAL_ROLES.DEALER) {
      return { error: { status: 400, message: 'Sub Dealer account is not linked to a dealer.' } };
    }
  }

  return {
    dealer,
    subDealer,
    ownerId: subDealer?._id || dealer?._id || user._id,
  };
};

const findDuplicateDevice = (input) => Device.findOne({
  $or: [
    { imei: input.imei },
    { imeiNumber: input.imei },
    { iccid: input.iccid },
    { iccidNumber: input.iccid },
    { serialNo: input.serialNo },
    { serialNumber: input.serialNo },
  ],
});

const buildCommercialAssignmentUpdate = async (targetUser) => {
  const targetRole = getPortalRole(targetUser);

  if (targetRole === PORTAL_ROLES.DEALER) {
    return {
      userId: targetUser._id,
      dealerId: targetUser._id,
      dealerName: labelForUser(targetUser),
      subDealerId: null,
      subDealerName: '',
    };
  }

  if (targetRole === PORTAL_ROLES.SUB_DEALER) {
    const parentDealer = targetUser.parentId
      ? await User.findById(targetUser.parentId).select('-password')
      : null;

    if (!parentDealer || getPortalRole(parentDealer) !== PORTAL_ROLES.DEALER) {
      return null;
    }

    return {
      userId: targetUser._id,
      dealerId: parentDealer._id,
      dealerName: labelForUser(parentDealer),
      subDealerId: targetUser._id,
      subDealerName: labelForUser(targetUser),
    };
  }

  return null;
};

// @route   GET /api/devices/stats
// @desc    Get device summary statistics scoped to current hierarchy
// @access  Protected
router.get('/stats', async (req, res) => {
  try {
    const query = buildDeviceScopeQuery(req.hierarchyScope);
    const totalDevices = await Device.countDocuments(query);
    const activeDevices = await Device.countDocuments({ ...query, status: { $in: ['Active', 'Activated'] } });

    const now = new Date();
    const expiredDevices = await Device.countDocuments({ ...query, expiryDate: { $lt: now, $ne: null } });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const devicesAddedToday = await Device.countDocuments({ ...query, presentDate: { $gte: todayStart, $lte: todayEnd } });

    res.json({ totalDevices, activeDevices, expiredDevices, devicesAddedToday });
  } catch (error) {
    console.error('Device stats error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/devices/check-unique
// @desc    Check if IMEI, ICCID or Serial No is unique
// @access  Protected
router.get('/check-unique', requireRoles(...deviceManageRoles), async (req, res) => {
  try {
    const { field, value } = req.query;
    if (!field || !value) {
      return res.status(400).json({ message: 'Field and value are required.' });
    }

    const fieldMap = {
      imei: ['imei', 'imeiNumber'],
      imeiNumber: ['imei', 'imeiNumber'],
      iccid: ['iccid', 'iccidNumber'],
      iccidNumber: ['iccid', 'iccidNumber'],
      serialNo: ['serialNo', 'serialNumber'],
      serialNumber: ['serialNo', 'serialNumber'],
    };

    const fields = fieldMap[field];
    if (!fields) {
      return res.status(400).json({ message: 'Unsupported uniqueness field.' });
    }

    const trimmedValue = String(value).trim();
    const exists = await Device.findOne({
      $or: fields.map((fieldName) => ({ [fieldName]: trimmedValue })),
    });
    res.json({ exists: !!exists });
  } catch (error) {
    console.error('Check unique error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/devices
// @desc    Get devices visible to current hierarchy
// @access  Protected
router.get('/', async (req, res) => {
  try {
    const {
      assignedTo,
      limit = 10,
      page = 1,
    } = req.query;

    if (assignedTo) {
      const assignee = await ensureUserInHierarchy(assignedTo, req.hierarchyScope);
      if (!assignee) {
        return res.status(403).json({ message: 'Forbidden: User is outside your hierarchy.' });
      }
    }

    const scopeQuery = buildDeviceScopeQuery(req.hierarchyScope);
    const filterQuery = buildDeviceFilterQuery(req.query, req.portalRole, req.user._id);
    const assigneeQuery = assignedTo ? { assignedTo } : {};
    const query = combineQueries(scopeQuery, filterQuery, assigneeQuery);

    const parsedLimit = Math.min(parseInt(limit, 10) || 10, 500);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);

    const [devices, total] = await Promise.all([
      populateDevice(Device.find(query))
        .sort({ createdAt: -1 })
        .skip((parsedPage - 1) * parsedLimit)
        .limit(parsedLimit),
      Device.countDocuments(query),
    ]);

    console.log('GET /api/devices - Queried devices count:', devices.length);
    if (devices.length > 0) {
      console.log('GET /api/devices - Sample device details:', {
        imei: devices[0].imei,
        itrNo: devices[0].itrNo,
        vendor: devices[0].vendor
      });
    }

    res.json({
      devices,
      total,
      pages: Math.ceil(total / parsedLimit),
      currentPage: parsedPage,
    });
  } catch (error) {
    console.error('Get devices error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/devices/assign
// @desc    Assign device(s) to a hierarchy user
// @access  Protected
router.post('/assign', requireRoles(...deviceManageRoles), async (req, res) => {
  try {
    const { subUserId, type, imeisText } = req.body;

    if (!subUserId) {
      return res.status(400).json({ message: 'Please select a user' });
    }

    const subUser = await ensureUserInHierarchy(subUserId, req.hierarchyScope, { allowSelf: false });
    if (!subUser) {
      return res.status(403).json({ message: 'Forbidden: Selected user must belong to your hierarchy.' });
    }
    const targetRole = getPortalRole(subUser);
    if (![PORTAL_ROLES.DEALER, PORTAL_ROLES.SUB_DEALER].includes(targetRole)) {
      return res.status(400).json({ message: 'Please select a valid Dealer or Sub Dealer.' });
    }

    // Extra guard: if a DEALER is assigning to a SUB_DEALER, ensure the sub dealer's
    // parentId strictly matches the assigning dealer's own _id.
    // This prevents a dealer from assigning devices to a sub dealer who belongs to a
    // different (e.g. HOD) dealer — even if that sub dealer somehow appears in the scope.
    if (req.portalRole === PORTAL_ROLES.DEALER && targetRole === PORTAL_ROLES.SUB_DEALER) {
      const parentIdStr = subUser.parentId ? subUser.parentId.toString() : null;
      const dealerIdStr = req.user._id.toString();
      if (parentIdStr !== dealerIdStr) {
        return res.status(403).json({
          message: 'Forbidden: This Sub Dealer does not belong to your dealership. Only their assigned dealer can assign devices to them.',
        });
      }
    }

    let targetImeis = [];
    if (imeisText) {
      const inputImeis = imeisText.split(/[\s,;\n]+/).map((i) => i.trim()).filter(Boolean);

      for (const inputImei of inputImeis) {
        if (inputImei.length < 15) {
          const matched = await Device.findOne(combineQueries(
            buildDeviceScopeQuery(req.hierarchyScope),
            {
              $or: [
                { imei: new RegExp(escapeRegExp(inputImei), 'i') },
                { iccid: new RegExp(escapeRegExp(inputImei), 'i') },
                { serialNo: new RegExp(escapeRegExp(inputImei), 'i') },
              ],
            },
          ));
          targetImeis.push(matched ? matched.imei : inputImei);
        } else {
          targetImeis.push(inputImei);
        }
      }
    }

    if (targetImeis.length === 0) {
      const batch = await Device.find(combineQueries(
        buildDeviceScopeQuery(req.hierarchyScope),
        { assignedTo: null },
      )).limit(5);

      if (batch.length === 0) {
        return res.status(400).json({ message: 'No unassigned devices available to assign.' });
      }
      targetImeis = batch.map((device) => device.imei);
    }

    const action = type || 'Assign';
    const updatedAt = new Date();

    if (action === 'Assign') {
      const matchQuery = combineQueries(buildDeviceScopeQuery(req.hierarchyScope), { imei: { $in: targetImeis } });
      const devicesBefore = await Device.find(matchQuery).select('userId dealerId subDealerId');
      const commercialUpdate = await buildCommercialAssignmentUpdate(subUser);

      if ([PORTAL_ROLES.DEALER, PORTAL_ROLES.SUB_DEALER].includes(getPortalRole(subUser)) && !commercialUpdate) {
        return res.status(400).json({ message: 'Selected Sub Dealer is not linked to a valid dealer.' });
      }

      const dueOwnerIds = devicesBefore.flatMap(getDueOwnerIdsFromDevice);
      if (commercialUpdate) {
        dueOwnerIds.push(commercialUpdate.subDealerId || commercialUpdate.dealerId);
      }

      const result = await Device.updateMany(
        matchQuery,
        {
          $set: { assignedTo: subUserId, updatedAt, ...(commercialUpdate || {}) },
          $push: {
            assignmentHistory: {
              toUser: subUserId,
              action: 'Assigned',
              note: 'Assigned from device management',
              changedBy: req.user._id,
            },
          },
        },
      );

      await syncDueForUsers(dueOwnerIds);

      return res.json({
        message: `Successfully assigned ${result.modifiedCount} devices to ${labelForUser(subUser)}`,
      });
    }

    const unassignQuery = combineQueries(buildDeviceScopeQuery(req.hierarchyScope), { imei: { $in: targetImeis }, assignedTo: subUserId });
    const devicesBefore = await Device.find(unassignQuery).select('userId dealerId subDealerId');
    const dueOwnerIds = devicesBefore.flatMap(getDueOwnerIdsFromDevice);
    const result = await Device.updateMany(
      unassignQuery,
      {
        $set: { assignedTo: null, updatedAt },
        $push: {
          assignmentHistory: {
            fromUser: subUserId,
            action: 'Unassigned',
            note: 'Unassigned from device management',
            changedBy: req.user._id,
          },
        },
      },
    );

    await syncDueForUsers(dueOwnerIds);

    return res.json({
      message: `Successfully unassigned ${result.modifiedCount} devices from ${labelForUser(subUser)}`,
    });
  } catch (error) {
    console.error('Assign devices error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/devices
// @desc    Create a new device
// @access  Protected
router.post('/', requireRoles(...deviceCreateRoles), async (req, res) => {
  try {
    console.log('Create device req.body:', req.body);
    const input = normalizeDeviceInput(req.body);

    if (!input.imei || !input.iccid || !input.serialNo) {
      return res.status(400).json({ message: 'IMEI, ICCID, and Serial No are required.' });
    }

    const ownership = await resolveDeviceOwnership(req, input);
    if (ownership.error) {
      return res.status(ownership.error.status).json({ message: ownership.error.message });
    }

    const duplicate = await findDuplicateDevice(input);
    if (duplicate) {
      if (duplicate.imei === input.imei || duplicate.imeiNumber === input.imei) {
        return res.status(400).json({ message: 'A device with this IMEI already exists.' });
      }
      if (duplicate.iccid === input.iccid || duplicate.iccidNumber === input.iccid) {
        return res.status(400).json({ message: 'A device with this ICCID already exists.' });
      }
      return res.status(400).json({ message: 'A device with this Serial Number already exists.' });
    }

    const targetUser = await User.findById(ownership.ownerId);
    if (!targetUser) {
      return res.status(404).json({ message: 'Target dealer or sub-dealer user not found.' });
    }

    if (input.assignedTo) {
      return res.status(400).json({ message: 'Device assignment to customer login users is no longer supported.' });
    }

    const billAmt = Number(input.billAmount) || 0;

    let deviceCreated = null;
    let transactionCreated = null;

    try {
      const presentDate = input.presentDate || new Date();
      const expiryDate = addYears(presentDate, input.validity === '2 Years' ? 2 : 1);
      const dealerName = labelForUser(ownership.dealer);
      const subDealerName = ownership.subDealer ? labelForUser(ownership.subDealer) : input.subDealerName;

      deviceCreated = await Device.create({
        userId: ownership.ownerId,
        dealerId: ownership.dealer?._id || null,
        dealerName,
        subDealerId: ownership.subDealer?._id || null,
        subDealerName: subDealerName || '',
        vendor: input.vendor,
        deviceName: input.deviceName,
        imei: input.imei,
        imeiNumber: input.imei,
        iccid: input.iccid,
        iccidNumber: input.iccid,
        serialNo: input.serialNo,
        serialNumber: input.serialNo,
        msisdn1: input.msisdn1,
        msisdn2: input.msisdn2,
        itrNo: input.itrNo,
        billAmount: billAmt,
        validity: input.validity,
        presentDate,
        expiryDate,
        assignedTo: null,
        assignmentHistory: [],
        status: 'Processing',
        activationRequestStatus: 'processing',
        hasSim: Boolean(input.msisdn1 || input.msisdn2 || input.iccid),
        createdBy: req.user._id,
        createdByRole: req.portalRole,
        updatedAt: presentDate,
      });

      // Create a transaction in ledger for the deducted device price
      let transactionId = '';
      if (billAmt > 0) {
        const randomNum = Math.floor(10000 + Math.random() * 90000);
        const date = new Date();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        transactionId = `ITR_${mm}_${dd}_${randomNum}`;

        transactionCreated = await Transaction.create({
          userId: targetUser._id,
          transactionId,
          paymentId: deviceCreated._id.toString(),
          paymentFor: 'Device Purchase',
          referenceNo: input.imei,
          payMode: 'Itwallet',
          transactionType: 'Debit',
          status: 'Success',
          remarks: `Device Purchase: IMEI ${input.imei}`,
          requestedAmt: billAmt,
          transactedAmt: billAmt,
          deviceName: input.deviceName,
          imei: input.imei,
          iccid: input.iccid,
          serialNo: input.serialNo,
          balanceAfterTransaction: targetUser.availableBalance || 0,
          createdBy: req.user._id,
        });
      }

      // Create audit log
      await AuditLog.create({
        userId: req.user._id,
        action: 'DEVICE_ASSIGNMENT',
        ipAddress: req.ip || '',
        details: {
          imei: input.imei,
          assignedTo: targetUser._id,
          assignedToName: targetUser.displayName || targetUser.username,
          billAmount: billAmt,
          transactionId: transactionId || null,
        }
      }).catch((e) => console.error('Failed to log audit event:', e.message));

      await syncDueForUsers([ownership.ownerId]);

      const populatedDevice = await populateDevice(Device.findById(deviceCreated._id));
      res.status(201).json({ message: 'Device added successfully!', device: populatedDevice });
    } catch (err) {
      console.error('Device assignment / creation error, rolling back changes:', err.message);

      // Rollback device creation
      if (deviceCreated) {
        try {
          await Device.deleteOne({ _id: deviceCreated._id });
          console.log('Device creation rolled back successfully');
        } catch (rollbackErr) {
          console.error('CRITICAL: Failed to rollback device creation:', rollbackErr.message);
        }
      }

      // Rollback transaction creation
      if (transactionCreated) {
        try {
          await Transaction.deleteOne({ _id: transactionCreated._id });
          console.log('Transaction creation rolled back successfully');
        } catch (rollbackErr) {
          console.error('CRITICAL: Failed to rollback transaction creation:', rollbackErr.message);
        }
      }

      if (err.code === 11000) {
        return res.status(400).json({ message: 'Duplicate IMEI, ICCID, or Serial Number detected.' });
      }
      res.status(500).json({ message: err.message || 'Server error' });
    }
  } catch (outerErr) {
    console.error('Create device outer error:', outerErr.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/devices/:id
// @desc    Update an existing device
// @access  Protected
router.put('/:id', requireRoles(...deviceCreateRoles), async (req, res) => {
  try {
    const scopeQuery = buildDeviceScopeQuery(req.hierarchyScope);
    const device = await Device.findOne(combineQueries(scopeQuery, { _id: req.params.id }));
    if (!device) {
      return res.status(404).json({ message: 'Device not found or access denied.' });
    }

    const input = normalizeDeviceInput(req.body);

    if (!input.imei || !input.iccid || !input.serialNo) {
      return res.status(400).json({ message: 'IMEI, ICCID, and Serial No are required.' });
    }

    const ownership = await resolveDeviceOwnership(req, input);
    if (ownership.error) {
      return res.status(ownership.error.status).json({ message: ownership.error.message });
    }

    const duplicate = await Device.findOne({
      _id: { $ne: device._id },
      $or: [
        { imei: input.imei },
        { imeiNumber: input.imei },
        { iccid: input.iccid },
        { iccidNumber: input.iccid },
        { serialNo: input.serialNo },
        { serialNumber: input.serialNo },
      ],
    });
    if (duplicate) {
      if (duplicate.imei === input.imei || duplicate.imeiNumber === input.imei) {
        return res.status(400).json({ message: 'A device with this IMEI already exists.' });
      }
      if (duplicate.iccid === input.iccid || duplicate.iccidNumber === input.iccid) {
        return res.status(400).json({ message: 'A device with this ICCID already exists.' });
      }
      return res.status(400).json({ message: 'A device with this Serial Number already exists.' });
    }

    const oldBillAmount = device.billAmount || 0;
    const oldUserId = device.userId;
    const newBillAmount = Number(input.billAmount) || 0;
    const newUserId = ownership.ownerId;
    const oldDueOwnerIds = getDueOwnerIdsFromDevice(device);

    const isSameOwner = oldUserId.toString() === newUserId.toString();
    const oldOwner = await User.findById(oldUserId);
    const newOwner = isSameOwner ? oldOwner : await User.findById(newUserId);

    if (!newOwner) {
      return res.status(404).json({ message: 'Target user not found for wallet check.' });
    }

    let transactionsCreated = [];

    try {
      if (isSameOwner) {
        const netChange = newBillAmount - oldBillAmount;
        if (netChange !== 0) {
          const randomNum = Math.floor(10000 + Math.random() * 90000);
          const date = new Date();
          const mm = String(date.getMonth() + 1).padStart(2, '0');
          const dd = String(date.getDate()).padStart(2, '0');
          const transactionId = `ITR_${mm}_${dd}_${randomNum}`;

          const txType = netChange > 0 ? 'Debit' : 'Credit';
          const txAmt = Math.abs(netChange);

          const transaction = await Transaction.create({
            userId: newOwner._id,
            transactionId,
            paymentId: device._id.toString(),
            paymentFor: 'Device Purchase Adjustment',
            referenceNo: input.imei,
            payMode: 'Itwallet',
            transactionType: txType,
            status: 'Success',
            remarks: `Device adjustment: IMEI ${input.imei} (Bill amount changed from ₹${oldBillAmount} to ₹${newBillAmount})`,
            requestedAmt: txAmt,
            transactedAmt: txAmt,
            deviceName: input.deviceName,
            imei: input.imei,
            iccid: input.iccid,
            serialNo: input.serialNo,
            balanceAfterTransaction: newOwner.availableBalance || 0,
            createdBy: req.user._id,
          });
          transactionsCreated.push(transaction);
        }
      } else {
        // Refund old owner
        if (oldOwner && oldBillAmount > 0) {
          const randomNum = Math.floor(10000 + Math.random() * 90000);
          const date = new Date();
          const mm = String(date.getMonth() + 1).padStart(2, '0');
          const dd = String(date.getDate()).padStart(2, '0');
          const transactionId = `ITR_${mm}_${dd}_${randomNum}`;

          const transaction = await Transaction.create({
            userId: oldOwner._id,
            transactionId,
            paymentId: device._id.toString(),
            paymentFor: 'Device Reassignment Refund',
            referenceNo: input.imei,
            payMode: 'Itwallet',
            transactionType: 'Credit',
            status: 'Success',
            remarks: `Refund: Device IMEI ${input.imei} reassigned to another dealer`,
            requestedAmt: oldBillAmount,
            transactedAmt: oldBillAmount,
            deviceName: input.deviceName,
            imei: input.imei,
            iccid: input.iccid,
            serialNo: input.serialNo,
            balanceAfterTransaction: oldOwner.availableBalance || 0,
            createdBy: req.user._id,
          });
          transactionsCreated.push(transaction);
        }

        // Charge new owner
        if (newBillAmount > 0) {
          const randomNum = Math.floor(10000 + Math.random() * 90000);
          const date = new Date();
          const mm = String(date.getMonth() + 1).padStart(2, '0');
          const dd = String(date.getDate()).padStart(2, '0');
          const transactionId = `ITR_${mm}_${dd}_${randomNum}`;

          const transaction = await Transaction.create({
            userId: newOwner._id,
            transactionId,
            paymentId: device._id.toString(),
            paymentFor: 'Device Purchase',
            referenceNo: input.imei,
            payMode: 'Itwallet',
            transactionType: 'Debit',
            status: 'Success',
            remarks: `Device Purchase: IMEI ${input.imei}`,
            requestedAmt: newBillAmount,
            transactedAmt: newBillAmount,
            deviceName: input.deviceName,
            imei: input.imei,
            iccid: input.iccid,
            serialNo: input.serialNo,
            balanceAfterTransaction: newOwner.availableBalance || 0,
            createdBy: req.user._id,
          });
          transactionsCreated.push(transaction);
        }
      }

      const presentDate = input.presentDate || device.presentDate || new Date();
      let expiryDate = device.expiryDate;
      const presentDateChanged = input.presentDate && 
        (!device.presentDate || new Date(input.presentDate).getTime() !== new Date(device.presentDate).getTime());

      if (input.validity !== device.validity || presentDateChanged) {
        expiryDate = addYears(presentDate, input.validity === '2 Years' ? 2 : 1);
      }
      const dealerName = labelForUser(ownership.dealer);
      const subDealerName = ownership.subDealer ? labelForUser(ownership.subDealer) : input.subDealerName;

      device.userId = ownership.ownerId;
      device.dealerId = ownership.dealer?._id || null;
      device.dealerName = dealerName;
      device.subDealerId = ownership.subDealer?._id || null;
      device.subDealerName = subDealerName || '';
      device.vendor = input.vendor;
      device.imei = input.imei;
      device.imeiNumber = input.imei;
      device.iccid = input.iccid;
      device.iccidNumber = input.iccid;
      device.serialNo = input.serialNo;
      device.serialNumber = input.serialNo;
      device.msisdn1 = input.msisdn1;
      device.msisdn2 = input.msisdn2;
      device.itrNo = input.itrNo;
      device.billAmount = newBillAmount;
      device.validity = input.validity;
      device.presentDate = presentDate;
      device.expiryDate = expiryDate;
      device.status = input.status;
      device.hasSim = Boolean(input.msisdn1 || input.msisdn2 || input.iccid);
      device.updatedAt = new Date();

      await device.save();

      await AuditLog.create({
        userId: req.user._id,
        action: 'DEVICE_UPDATE',
        ipAddress: req.ip || '',
        details: {
          imei: input.imei,
          updatedFields: {
            oldBillAmount,
            newBillAmount,
            oldUserId,
            newUserId
          }
        }
      }).catch((e) => console.error('Failed to log audit event:', e.message));

      await syncDueForUsers([...oldDueOwnerIds, ...getDueOwnerIdsFromDevice(device)]);

      const populatedDevice = await populateDevice(Device.findById(device._id));
      res.json({ message: 'Device updated successfully!', device: populatedDevice });

    } catch (err) {
      console.error('Update device database operations failed, rolling back:', err.message);

      for (const tx of transactionsCreated) {
        try {
          await Transaction.deleteOne({ _id: tx._id });
        } catch (rErr) {
          console.error('CRITICAL: Failed to delete transaction log on rollback:', rErr.message);
        }
      }

      if (err.code === 11000) {
        return res.status(400).json({ message: 'Duplicate IMEI, ICCID, or Serial Number detected.' });
      }
      res.status(500).json({ message: err.message || 'Server error' });
    }
  } catch (outerErr) {
    console.error('Update device outer error:', outerErr.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/devices/:id
// @desc    Permanently delete a device
// @access  Protected
router.delete('/:id', requireRoles(...deviceCreateRoles), async (req, res) => {
  try {
    const scopeQuery = buildDeviceScopeQuery(req.hierarchyScope);
    const device = await Device.findOne(combineQueries(scopeQuery, { _id: req.params.id }));
    if (!device) {
      return res.status(404).json({ message: 'Device not found or access denied.' });
    }

    const dueOwnerIds = getDueOwnerIdsFromDevice(device);
    await Device.findByIdAndDelete(device._id);
    await syncDueForUsers(dueOwnerIds);
    res.json({ message: 'Device deleted successfully.' });
  } catch (error) {
    console.error('Delete device error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
