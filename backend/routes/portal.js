const express = require('express');
const Device = require('../models/Device');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const RenewalRequest = require('../models/RenewalRequest');
const DuePayment = require('../models/DuePayment');
const ActivationRequest = require('../models/ActivationRequest');
const Product = require('../models/Product');
const { protect } = require('../middleware/auth');
const {
  getDueOwnerIdsFromDevice,
  syncDueForScope,
  syncDueForUsers,
} = require('../services/dueService');

const router = express.Router();

const getPortalRole = (user) => {
  if (!user) return null;
  if (user.role === 'partner') return 'ADMIN';
  if (user.userType === 'Administration') return 'ADMIN';
  if (user.userType === 'Sub Dealer') return 'SUB_DEALER';
  return 'DEALER';
};

const operationsRoles = ['ADMIN', 'DEALER'];

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

const buildProductScopeQuery = (scope) => {
  if (scope.role === 'ADMIN') {
    return {};
  }

  return {
    $or: [
      { userId: { $in: scope.userIds } },
      { dealerId: { $in: scope.userIds } },
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
    return users.filter((item) => item.role === 'customer' && !item.parentId && !['Administration'].includes(item.userType));
  }

  if (type === 'subDealer') {
    return users.filter((item) => item.userType === 'Sub Dealer');
  }

  if (type === 'customer') {
    return [];
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
    const customerRecords = await ActivationRequest.find(requestScopeQuery)
      .select('customerName regMobNo status')
      .lean();
    const customerKeys = new Set(
      customerRecords.map((item) => item.regMobNo || item.customerName).filter(Boolean)
    );

    // Role-aware device counting:
    // For ADMIN/DEALER: available = assignedTo null, assigned = assignedTo not null (across full scope)
    // For SUB_DEALER: available = devices in their stock (assignedTo null OR assignedTo = self),
    //                 assigned  = devices already forwarded (assignedTo not null AND not self)
    const isSubDealer = scope.role === 'SUB_DEALER';
    const selfId = req.user._id;

    const availableQuery = isSubDealer
      ? { $and: [deviceScopeQuery, { $or: [{ assignedTo: null }, { assignedTo: selfId }] }] }
      : { ...deviceScopeQuery, assignedTo: null };

    const assignedQuery = isSubDealer
      ? { $and: [deviceScopeQuery, { assignedTo: { $nin: [null, selfId] } }] }
      : { ...deviceScopeQuery, assignedTo: { $ne: null } };

    const productScopeQuery = buildProductScopeQuery(scope);

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
      totalProducts,
    ] = await Promise.all([
      Device.countDocuments(deviceScopeQuery),
      Device.countDocuments({ ...deviceScopeQuery, status: { $in: ['Active', 'Activated'] } }),
      Device.countDocuments({ ...deviceScopeQuery, expiryDate: { $lt: now, $ne: null } }),
      Device.countDocuments({ ...deviceScopeQuery, presentDate: { $gte: todayStart, $lte: todayEnd } }),
      Device.countDocuments(availableQuery),
      Device.countDocuments(assignedQuery),
      Device.countDocuments({ ...deviceScopeQuery, expiryDate: { $gte: now, $lte: dueDate } }),
      RenewalRequest.countDocuments(requestScopeQuery),
      RenewalRequest.countDocuments({ ...requestScopeQuery, status: { $in: ['Requested', 'Processing'] } }),
      Product.countDocuments(productScopeQuery),
    ]);

    res.json({
      role: scope.role,
      totalDealers: dealers.length,
      totalSubDealers: subDealers.length,
      totalCustomers: customerKeys.size,
      totalDevices,
      activeDevices,
      expiredDevices,
      devicesAddedToday,
      renewalDueDevices,
      assignedDevices,
      availableDevices,
      activeCustomers: customerRecords.filter((item) => item.status !== 'Inactive').length,
      totalRenewals,
      pendingRenewals,
      totalProducts,
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

    // Fetch device counts for the matched users
    const userIds = users.map((u) => u._id);
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

    users = users.map((user) => {
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
      if (scope.role === 'ADMIN' && parentId) {
        const dealer = await ensureVisibleUser(parentId, scope);
        if (!dealer || getPortalRole(dealer) !== 'DEALER') {
          return res.status(404).json({ message: 'Selected dealer not found.' });
        }
        nextParentId = dealer._id;
      } else if (scope.role === 'ADMIN') {
        return res.status(400).json({ message: 'Please select a dealer for this Sub Dealer.' });
      } else if (scope.role === 'DEALER') {
        nextParentId = req.user._id;
      }
    } else {
      return res.status(403).json({ message: 'Only Dealer and Sub Dealer users can be created.' });
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

    if (scope.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Forbidden: Only Admins are allowed to edit users.' });
    }

    const user = await ensureVisibleUser(req.params.id, scope);

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (user._id.toString() === req.user._id.toString()) {
      return res.status(403).json({ message: 'You cannot manage your own profile here.' });
    }

    const targetRole = getPortalRole(user);
    if (!targetRole) {
      return res.status(403).json({ message: 'Unsupported account type.' });
    }

    if (scope.role === 'DEALER' && targetRole !== 'SUB_DEALER') {
      return res.status(403).json({ message: 'Dealers cannot manage Admins or Dealers.' });
    }

    if (req.body.userType) {
      const allowedTypes = scope.role === 'ADMIN' ? ['Dealer', 'Sub Dealer'] : ['Sub Dealer'];
      if (!allowedTypes.includes(req.body.userType)) {
        return res.status(403).json({ message: 'You cannot assign this user type.' });
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

    if (user.userType === 'Dealer') {
      user.parentId = null;
    } else if (user.userType === 'Sub Dealer' && scope.role === 'ADMIN') {
      if (req.body.parentId !== undefined) {
        const parentId = req.body.parentId;
        if (parentId) {
          const dealer = await ensureVisibleUser(parentId, scope);
          if (!dealer || getPortalRole(dealer) !== 'DEALER') {
            return res.status(404).json({ message: 'Selected dealer not found.' });
          }
          user.parentId = dealer._id;
        } else {
          return res.status(400).json({ message: 'Please select a valid parent dealer for this Sub Dealer.' });
        }
      }
    }

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

    if (scope.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Forbidden: Only Admins are allowed to reset user passwords.' });
    }

    const user = await ensureVisibleUser(req.params.id, scope);
    const { password } = req.body;

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (user._id.toString() === req.user._id.toString()) {
      return res.status(403).json({ message: 'You cannot reset your own password here.' });
    }

    const targetRole = getPortalRole(user);
    if (!targetRole || (scope.role === 'DEALER' && targetRole !== 'SUB_DEALER')) {
      return res.status(403).json({ message: 'You cannot manage this account.' });
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
      }

      const rawSubDealerId = String(rawDevice.subDealerId || '').trim();
      const rawSubDealerName = String(rawDevice.subDealerName || '').trim();

      if (rawSubDealerId || rawSubDealerName) {
        subDealer = scope.users.find((item) => {
          if (getPortalRole(item) !== 'SUB_DEALER') return false;
          if (rawSubDealerId && item._id.toString() === rawSubDealerId) return true;
          if (rawSubDealerName && labelForUser(item).toLowerCase() === rawSubDealerName.toLowerCase()) return true;
          return false;
        });

        if (subDealer && dealer && subDealer.parentId?.toString() !== dealer._id.toString()) {
          skipped.push({ imei, reason: 'Selected sub dealer does not belong to the selected dealer.' });
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
    if (targetUser && !['DEALER', 'SUB_DEALER'].includes(getPortalRole(targetUser))) {
      return res.status(400).json({ message: 'Target user must be a Dealer or Sub Dealer.' });
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

    const requests = await ActivationRequest.find(buildRequestScopeQuery(scope))
      .sort({ dateTime: -1 })
      .lean();

    const records = requests.map((request) => ({
      _id: request._id,
      source: 'ActivationRequest',
      customerName: request.customerName || '',
      mobileNo: request.regMobNo || request.regMobNo2 || '',
      email: '',
      address: request.address || '',
      dealerName: request.dealerName || '',
      subDealerName: request.subDealerName || '',
      imei: request.imei || '',
      iccid: request.iccid || '',
      vehicleNo: request.vehicleNo || '',
      expiryDate: request.expiryDate || null,
      status: request.status || 'Processing',
      createdAt: request.dateTime || request.createdAt,
    })).filter((record) => record.customerName || record.mobileNo || record.imei);

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
    const {
      dealerId,
      status,
      customerName,
      imei,
      vehicleNumber,
      fromDate,
      toDate,
    } = req.query;

    const scope = await getScope(req.user);
    const query = buildRequestScopeQuery(scope);

    if (dealerId) {
      query.dealerId = dealerId;
    }
    if (status) {
      query.status = status;
    }
    if (customerName) {
      query.customerName = new RegExp(customerName.trim(), 'i');
    }
    if (imei) {
      query.imei = new RegExp(imei.trim(), 'i');
    }
    if (vehicleNumber) {
      query.vehicleNumber = new RegExp(vehicleNumber.trim(), 'i');
    }
    if (fromDate || toDate) {
      query.renewalDate = {};
      if (fromDate) {
        query.renewalDate.$gte = new Date(fromDate);
      }
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        query.renewalDate.$lte = end;
      }
    }

    const renewals = await RenewalRequest.find(query)
      .populate('userId', 'displayName username userType')
      .sort({ createdAt: -1 });

    res.json(renewals);
  } catch (error) {
    console.error('Portal renewals error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/renewals/stats', protect, async (req, res) => {
  try {
    const scope = await getScope(req.user);
    const query = buildRequestScopeQuery(scope);

    const renewals = await RenewalRequest.find(query);

    const stats = {
      total: renewals.length,
      pending: renewals.filter(r => ['Requested', 'Under Review'].includes(r.status)).length,
      approved: renewals.filter(r => r.status === 'Approved').length,
      rejected: renewals.filter(r => r.status === 'Rejected').length,
      activated: renewals.filter(r => r.status === 'Activated').length,
      todayRevenue: 0,
      monthlyRevenue: 0,
    };

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    renewals.forEach(r => {
      if (r.status !== 'Rejected' && r.billAmount) {
        const rDate = new Date(r.renewalDate);
        if (rDate >= todayStart) {
          stats.todayRevenue += r.billAmount;
        }
        if (rDate >= monthStart) {
          stats.monthlyRevenue += r.billAmount;
        }
      }
    });

    res.json(stats);
  } catch (error) {
    console.error('Portal renewals stats error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/renewals', protect, async (req, res) => {
  try {
    const {
      dealerId,
      customerName,
      customerMobile,
      imei,
      vehicleNumber,
      deviceModel,
      productDescription,
      validity = '1 Year',
      renewalDate,
      billAmount,
      paymentMode,
      remarks = ''
    } = req.body;

    if (!dealerId || !customerName || !customerMobile || !imei || !vehicleNumber || !deviceModel || !productDescription || !renewalDate || !billAmount || !paymentMode) {
      return res.status(400).json({ message: 'Please fill in all required fields.' });
    }

    if (!/^\d{15}$/.test(imei)) {
      return res.status(400).json({ message: 'IMEI must contain exactly 15 digits.' });
    }

    if (Number(billAmount) <= 0) {
      return res.status(400).json({ message: 'Bill Amount cannot be zero or negative.' });
    }

    const dealer = await User.findById(dealerId);
    if (!dealer) {
      return res.status(400).json({ message: 'Selected dealer not found.' });
    }

    // Generate unique sequential Request ID
    const currentYear = new Date().getFullYear();
    const prefix = `REN-${currentYear}-`;
    const latestRequest = await RenewalRequest.findOne({
      requestId: new RegExp(`^${prefix}`)
    }).sort({ requestId: -1 });

    let sequence = 1;
    if (latestRequest) {
      const parts = latestRequest.requestId.split('-');
      const lastSeq = parseInt(parts[2], 10);
      if (!isNaN(lastSeq)) {
        sequence = lastSeq + 1;
      }
    }
    const paddedSequence = String(sequence).padStart(6, '0');
    const requestId = `${prefix}${paddedSequence}`;

    const years = validity === '2 Years' ? 2 : 1;
    const baseDate = new Date(renewalDate);
    const newExpiryDate = addYears(baseDate, years);

    const renewal = await RenewalRequest.create({
      requestId,
      userId: req.user._id,
      dealerId,
      dealerName: labelForUser(dealer),
      customerName,
      customerMobile,
      imei,
      vehicleNumber,
      deviceModel,
      productDescription,
      validity,
      renewalDate: baseDate,
      newExpiryDate,
      billAmount: Number(billAmount),
      paymentMode,
      remarks,
      status: 'Requested',
    });

    res.status(201).json({
      message: 'Renewal Request Created Successfully.',
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

    const fields = [
      'dealerId',
      'customerName',
      'customerMobile',
      'imei',
      'vehicleNumber',
      'deviceModel',
      'productDescription',
      'validity',
      'renewalDate',
      'billAmount',
      'paymentMode',
      'remarks',
      'status',
      'receivedAmount',
      'transactionId',
      'paymentDate',
      'paymentStatus',
    ];

    if (req.body.imei && !/^\d{15}$/.test(req.body.imei)) {
      return res.status(400).json({ message: 'IMEI must contain exactly 15 digits.' });
    }

    if (req.body.billAmount !== undefined && Number(req.body.billAmount) <= 0) {
      return res.status(400).json({ message: 'Bill Amount cannot be zero or negative.' });
    }

    if (req.body.dealerId && req.body.dealerId !== String(renewal.dealerId)) {
      const dealer = await User.findById(req.body.dealerId);
      if (!dealer) {
        return res.status(400).json({ message: 'Selected dealer not found.' });
      }
      renewal.dealerId = dealer._id;
      renewal.dealerName = labelForUser(dealer);
    }

    fields.forEach((field) => {
      if (field === 'dealerId') return; // Handled above
      if (req.body[field] !== undefined) {
        renewal[field] = req.body[field];
      }
    });

    if (req.body.validity || req.body.renewalDate) {
      const baseDate = new Date(renewal.renewalDate);
      const years = renewal.validity === '2 Years' ? 2 : 1;
      renewal.newExpiryDate = addYears(baseDate, years);
    }

    await renewal.save();
    res.json(renewal);
  } catch (error) {
    console.error('Portal update renewal error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/renewals/:id', protect, async (req, res) => {
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

    await RenewalRequest.findByIdAndDelete(renewal._id);
    res.json({ message: 'Renewal Request Deleted Successfully.' });
  } catch (error) {
    console.error('Portal delete renewal error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/renewals/due-summary', protect, async (req, res) => {
  try {
    const scope = await getScope(req.user);
    const query = buildRequestScopeQuery(scope);

    // Sum matching records
    const renewals = await RenewalRequest.find(query);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const summary = {
      totalDue: 0,
      todayDue: 0,
      pendingDue: 0,
      paidAmount: 0,
      overdueDue: 0
    };

    renewals.forEach(r => {
      if (r.status === 'Rejected') return; // skip rejected

      const rDate = new Date(r.renewalDate);

      // Remaining due amount
      const remaining = r.remainingDue || 0;
      const received = r.receivedAmount || 0;

      summary.totalDue += remaining;
      summary.paidAmount += received;

      if (rDate >= todayStart) {
        summary.todayDue += remaining;
      }

      if (r.paymentStatus === 'Pending') {
        summary.pendingDue += remaining;
      }

      // Overdue is not paid and renewal date older than 30 days
      if (r.paymentStatus !== 'Paid' && rDate < thirtyDaysAgo) {
        summary.overdueDue += remaining;
      }
    });

    res.json(summary);
  } catch (error) {
    console.error('Portal renewals due-summary error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/renewals/admin-due-dashboard', protect, async (req, res) => {
  try {
    const scope = await getScope(req.user);
    const { dealerId, paymentStatus, fromDate, toDate, requestId, imei, vehicleNumber } = req.query;

    const query = buildRequestScopeQuery(scope);

    if (dealerId) query.dealerId = dealerId;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (requestId) query.requestId = new RegExp(requestId.trim(), 'i');
    if (imei) query.imei = new RegExp(imei.trim(), 'i');
    if (vehicleNumber) query.vehicleNumber = new RegExp(vehicleNumber.trim(), 'i');
    if (fromDate || toDate) {
      query.renewalDate = {};
      if (fromDate) query.renewalDate.$gte = new Date(fromDate);
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        query.renewalDate.$lte = end;
      }
    }

    // skip rejected ones when computing dues
    query.status = { $ne: 'Rejected' };

    const renewals = await RenewalRequest.find(query).populate('dealerId', 'username');

    const dealerMap = {};

    renewals.forEach(r => {
      const dealerKey = r.dealerId?._id?.toString() || r.dealerName;
      if (!dealerMap[dealerKey]) {
        dealerMap[dealerKey] = {
          dealerId: r.dealerId?._id || null,
          dealerName: r.dealerName,
          dealerCode: r.dealerId?.username || '-',
          pendingRequestsCount: 0,
          totalRenewalAmount: 0,
          receivedAmount: 0,
          remainingDue: 0,
          lastPaymentDate: null,
          paymentStatus: 'Pending',
          rawRequests: []
        };
      }

      const d = dealerMap[dealerKey];
      d.rawRequests.push(r);

      if (r.paymentStatus !== 'Paid') {
        d.pendingRequestsCount += 1;
      }
      d.totalRenewalAmount += r.billAmount || 0;
      d.receivedAmount += r.receivedAmount || 0;
      d.remainingDue += r.remainingDue || 0;

      if (r.paymentDate) {
        const pDate = new Date(r.paymentDate);
        if (!d.lastPaymentDate || pDate > new Date(d.lastPaymentDate)) {
          d.lastPaymentDate = r.paymentDate;
        }
      }
    });

    const result = Object.values(dealerMap).map(d => {
      if (d.remainingDue <= 0) {
        d.paymentStatus = 'Paid';
      } else if (d.receivedAmount > 0) {
        d.paymentStatus = 'Partially Paid';
      } else {
        d.paymentStatus = 'Pending';
      }
      return d;
    });

    res.json(result);
  } catch (error) {
    console.error('Portal admin-due-dashboard error:', error.message);
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

    const [devices, renewals, customerRecords] = await Promise.all([
      Device.find(deviceScopeQuery).populate('assignedTo', 'displayName username userType'),
      RenewalRequest.find(requestScopeQuery),
      ActivationRequest.find(requestScopeQuery).select('customerName regMobNo status').lean(),
    ]);
    const customerKeys = new Set(
      customerRecords.map((item) => item.regMobNo || item.customerName).filter(Boolean)
    );

    const byDealer = devices.reduce((acc, device) => {
      const key = device.dealerName || 'Unassigned Dealer';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    res.json({
      customerReports: {
        totalRecords: customerKeys.size,
        activeRecords: customerRecords.filter((item) => item.status !== 'Inactive').length,
        inactiveRecords: customerRecords.filter((item) => item.status === 'Inactive').length,
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
        pendingRenewals: renewals.filter((item) => ['Requested', 'Under Review', 'Approved', 'Activated'].includes(item.status)).length,
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
