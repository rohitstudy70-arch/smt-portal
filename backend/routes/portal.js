const express = require('express');
const Device = require('../models/Device');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const RenewalRequest = require('../models/RenewalRequest');
const DuePayment = require('../models/DuePayment');
const { protect } = require('../middleware/auth');
const {
  getDueOwnerIdsFromDevice,
  syncDueForScope,
  syncDueForUsers,
} = require('../services/dueService');

const router = express.Router();

const getPortalRole = (user) => {
  if (user.role === 'partner') return 'ADMIN';
  if (user.userType === 'Administration') return 'ADMIN';
  if (user.userType === 'Sub Dealer') return 'SUB_DEALER';
  if (user.userType === 'End Customer') return 'CUSTOMER';
  return 'DEALER';
};

const operationsRoles = ['ADMIN', 'DEALER', 'SUB_DEALER'];

const labelForUser = (user) => user.displayName || user.companyName || user.username || '';

const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toDateOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const addYears = (date, years) => {
  const nextDate = new Date(date || Date.now());
  nextDate.setFullYear(nextDate.getFullYear() + years);
  return nextDate;
};

const generateRequestId = (prefix) => {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}-${random}`;
};

const getDescendantUsers = async (rootUserId) => {
  const descendants = [];
  let frontier = [rootUserId];

  while (frontier.length > 0) {
    const children = await User.find({ parentId: { $in: frontier } }).select('-password');
    if (children.length === 0) break;

    descendants.push(...children);
    frontier = children.map((child) => child._id);
  }

  return descendants;
};

const getScope = async (user) => {
  const role = getPortalRole(user);

  if (role === 'ADMIN') {
    const users = await User.find({}).select('-password');
    return {
      role,
      users,
      userIds: users.map((item) => item._id),
      userNames: users.map(labelForUser).filter(Boolean),
    };
  }

  const descendants = await getDescendantUsers(user._id);
  const users = [user, ...descendants];

  return {
    role,
    users,
    userIds: users.map((item) => item._id),
    userNames: users.map(labelForUser).filter(Boolean),
  };
};

const buildDeviceScopeQuery = (scope) => {
  if (scope.role === 'ADMIN') {
    return {};
  }

  return {
    $or: [
      { userId: { $in: scope.userIds } },
      { assignedTo: { $in: scope.userIds } },
      { dealerId: { $in: scope.userIds } },
      { subDealerId: { $in: scope.userIds } },
      { createdBy: { $in: scope.userIds } },
    ],
  };
};

const buildRequestScopeQuery = (scope) => {
  if (scope.role === 'ADMIN') {
    return {};
  }

  return {
    $or: [
      { userId: { $in: scope.userIds } },
      { customerId: { $in: scope.userIds } },
      { subDealerName: { $in: scope.userNames } },
    ],
  };
};

const ensureVisibleUser = async (targetUserId, scope) => {
  if (!targetUserId) return null;
  const target = await User.findById(targetUserId).select('-password');
  if (!target) return null;
  if (scope.role === 'ADMIN') return target;

  const visible = scope.userIds.some((id) => id.toString() === target._id.toString());
  return visible ? target : null;
};

const ensureVisibleDevice = async (deviceQuery, scope) => {
  const query = {
    ...deviceQuery,
    ...buildDeviceScopeQuery(scope),
  };
  return Device.findOne(query).populate('assignedTo', 'displayName username userType mobileNo email');
};

const buildSearch = (search, fields) => {
  if (!search) return null;
  const regex = new RegExp(escapeRegExp(search), 'i');
  return { $or: fields.map((field) => ({ [field]: regex })) };
};

const normalizeUser = (user) => ({
  _id: user._id,
  username: user.username,
  role: user.role,
  userType: user.userType || '',
  displayName: user.displayName || '',
  companyName: user.companyName || '',
  contactPerson: user.contactPerson || '',
  mobileNo: user.mobileNo || '',
  email: user.email || '',
  address: user.address || '',
  city: user.city || '',
  state: user.state || '',
  pincode: user.pincode || '',
  status: user.status || 'Active',
  gstNo: user.gstNo || '',
  parentId: user.parentId,
  createdAt: user.createdAt,
});

const getScopedUsersByType = (scope, type) => {
  const users = scope.role === 'ADMIN' ? scope.users : scope.users.filter((item) => (
    item._id.toString() !== scope.users[0]._id.toString()
  ));

  if (type === 'dealer') {
    return users.filter((item) => item.role === 'customer' && !item.parentId && item.userType !== 'End Customer');
  }

  if (type === 'subDealer') {
    return users.filter((item) => item.userType === 'Sub Dealer');
  }

  if (type === 'customer') {
    return users.filter((item) => item.userType === 'End Customer');
  }

  return users.filter((item) => item.role !== 'partner');
};

router.get('/summary', protect, async (req, res) => {
  try {
    const scope = await getScope(req.user);
    const deviceScopeQuery = buildDeviceScopeQuery(scope);
    const requestScopeQuery = buildRequestScopeQuery(scope);
    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const scopedUsers = scope.role === 'ADMIN'
      ? scope.users
      : scope.users.filter((item) => item._id.toString() !== req.user._id.toString());

    const dealers = scope.users.filter((item) => getPortalRole(item) === 'DEALER');
    const subDealers = scopedUsers.filter((item) => getPortalRole(item) === 'SUB_DEALER');
    const userCustomers = scopedUsers.filter((item) => getPortalRole(item) === 'CUSTOMER');

    const [
      totalDevices,
      activeDevices,
      expiredDevices,
      devicesAddedToday,
      availableDevices,
      assignedDevices,
      renewalDueDevices,
      totalRenewals,
      pendingRenewals,
    ] = await Promise.all([
      Device.countDocuments(deviceScopeQuery),
      Device.countDocuments({ ...deviceScopeQuery, status: { $in: ['Active', 'Activated'] } }),
      Device.countDocuments({ ...deviceScopeQuery, expiryDate: { $lt: now, $ne: null } }),
      Device.countDocuments({ ...deviceScopeQuery, presentDate: { $gte: todayStart, $lte: todayEnd } }),
      Device.countDocuments({ ...deviceScopeQuery, assignedTo: null }),
      Device.countDocuments({ ...deviceScopeQuery, assignedTo: { $ne: null } }),
      Device.countDocuments({ ...deviceScopeQuery, expiryDate: { $gte: now, $lte: dueDate } }),
      RenewalRequest.countDocuments(requestScopeQuery),
      RenewalRequest.countDocuments({ ...requestScopeQuery, status: { $in: ['Requested', 'Processing'] } }),
    ]);

    res.json({
      role: scope.role,
      totalDealers: dealers.length,
      totalSubDealers: subDealers.length,
      totalCustomers: userCustomers.length,
      totalDevices,
      activeDevices,
      expiredDevices,
      devicesAddedToday,
      renewalDueDevices,
      assignedDevices,
      availableDevices,
      activeCustomers: userCustomers.filter((item) => item.status !== 'Inactive').length,
      totalRenewals,
      pendingRenewals,
    });
  } catch (error) {
    console.error('Portal summary error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/users', protect, async (req, res) => {
  try {
    const { type = 'all', search = '' } = req.query;
    const scope = await getScope(req.user);

    if (!operationsRoles.includes(scope.role)) {
      return res.status(403).json({ message: 'Forbidden: User management access is not permitted for this role.' });
    }

    const regex = search ? new RegExp(escapeRegExp(search), 'i') : null;
    let users = getScopedUsersByType(scope, type).map(normalizeUser);

    if (regex) {
      users = users.filter((item) => (
        regex.test(item.displayName)
        || regex.test(item.companyName)
        || regex.test(item.username)
        || regex.test(item.mobileNo)
        || regex.test(item.email)
      ));
    }

    res.json(users);
  } catch (error) {
    console.error('Portal users error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/users', protect, async (req, res) => {
  try {
    const scope = await getScope(req.user);

    if (!operationsRoles.includes(scope.role)) {
      return res.status(403).json({ message: 'Forbidden: User management access is not permitted for this role.' });
    }

    const {
      userType,
      displayName,
      companyName,
      contactPerson,
      mobileNo,
      email,
      username,
      password,
      parentId,
      address,
      city,
      state,
      pincode,
      gstNo,
    } = req.body;

    if (!userType || !username || !password) {
      return res.status(400).json({ message: 'User type, username, and password are required.' });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Username is already taken.' });
    }

    let nextParentId = null;
    let nextUserType = userType;

    if (userType === 'Dealer') {
      if (scope.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Only admin can add dealers.' });
      }
      nextParentId = null;
    } else if (userType === 'Sub Dealer') {
      if (scope.role === 'SUB_DEALER') {
        return res.status(403).json({ message: 'Sub Dealers can only add End Customers.' });
      }
      if (scope.role === 'ADMIN' && parentId) {
        const dealer = await ensureVisibleUser(parentId, scope);
        if (!dealer) return res.status(404).json({ message: 'Selected dealer not found.' });
        nextParentId = dealer._id;
      } else {
        nextParentId = req.user._id;
      }
    } else {
      nextUserType = 'End Customer';
      if (scope.role === 'SUB_DEALER') {
        nextParentId = req.user._id;
      } else if (parentId) {
        const parent = await ensureVisibleUser(parentId, scope);
        if (!parent) return res.status(404).json({ message: 'Selected parent user not found.' });
        nextParentId = parent._id;
      } else {
        nextParentId = req.user._id;
      }
    }

    const user = await User.create({
      username,
      password,
      role: 'customer',
      parentId: nextParentId,
      userType: nextUserType,
      displayName: displayName || companyName || username,
      companyName: companyName || displayName || '',
      contactPerson: contactPerson || '',
      mobileNo: mobileNo || '',
      email: email || '',
      address: address || '',
      city: city || '',
      state: state || '',
      pincode: pincode || '',
      gstNo: gstNo || '',
      status: 'Active',
    });

    const returnedUser = await User.findById(user._id).select('-password');
    res.status(201).json(normalizeUser(returnedUser));
  } catch (error) {
    console.error('Portal create user error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/users/:id', protect, async (req, res) => {
  try {
    const scope = await getScope(req.user);

    if (!operationsRoles.includes(scope.role)) {
      return res.status(403).json({ message: 'Forbidden: User management access is not permitted for this role.' });
    }

    const user = await ensureVisibleUser(req.params.id, scope);

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (scope.role === 'SUB_DEALER' && user.userType !== 'End Customer') {
      return res.status(403).json({ message: 'Sub Dealers can only manage End Customers.' });
    }

    if (scope.role === 'DEALER' && (user.role === 'partner' || user.userType === 'Dealer')) {
      return res.status(403).json({ message: 'Dealers cannot manage Admins or Dealers.' });
    }

    if (req.body.userType) {
      if (scope.role === 'SUB_DEALER' && req.body.userType !== 'End Customer') {
        return res.status(403).json({ message: 'Sub Dealers can only manage End Customers.' });
      }

      if (scope.role === 'DEALER' && req.body.userType === 'Dealer') {
        return res.status(403).json({ message: 'Dealers cannot manage Dealers.' });
      }
    }

    const fields = [
      'userType',
      'displayName',
      'companyName',
      'contactPerson',
      'mobileNo',
      'email',
      'address',
      'city',
      'state',
      'pincode',
      'status',
      'gstNo',
    ];

    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    });

    const updatedUser = await user.save();
    res.json(normalizeUser(updatedUser));
  } catch (error) {
    console.error('Portal update user error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/users/:id/reset-password', protect, async (req, res) => {
  try {
    const scope = await getScope(req.user);

    if (!operationsRoles.includes(scope.role)) {
      return res.status(403).json({ message: 'Forbidden: User management access is not permitted for this role.' });
    }

    const user = await ensureVisibleUser(req.params.id, scope);
    const { password } = req.body;

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters.' });
    }

    user.password = password;
    await user.save();
    res.json({ message: 'Password reset successfully.' });
  } catch (error) {
    console.error('Portal reset password error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/devices', protect, async (req, res) => {
  try {
    const {
      status = 'all',
      search = '',
      dealerName = '',
      dealerId = '',
      subDealerName = '',
      subDealerId = '',
      imei = '',
      iccid = '',
      serialNo = '',
      msisdn = '',
      dateFrom = '',
      dateTo = '',
      assignedTo = '',
      limit = 100,
      page = 1,
    } = req.query;
    const scope = await getScope(req.user);
    const query = buildDeviceScopeQuery(scope);
    const now = new Date();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    if (status === 'available') query.assignedTo = null;
    if (status === 'assigned') query.assignedTo = { $ne: null };
    if (status === 'active') query.status = { $in: ['Active', 'Activated'] };
    if (status === 'inactive') query.status = 'Inactive';
    if (status === 'expired') query.expiryDate = { $lt: now, $ne: null };
    if (status === 'expiring') query.expiryDate = { $gte: now, $lte: dueDate };
    if (dealerName) query.dealerName = new RegExp(escapeRegExp(dealerName), 'i');
    if (dealerId) query.dealerId = dealerId;
    if (subDealerName) query.subDealerName = new RegExp(escapeRegExp(subDealerName), 'i');
    if (subDealerId) query.subDealerId = subDealerId;
    if (assignedTo) query.assignedTo = assignedTo;

    const exactFilters = [];
    if (imei) exactFilters.push(buildSearch(imei, ['imei', 'imeiNumber']));
    if (iccid) exactFilters.push(buildSearch(iccid, ['iccid', 'iccidNumber']));
    if (serialNo) exactFilters.push(buildSearch(serialNo, ['serialNo', 'serialNumber']));
    if (msisdn) exactFilters.push(buildSearch(msisdn, ['msisdn1', 'msisdn2']));
    exactFilters.filter(Boolean).forEach((filter) => {
      query.$and = query.$and || [];
      query.$and.push(filter);
    });

    if (dateFrom || dateTo) {
      const range = {};
      const parsedFrom = toDateOrNull(dateFrom);
      const parsedTo = toDateOrNull(dateTo);
      if (parsedFrom) range.$gte = parsedFrom;
      if (parsedTo) {
        parsedTo.setHours(23, 59, 59, 999);
        range.$lte = parsedTo;
      }
      if (Object.keys(range).length > 0) query.presentDate = range;
    }

    const searchQuery = buildSearch(search, ['imei', 'imeiNumber', 'iccid', 'iccidNumber', 'serialNo', 'serialNumber', 'msisdn1', 'msisdn2', 'dealerName', 'subDealerName', 'status']);
    if (searchQuery) {
      query.$and = query.$and || [];
      query.$and.push(searchQuery);
    }

    const parsedLimit = Math.min(parseInt(limit, 10) || 100, 500);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const [devices, total] = await Promise.all([
      Device.find(query)
        .populate('assignedTo', 'displayName username userType mobileNo email')
        .populate('dealerId', 'displayName companyName username userType')
        .populate('subDealerId', 'displayName companyName username userType')
        .populate('createdBy', 'displayName companyName username userType')
        .populate('assignmentHistory.fromUser', 'displayName username userType')
        .populate('assignmentHistory.toUser', 'displayName username userType')
        .populate('assignmentHistory.changedBy', 'displayName username userType')
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
    console.error('Portal devices error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/devices/bulk', protect, async (req, res) => {
  try {
    const { devices = [] } = req.body;
    const scope = await getScope(req.user);

    if (!operationsRoles.includes(scope.role)) {
      return res.status(403).json({ message: 'Forbidden: Device creation is not permitted for this role.' });
    }

    if (!Array.isArray(devices) || devices.length === 0) {
      return res.status(400).json({ message: 'Please provide at least one device record.' });
    }

    const created = [];
    const skipped = [];

    for (const rawDevice of devices) {
      const imei = String(rawDevice.imei || rawDevice.imeiNumber || '').trim();
      const iccid = String(rawDevice.iccid || rawDevice.iccidNumber || '').trim();
      const serialNo = String(rawDevice.serialNo || rawDevice.serialNumber || '').trim();

      if (!imei || !iccid || !serialNo) {
        skipped.push({ imei, reason: 'IMEI, ICCID, and Serial No are required.' });
        continue;
      }

      const duplicate = await Device.findOne({
        $or: [
          { imei },
          { imeiNumber: imei },
          { iccid },
          { iccidNumber: iccid },
          { serialNo },
          { serialNumber: serialNo },
        ],
      });
      if (duplicate) {
        skipped.push({ imei, reason: 'Duplicate IMEI, ICCID, or Serial No.' });
        continue;
      }

      let dealer = null;
      let subDealer = null;

      if (scope.role === 'ADMIN') {
        const rawDealerId = rawDevice.dealerId || '';
        dealer = rawDealerId
          ? await ensureVisibleUser(rawDealerId, scope)
          : scope.users.find((item) => (
            getPortalRole(item) === 'DEALER'
            && labelForUser(item).toLowerCase() === String(rawDevice.dealerName || '').trim().toLowerCase()
          ));

        if (!dealer || getPortalRole(dealer) !== 'DEALER') {
          skipped.push({ imei, reason: 'Valid dealer is required.' });
          continue;
        }
      } else if (scope.role === 'DEALER') {
        dealer = req.user;
      } else if (scope.role === 'SUB_DEALER') {
        subDealer = req.user;
        dealer = req.user.parentId ? await User.findById(req.user.parentId).select('-password') : null;
        if (!dealer || getPortalRole(dealer) !== 'DEALER') {
          skipped.push({ imei, reason: 'Sub Dealer account is not linked to a dealer.' });
          continue;
        }
      }

      let presentDate = new Date();
      if (rawDevice.presentDate) {
        const parsed = new Date(rawDevice.presentDate);
        if (!isNaN(parsed.getTime())) {
          presentDate = parsed;
        }
      } else if (rawDevice.activationDate) {
        const parsed = new Date(rawDevice.activationDate);
        if (!isNaN(parsed.getTime())) {
          presentDate = parsed;
        }
      }
      const validity = rawDevice.validity === '2 Years' || rawDevice.validity === '2 Year' ? '2 Years' : '1 Year';
      const expiryDate = addYears(presentDate, validity === '2 Years' ? 2 : 1);

      const device = await Device.create({
        userId: subDealer?._id || dealer?._id || req.user._id,
        dealerId: dealer?._id || null,
        dealerName: dealer ? labelForUser(dealer) : rawDevice.dealerName || '',
        subDealerId: subDealer?._id || null,
        subDealerName: subDealer ? labelForUser(subDealer) : rawDevice.subDealerName || '',
        imei,
        imeiNumber: imei,
        iccid,
        iccidNumber: iccid,
        serialNo,
        serialNumber: serialNo,
        msisdn1: rawDevice.msisdn1 || '',
        msisdn2: rawDevice.msisdn2 || '',
        itrNo: String(rawDevice.itrNo || '').trim(),
        vendor: String(rawDevice.vendor || 'iTriangle').trim(),
        validity,
        presentDate,
        expiryDate,
        status: 'Processing',
        activationRequestStatus: 'processing',
        hasSim: Boolean(rawDevice.msisdn1 || rawDevice.msisdn2 || iccid),
        createdBy: req.user._id,
        createdByRole: scope.role,
        updatedAt: presentDate,
      });

      created.push(device);
    }

    res.status(201).json({
      message: `${created.length} devices imported. ${skipped.length} records skipped.`,
      createdCount: created.length,
      skipped,
    });
  } catch (error) {
    console.error('Portal bulk device error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/devices/:id/transfer', protect, async (req, res) => {
  try {
    const { targetUserId, note = '' } = req.body;
    const scope = await getScope(req.user);

    if (!operationsRoles.includes(scope.role)) {
      return res.status(403).json({ message: 'Forbidden: Device transfer is not permitted for this role.' });
    }

    const device = await ensureVisibleDevice({ _id: req.params.id }, scope);

    if (!device) {
      return res.status(404).json({ message: 'Device not found.' });
    }

    const targetUser = targetUserId ? await ensureVisibleUser(targetUserId, scope) : null;
    if (targetUserId && !targetUser) {
      return res.status(404).json({ message: 'Target user not found.' });
    }

    const previousAssignee = device.assignedTo?._id || device.assignedTo || null;
    const nextAssignee = targetUser ? targetUser._id : null;
    const action = !nextAssignee ? 'Unassigned' : previousAssignee ? 'Transferred' : 'Assigned';

    device.assignedTo = nextAssignee;
    device.assignmentHistory.push({
      fromUser: previousAssignee,
      toUser: nextAssignee,
      action,
      note,
      changedBy: req.user._id,
    });

    await device.save();

    const updatedDevice = await Device.findById(device._id)
      .populate('assignedTo', 'displayName username userType mobileNo email')
      .populate('assignmentHistory.fromUser', 'displayName username userType')
      .populate('assignmentHistory.toUser', 'displayName username userType')
      .populate('assignmentHistory.changedBy', 'displayName username userType');

    res.json({
      message: `Device ${action.toLowerCase()} successfully.`,
      device: updatedDevice,
    });
  } catch (error) {
    console.error('Portal transfer device error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/customers', protect, async (req, res) => {
  try {
    const { search = '' } = req.query;
    const scope = await getScope(req.user);
    const regex = search ? new RegExp(escapeRegExp(search), 'i') : null;

    const userCustomers = getScopedUsersByType(scope, 'customer');
    const records = userCustomers.map((customer) => ({
      _id: customer._id,
      source: 'User',
      customerName: customer.displayName || customer.companyName || customer.username,
      mobileNo: customer.mobileNo || '',
      email: customer.email || '',
      address: [customer.address, customer.city, customer.state, customer.pincode].filter(Boolean).join(', '),
      dealerName: '',
      subDealerName: '',
      imei: '',
      iccid: '',
      vehicleNo: '',
      status: customer.status || 'Active',
      createdAt: customer.createdAt,
    }));

    const filtered = regex
      ? records.filter((item) => (
        regex.test(item.customerName)
        || regex.test(item.mobileNo)
        || regex.test(item.email)
        || regex.test(item.imei)
        || regex.test(item.iccid)
        || regex.test(item.vehicleNo)
      ))
      : records;

    res.json(filtered);
  } catch (error) {
    console.error('Portal customers error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/renewals', protect, async (req, res) => {
  try {
    const { search = '', status = '' } = req.query;
    const scope = await getScope(req.user);
    const query = buildRequestScopeQuery(scope);

    if (status) {
      query.status = status;
    }

    const searchQuery = buildSearch(search, ['imei', 'customerName', 'dealerName', 'requestId']);
    if (searchQuery) {
      query.$and = query.$and || [];
      query.$and.push(searchQuery);
    }

    const renewals = await RenewalRequest.find(query)
      .populate('customerId', 'displayName username mobileNo email')
      .populate('deviceId', 'imei iccid serialNo msisdn1 msisdn2 expiryDate')
      .sort({ createdAt: -1 });

    res.json(renewals);
  } catch (error) {
    console.error('Portal renewals error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/renewals', protect, async (req, res) => {
  try {
    const { imei, deviceId, customerId, validity = '1 Year', remarks = '' } = req.body;
    const scope = await getScope(req.user);
    const deviceQuery = deviceId ? { _id: deviceId } : { imei };
    const device = await ensureVisibleDevice(deviceQuery, scope);

    if (!device) {
      return res.status(404).json({ message: 'Device not found.' });
    }

    const customer = customerId
      ? await ensureVisibleUser(customerId, scope)
      : device.assignedTo || null;
    const years = validity === '2 Years' ? 2 : 1;
    const currentExpiryDate = device.expiryDate || null;
    const requestedExpiryDate = addYears(currentExpiryDate || new Date(), years);

    const renewal = await RenewalRequest.create({
      requestId: generateRequestId('REN'),
      userId: req.user._id,
      customerId: customer?._id || null,
      deviceId: device._id,
      imei: device.imei,
      customerName: customer ? labelForUser(customer) : '',
      dealerName: device.dealerName || '',
      validity,
      currentExpiryDate,
      requestedExpiryDate,
      remarks,
      status: 'Requested',
    });

    res.status(201).json({
      message: 'Renewal request created successfully.',
      renewal,
    });
  } catch (error) {
    console.error('Portal create renewal error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/renewals/:id', protect, async (req, res) => {
  try {
    const scope = await getScope(req.user);
    const query = {
      _id: req.params.id,
      ...buildRequestScopeQuery(scope),
    };
    const renewal = await RenewalRequest.findOne(query);

    if (!renewal) {
      return res.status(404).json({ message: 'Renewal request not found.' });
    }

    if (req.body.status) renewal.status = req.body.status;
    if (req.body.remarks !== undefined) renewal.remarks = req.body.remarks;

    await renewal.save();
    res.json(renewal);
  } catch (error) {
    console.error('Portal update renewal error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/reports', protect, async (req, res) => {
  try {
    const scope = await getScope(req.user);
    const deviceScopeQuery = buildDeviceScopeQuery(scope);
    const requestScopeQuery = buildRequestScopeQuery(scope);
    const now = new Date();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const [devices, renewals] = await Promise.all([
      Device.find(deviceScopeQuery).populate('assignedTo', 'displayName username userType'),
      RenewalRequest.find(requestScopeQuery),
    ]);
    const customers = getScopedUsersByType(scope, 'customer');

    const byDealer = devices.reduce((acc, device) => {
      const key = device.dealerName || 'Unassigned Dealer';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    res.json({
      customerReports: {
        totalRecords: customers.length,
        activeRecords: customers.filter((item) => item.status !== 'Inactive').length,
        inactiveRecords: customers.filter((item) => item.status === 'Inactive').length,
      },
      deviceReports: {
        totalDevices: devices.length,
        activeDevices: devices.filter((item) => ['Active', 'Activated'].includes(item.status)).length,
        availableDevices: devices.filter((item) => !item.assignedTo).length,
        assignedDevices: devices.filter((item) => item.assignedTo).length,
        expiredDevices: devices.filter((item) => item.expiryDate && item.expiryDate < now).length,
      },
      renewalReports: {
        totalRenewals: renewals.length,
        pendingRenewals: renewals.filter((item) => ['Requested', 'Processing'].includes(item.status)).length,
        completedRenewals: renewals.filter((item) => item.status === 'Completed').length,
        renewalDueDevices: devices.filter((item) => item.expiryDate && item.expiryDate >= now && item.expiryDate <= dueDate).length,
      },
      dealerReports: Object.entries(byDealer).map(([dealerName, count]) => ({ dealerName, count })),
    });
  } catch (error) {
    console.error('Portal reports error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/login-logs', protect, async (req, res) => {
  try {
    const scope = await getScope(req.user);
    const query = scope.role === 'ADMIN'
      ? { action: { $in: ['LOGIN_SUCCESS', 'LOGIN_FAILED'] } }
      : { userId: { $in: scope.userIds }, action: { $in: ['LOGIN_SUCCESS', 'LOGIN_FAILED'] } };

    const logs = await AuditLog.find(query)
      .populate('userId', 'displayName username userType')
      .sort({ timestamp: -1 })
      .limit(100);

    res.json(logs);
  } catch (error) {
    console.error('Portal login logs error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
