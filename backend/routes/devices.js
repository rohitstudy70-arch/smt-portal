const express = require('express');
const Device = require('../models/Device');
const User = require('../models/User');
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

const router = express.Router();

router.use(protect, attachHierarchyScope);

const deviceCreateRoles = [PORTAL_ROLES.ADMIN, PORTAL_ROLES.DEALER, PORTAL_ROLES.SUB_DEALER];

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

const normalizeDeviceInput = (body) => ({
  dealerId: String(body.dealerId || '').trim(),
  dealerName: String(body.dealerName || '').trim(),
  subDealerId: String(body.subDealerId || '').trim(),
  subDealerName: String(body.subDealerName || '').trim(),
  vendor: String(body.vendor || '').trim(),
  imei: String(body.imei || body.imeiNumber || '').trim(),
  iccid: String(body.iccid || body.iccidNumber || '').trim(),
  serialNo: String(body.serialNo || body.serialNumber || '').trim(),
  msisdn1: String(body.msisdn1 || '').trim(),
  msisdn2: String(body.msisdn2 || '').trim(),
  itrNo: String(body.itrNo || '').trim(),
  billAmount: Number(body.billAmount) || 0,
  validity: normalizeValidity(body.validity),
  status: String(body.status || 'Active').trim() || 'Active',
});

const buildRegexCondition = (value, fields) => {
  if (!value) return null;
  const regex = new RegExp(escapeRegExp(String(value).trim()), 'i');
  return { $or: fields.map((field) => ({ [field]: regex })) };
};

const buildDeviceFilterQuery = (queryParams = {}) => {
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
      conditions.push({ assignedTo: { $ne: null } });
    } else if (status === 'Unassigned') {
      conditions.push({ assignedTo: null });
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
    const devicesAddedToday = await Device.countDocuments({ ...query, createdAt: { $gte: todayStart, $lte: todayEnd } });

    res.json({ totalDevices, activeDevices, expiredDevices, devicesAddedToday });
  } catch (error) {
    console.error('Device stats error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/devices/check-unique
// @desc    Check if IMEI, ICCID or Serial No is unique
// @access  Protected
router.get('/check-unique', requireRoles(...deviceCreateRoles), async (req, res) => {
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
    const filterQuery = buildDeviceFilterQuery(req.query);
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
router.post('/assign', requireRoles(...deviceCreateRoles), async (req, res) => {
  try {
    const { subUserId, type, imeisText } = req.body;

    if (!subUserId) {
      return res.status(400).json({ message: 'Please select a user' });
    }

    const subUser = await ensureUserInHierarchy(subUserId, req.hierarchyScope, { allowSelf: false });
    if (!subUser) {
      return res.status(403).json({ message: 'Forbidden: Selected user must belong to your hierarchy.' });
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
      const result = await Device.updateMany(
        combineQueries(buildDeviceScopeQuery(req.hierarchyScope), { imei: { $in: targetImeis } }),
        {
          $set: { assignedTo: subUserId, updatedAt },
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

      return res.json({
        message: `Successfully assigned ${result.modifiedCount} devices to ${labelForUser(subUser)}`,
      });
    }

    const result = await Device.updateMany(
      combineQueries(buildDeviceScopeQuery(req.hierarchyScope), { imei: { $in: targetImeis }, assignedTo: subUserId }),
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

    const presentDate = new Date();
    const expiryDate = addYears(presentDate, input.validity === '2 Years' ? 2 : 1);
    const dealerName = labelForUser(ownership.dealer);
    const subDealerName = ownership.subDealer ? labelForUser(ownership.subDealer) : input.subDealerName;

    const device = await Device.create({
      userId: ownership.ownerId,
      dealerId: ownership.dealer?._id || null,
      dealerName,
      subDealerId: ownership.subDealer?._id || null,
      subDealerName: subDealerName || '',
      vendor: input.vendor,
      imei: input.imei,
      imeiNumber: input.imei,
      iccid: input.iccid,
      iccidNumber: input.iccid,
      serialNo: input.serialNo,
      serialNumber: input.serialNo,
      msisdn1: input.msisdn1,
      msisdn2: input.msisdn2,
      itrNo: input.itrNo,
      billAmount: input.billAmount,
      validity: input.validity,
      presentDate,
      expiryDate,
      status: input.status,
      hasSim: Boolean(input.msisdn1 || input.msisdn2 || input.iccid),
      createdBy: req.user._id,
      createdByRole: req.portalRole,
      updatedAt: presentDate,
    });

    const populatedDevice = await populateDevice(Device.findById(device._id));
    res.status(201).json({ message: 'Device added successfully!', device: populatedDevice });
  } catch (error) {
    console.error('Create device error:', error.message);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Duplicate IMEI, ICCID, or Serial Number detected.' });
    }
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

    let expiryDate = device.expiryDate;
    if (input.validity !== device.validity) {
      expiryDate = addYears(device.presentDate || new Date(), input.validity === '2 Years' ? 2 : 1);
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
    device.billAmount = input.billAmount;
    device.validity = input.validity;
    device.expiryDate = expiryDate;
    device.status = input.status;
    device.hasSim = Boolean(input.msisdn1 || input.msisdn2 || input.iccid);
    device.updatedAt = new Date();

    await device.save();
    const populatedDevice = await populateDevice(Device.findById(device._id));
    res.json({ message: 'Device updated successfully!', device: populatedDevice });
  } catch (error) {
    console.error('Update device error:', error.message);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Duplicate IMEI, ICCID, or Serial Number detected.' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
