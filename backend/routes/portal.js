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
  syncDueForUser,
  syncDueForUsers,
} = require('../services/dueService');

const router = express.Router();

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Multer Storage Configuration for Renewal Screenshot Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '..', 'uploads', 'screenshots');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only images (jpg, jpeg, png, gif) and PDF files are allowed.'));
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

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
      { dealerId: { $in: scope.userIds } },
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

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const expiringThisMonthCount = await Device.countDocuments({
      ...deviceScopeQuery,
      expiryDate: { $gte: monthStart, $lte: monthEnd },
    });

    let dashboardTotalDevices = totalDevices;
    let dashboardAssignedDevices = assignedDevices;
    let dashboardActiveDevices = activeDevices;
    let dashboardAvailableDevices = availableDevices;
    let dashboardRenewalDueDevices = renewalDueDevices;
    let expiringThisMonth = expiringThisMonthCount;
    let totalDues = 0;
    let totalRenewalDues = 0;

    if (scope.role === 'DEALER') {
      const selfId = req.user._id;

      const dealerDeviceQuery = deviceScopeQuery;

      const unpaidRenewalQuery = {
        dealerId: selfId,
        status: { $ne: 'Rejected' },
        paymentStatus: { $in: ['Pending', 'Partially Paid'] },
      };

      const [
        dealerAssignedCount,
        dealerActivatedCount,
        renewalDueDeviceImeis,
        renewalDueSummary,
        dueRecord,
      ] = await Promise.all([
        Device.countDocuments(dealerDeviceQuery),
        Device.countDocuments({
          $and: [
            dealerDeviceQuery,
            {
              $or: [
                { status: { $in: ['Active', 'Activated'] } },
                { deviceStatus: 'active' },
                { activationRequestStatus: 'active' },
              ],
            },
          ],
        }),
        RenewalRequest.distinct('imei', { dealerId: selfId, status: { $ne: 'Rejected' }, paymentStatus: { $ne: 'Cancelled' } }),
        RenewalRequest.aggregate([
          {
            $match: {
              dealerId: selfId,
              status: { $ne: 'Rejected' },
              paymentStatus: { $ne: 'Cancelled' },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: { $ifNull: ['$billAmount', 0] } },
            },
          },
        ]),
        syncDueForUser(selfId),
      ]);

      dashboardTotalDevices = dealerAssignedCount;
      dashboardAssignedDevices = dealerAssignedCount;
      dashboardActiveDevices = dealerActivatedCount;
      dashboardAvailableDevices = Math.max(dealerAssignedCount - dealerActivatedCount, 0);
      dashboardRenewalDueDevices = renewalDueDeviceImeis.length;
      totalDues = Number(dueRecord?.totalBillAmount) || 0;
      totalRenewalDues = Number(renewalDueSummary[0]?.total) || 0;
    }

    res.json({
      role: scope.role,
      totalDealers: dealers.length,
      totalSubDealers: subDealers.length,
      totalCustomers: customerKeys.size,
      totalDevices: dashboardTotalDevices,
      activeDevices: dashboardActiveDevices,
      expiredDevices,
      devicesAddedToday,
      renewalDueDevices: dashboardRenewalDueDevices,
      assignedDevices: dashboardAssignedDevices,
      availableDevices: dashboardAvailableDevices,
      activeCustomers: customerRecords.filter((item) => item.status !== 'Inactive').length,
      totalRenewals,
      pendingRenewals,
      totalProducts,
      expiringThisMonth,
      totalDues,
      totalRenewalDues,
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

    if (req.body.username !== undefined) {
      const username = String(req.body.username).trim();
      if (!username) {
        return res.status(400).json({ message: 'Username cannot be empty.' });
      }
      if (username !== user.username) {
        const usernameExists = await User.findOne({ username });
        if (usernameExists) {
          return res.status(400).json({ message: 'Username is already taken.' });
        }
        user.username = username;
      }
    }

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

    const parsedLimit = Math.min(parseInt(limit, 10) || 100, 100000);
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

    const isSubDealer = scope.role === 'SUB_DEALER';
    const sanitizedDevices = devices.map((device) => {
      if (isSubDealer) {
        const dObj = device.toObject ? device.toObject() : device;
        dObj.billAmount = 0;
        dObj.renewalAmount = 0;
        return dObj;
      }
      return device;
    });

    res.json({
      devices: sanitizedDevices,
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
        if (scope.role === 'DEALER' && subDealer) {
          const isCurrentlyDealerDevice = 
            (duplicate.dealerId && duplicate.dealerId.toString() === req.user._id.toString()) ||
            (duplicate.assignedTo && duplicate.assignedTo.toString() === req.user._id.toString());

          if (isCurrentlyDealerDevice) {
            const presentDateVal = rawDevice.presentDate ? new Date(rawDevice.presentDate) : new Date();
            const validityVal = rawDevice.validity === '2 Years' || rawDevice.validity === '2 Year' ? '2 Years' : '1 Year';
            const expiryDateVal = addYears(presentDateVal, validityVal === '2 Years' ? 2 : 1);

            duplicate.userId = subDealer._id;
            duplicate.subDealerId = subDealer._id;
            duplicate.subDealerName = labelForUser(subDealer);
            duplicate.assignedTo = subDealer._id;
            duplicate.updatedAt = new Date();
            if (rawDevice.msisdn1) duplicate.msisdn1 = rawDevice.msisdn1;
            if (rawDevice.msisdn2) duplicate.msisdn2 = rawDevice.msisdn2;
            if (rawDevice.itrNo) duplicate.itrNo = String(rawDevice.itrNo).trim();
            if (rawDevice.vendor) duplicate.vendor = String(rawDevice.vendor).trim();
            duplicate.validity = validityVal;
            duplicate.presentDate = presentDateVal;
            duplicate.expiryDate = expiryDateVal;

            duplicate.assignmentHistory.push({
              fromUser: req.user._id,
              toUser: subDealer._id,
              action: 'Assigned',
              note: 'Assigned by dealer through bulk device assignment',
              changedBy: req.user._id,
            });

            await duplicate.save();
            await syncDueForUsers([req.user._id, subDealer._id]);
            
            created.push(duplicate);
            continue;
          }
        }

        skipped.push({ imei, reason: 'Duplicate IMEI, ICCID, or Serial No.' });
        continue;
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

    if (created.length > 0) {
      const dueOwnerIds = created.flatMap(getDueOwnerIdsFromDevice);
      await syncDueForUsers(dueOwnerIds);
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

    const affectedUserIds = [previousAssignee, nextAssignee].filter(Boolean);
    if (device.dealerId) affectedUserIds.push(device.dealerId);
    if (device.subDealerId) affectedUserIds.push(device.subDealerId);
    if (device.userId) affectedUserIds.push(device.userId);
    await syncDueForUsers(affectedUserIds);

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

router.get('/renewals/search-imei/:imei', protect, async (req, res) => {
  try {
    const { imei } = req.params;
    if (!/^\d+$/.test(imei)) {
      return res.status(400).json({ message: 'Invalid IMEI number.' });
    }

    const scope = await getScope(req.user);
    const deviceQuery = { imei, ...buildDeviceScopeQuery(scope) };
    const activationQuery = { imei, ...buildRequestScopeQuery(scope) };
    const renewalQuery = { imei, ...buildRequestScopeQuery(scope) };

    const latestRenewal = await RenewalRequest.findOne(renewalQuery).sort({ createdAt: -1 });
    const activation = await ActivationRequest.findOne(activationQuery).sort({ dateTime: -1, createdAt: -1 });
    const device = await Device.findOne(deviceQuery);

    if (!latestRenewal && !device && !activation) {
      return res.status(404).json({ message: 'No details found for the given IMEI.' });
    }

    const customerName = latestRenewal?.customerName || activation?.customerName || '';
    const customerMobile = latestRenewal?.customerMobile || activation?.regMobNo || activation?.regMobNo2 || '';
    const vehicleNumber = latestRenewal?.vehicleNumber || activation?.vehicleNo || '';
    const deviceModel = latestRenewal?.deviceModel || device?.vendor || activation?.vendor || '';

    let activationType = 'NIC';
    if (latestRenewal?.activationType) {
      activationType = latestRenewal.activationType;
    } else if (activation?.activationMode) {
      const mode = activation.activationMode.toUpperCase();
      if (mode === 'MINING' || mode === 'RENEWAL MINING') {
        activationType = 'MINING';
      }
    } else if (activation?.plan) {
      const plan = activation.plan.toUpperCase();
      if (plan.includes('MINING')) {
        activationType = 'MINING';
      }
    }

    const validity = latestRenewal?.validity || device?.validity || activation?.validity || '1 Year';

    let renewalDate = device?.expiryDate || latestRenewal?.newExpiryDate || activation?.expiryDate || null;
    if (renewalDate) {
      renewalDate = new Date(renewalDate).toISOString().split('T')[0];
    }

    const billAmount = latestRenewal?.billAmount || device?.renewalAmount || device?.billAmount || 0;

    let productDescription = latestRenewal?.productDescription || 'Renewal';
    if (!latestRenewal) {
      if (device?.deviceType === 'GPS') {
        productDescription = 'GPS RENEWAL';
      } else if (device?.deviceType === 'VLTD') {
        productDescription = 'VLTD RENEWAL';
      } else if (activation?.requestType === 'Recharge Plan' || activation?.requestType === 'Top-up') {
        productDescription = 'Renewal';
      }
    }

    res.json({
      dealerId: latestRenewal?.dealerId || device?.dealerId || activation?.userId || '',
      customerName,
      customerMobile,
      imei,
      vehicleNumber,
      deviceModel,
      activationType,
      productDescription,
      validity,
      renewalDate,
      billAmount,
    });
  } catch (error) {
    console.error('Search IMEI error:', error.message);
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
      activationType = '',
      productDescription,
      validity = '1 Year',
      renewalDate,
      billAmount,
      paymentMode = '',
      remarks = ''
    } = req.body;

    if (!dealerId || !customerName || !customerMobile || !imei || !vehicleNumber || !deviceModel || !activationType || !productDescription || !renewalDate || !billAmount) {
      return res.status(400).json({ message: 'Please fill in all required fields.' });
    }

    if (!['NIC', 'MINING'].includes(activationType)) {
      return res.status(400).json({ message: 'Activation Type must be NIC or MINING.' });
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
      dealerCode: dealer.username || '',
      createdBy: req.user._id,
      customerName,
      customerMobile,
      imei,
      vehicleNumber,
      deviceModel,
      activationType,
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

    if (req.body.status !== undefined && req.body.status !== renewal.status) {
      if (renewal.status === 'Activated' || renewal.status === 'Completed') {
        return res.status(400).json({ message: 'Cannot change status of an activated or completed renewal request.' });
      }
    }

    const fields = [
      'dealerId',
      'customerName',
      'customerMobile',
      'imei',
      'vehicleNumber',
      'deviceModel',
      'activationType',
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

    if (req.body.status === 'Activated') {
      const imeiToFind = (renewal.imei || '').trim();
      let device = await Device.findOne({ imei: imeiToFind });
      if (!device) {
        device = new Device({
          userId: renewal.userId,
          dealerId: renewal.dealerId,
          imei: imeiToFind,
          serialNo: imeiToFind,
          deviceName: renewal.deviceModel || 'Aquila Track Bharat 101 With IRNSS',
          dealerName: renewal.dealerName,
          validity: renewal.validity,
          presentDate: renewal.renewalDate,
          expiryDate: renewal.newExpiryDate,
          deviceStatus: 'active',
          status: 'Activated',
          renewalAmount: renewal.billAmount,
          billAmount: renewal.billAmount,
        });
      } else {
        device.presentDate = renewal.renewalDate;
        device.expiryDate = renewal.newExpiryDate;
        device.validity = renewal.validity;
        device.deviceStatus = 'active';
        device.status = 'Activated';
        device.renewalAmount = renewal.billAmount;
      }
      await device.save();

      const ownerIds = getDueOwnerIdsFromDevice(device);
      if (ownerIds && ownerIds.length > 0) {
        await syncDueForUsers(ownerIds);
      }
    }

    res.json(renewal);
  } catch (error) {
    console.error('Portal update renewal error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/portal/renewals/:id/report-payment
// @desc    Dealer uploads payment screenshot and payment details for a specific renewal request
// @access  Protected (Dealer/Sub Dealer)
router.put('/renewals/:id/report-payment', protect, upload.single('screenshot'), async (req, res) => {
  try {
    const { paymentMode, transactionId, paymentDate, remarks } = req.body;
    const receivedAmount = Number(req.body.receivedAmount);

    if (isNaN(receivedAmount) || receivedAmount <= 0) {
      return res.status(400).json({ message: 'Valid payment amount is required.' });
    }

    const renewal = await RenewalRequest.findById(req.params.id);
    if (!renewal) {
      return res.status(404).json({ message: 'Renewal request not found.' });
    }

    const userRole = getPortalRole(req.user);
    if (userRole !== 'ADMIN' && String(renewal.dealerId) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Unauthorized.' });
    }

    if (!paymentMode || !['Cash', 'UPI', 'NEFT', 'Bank Transfer', 'Cheque'].includes(paymentMode)) {
      return res.status(400).json({ message: 'Valid payment mode is required.' });
    }

    let finalTxId = (transactionId || '').trim();
    if (paymentMode === 'UPI') {
      if (!finalTxId) {
        return res.status(400).json({ message: 'Transaction ID / Reference Number is required for UPI payments.' });
      }
      if (!/^\d{12}$/.test(finalTxId)) {
        return res.status(400).json({ message: 'For UPI payments, the Transaction ID/Reference number must be exactly 12 numeric digits.' });
      }
    } else {
      if (!finalTxId) {
        finalTxId = `${paymentMode.toUpperCase().replace(/\s+/g, '')}-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      }
    }

    let screenshotUrl = renewal.screenshotUrl || '';
    if (req.file) {
      screenshotUrl = `/uploads/screenshots/${req.file.filename}`;
    } else if (paymentMode === 'UPI' && !screenshotUrl) {
      return res.status(400).json({ message: 'Payment screenshot proof is required for UPI payments.' });
    }

    renewal.receivedAmount = receivedAmount;
    renewal.paymentMode = paymentMode;
    renewal.transactionId = finalTxId;
    if (paymentDate) {
      const parsed = new Date(paymentDate);
      if (!isNaN(parsed.getTime())) {
        renewal.paymentDate = parsed;
      }
    }
    if (remarks) {
      renewal.remarks = remarks.trim();
    }
    
    // Set status to Under Review so Admin must verify it
    renewal.status = 'Under Review';
    renewal.screenshotUrl = screenshotUrl;

    await renewal.save();

    res.json({ message: 'Payment proof submitted successfully for verification.', renewal });
  } catch (error) {
    console.error('Report renewal payment error:', error.message);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   PUT /api/portal/renewals/report-bulk-payment
// @desc    Dealer uploads payment screenshot and payment details for multiple renewal requests
// @access  Protected (Dealer/Sub Dealer)
router.put('/renewals/report-bulk-payment', protect, upload.single('screenshot'), async (req, res) => {
  try {
    const { requestIdsJson, paymentMode, transactionId, paymentDate, remarks } = req.body;
    let totalReceived = Number(req.body.receivedAmount);

    if (!requestIdsJson) {
      return res.status(400).json({ message: 'Request IDs are required.' });
    }

    const requestIds = JSON.parse(requestIdsJson);
    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      return res.status(400).json({ message: 'Valid Request IDs array is required.' });
    }

    if (isNaN(totalReceived) || totalReceived <= 0) {
      return res.status(400).json({ message: 'Valid payment amount is required.' });
    }

    if (!paymentMode || !['Cash', 'UPI', 'NEFT', 'Bank Transfer', 'Cheque'].includes(paymentMode)) {
      return res.status(400).json({ message: 'Valid payment mode is required.' });
    }

    let finalTxId = (transactionId || '').trim();
    if (paymentMode === 'UPI') {
      if (!finalTxId) {
        return res.status(400).json({ message: 'Transaction ID / Reference Number is required for UPI payments.' });
      }
      if (!/^\d{12}$/.test(finalTxId)) {
        return res.status(400).json({ message: 'For UPI payments, the Transaction ID/Reference number must be exactly 12 numeric digits.' });
      }
    } else {
      if (!finalTxId) {
        finalTxId = `${paymentMode.toUpperCase().replace(/\s+/g, '')}-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      }
    }

    const renewals = await RenewalRequest.find({ _id: { $in: requestIds } });
    if (renewals.length === 0) {
      return res.status(404).json({ message: 'No matching renewal requests found.' });
    }

    const userRole = getPortalRole(req.user);
    if (userRole !== 'ADMIN') {
      const unauthorized = renewals.some(r => String(r.dealerId) !== String(req.user._id));
      if (unauthorized) {
        return res.status(403).json({ message: 'Unauthorized access to some requests.' });
      }
    }

    let screenshotUrl = '';
    if (req.file) {
      screenshotUrl = `/uploads/screenshots/${req.file.filename}`;
    } else if (paymentMode === 'UPI') {
      return res.status(400).json({ message: 'Payment screenshot proof is required for UPI payments.' });
    }

    let parsedDate = new Date();
    if (paymentDate) {
      const parsed = new Date(paymentDate);
      if (!isNaN(parsed.getTime())) {
        parsedDate = parsed;
      }
    }

    let remainingPayment = totalReceived;
    for (let r of renewals) {
      const remainingDueForRequest = r.billAmount - (r.receivedAmount || 0);
      if (remainingDueForRequest <= 0) continue;

      if (remainingPayment <= 0) {
        r.status = 'Under Review';
        r.transactionId = finalTxId;
        r.paymentMode = paymentMode;
        r.paymentDate = parsedDate;
        if (remarks) r.remarks = remarks.trim();
        if (screenshotUrl) r.screenshotUrl = screenshotUrl;
        await r.save();
        continue;
      }

      let alloc = 0;
      if (remainingPayment >= remainingDueForRequest) {
        alloc = remainingDueForRequest;
        remainingPayment -= remainingDueForRequest;
      } else {
        alloc = remainingPayment;
        remainingPayment = 0;
      }

      r.receivedAmount = (r.receivedAmount || 0) + alloc;
      r.status = 'Under Review';
      r.transactionId = finalTxId;
      r.paymentMode = paymentMode;
      r.paymentDate = parsedDate;
      if (remarks) r.remarks = remarks.trim();
      if (screenshotUrl) r.screenshotUrl = screenshotUrl;
      await r.save();
    }

    res.json({ message: 'Bulk payment reported successfully for verification.' });
  } catch (error) {
    console.error('Report bulk payment error:', error.message);
    res.status(500).json({ message: error.message || 'Server error' });
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
      overdueDue: 0,
      pendingRequestsCount: 0,
      paidRequestsCount: 0,
      overdueRequestsCount: 0,
    };

    renewals.forEach(r => {
      if (r.status === 'Rejected' || r.paymentStatus === 'Cancelled') return;

      const rDate = new Date(r.renewalDate);

      const remaining = r.remainingDue || 0;
      const received = r.receivedAmount || 0;

      summary.totalDue += remaining;
      summary.paidAmount += received;

      if (rDate >= todayStart) {
        summary.todayDue += remaining;
      }

      if (r.paymentStatus === 'Pending' || r.paymentStatus === 'Partially Paid') {
        summary.pendingDue += remaining;
        summary.pendingRequestsCount += 1;
      } else if (r.paymentStatus === 'Paid') {
        summary.paidRequestsCount += 1;
      }

      if (r.paymentStatus !== 'Paid' && rDate < thirtyDaysAgo) {
        summary.overdueDue += remaining;
        summary.overdueRequestsCount += 1;
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

// ─── DEALER DASHBOARD SUMMARY ──────────────────────────────────────────────
// @route   GET /api/portal/dealer-dashboard-summary
// @desc    Returns renewal-focused dashboard metrics strictly for the logged-in dealer.
//          Also usable by ADMIN (scoped to full dataset) but primarily for DEALER.
// @access  Protected
router.get('/dealer-dashboard-summary', protect, async (req, res) => {
  try {
    const scope = await getScope(req.user);
    const role = scope.role;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const renewalQuery = role === 'DEALER'
      ? { dealerId: req.user._id }
      : role === 'SUB_DEALER'
        ? { userId: req.user._id }
        : {};

    const deviceQuery = buildDeviceScopeQuery(scope);

    const unpaidRenewalQuery = {
      ...renewalQuery,
      status: { $ne: 'Rejected' },
      paymentStatus: { $in: ['Pending', 'Partially Paid'] },
    };

    const [
      assignedDevices,
      activatedDevices,
      expiringThisMonth,
      renewalDueDeviceImeis,
      renewalDueSummary,
      overdueRenewalSummary,
      todaysRenewalSummary,
      dueRecord,
      renewalPaidSummary,
    ] = await Promise.all([
      Device.countDocuments(deviceQuery),
      Device.countDocuments({
        $and: [
          deviceQuery,
          {
            $or: [
              { status: { $in: ['Active', 'Activated'] } },
              { deviceStatus: 'active' },
              { activationRequestStatus: 'active' },
            ],
          },
        ],
      }),
      Device.countDocuments({
        $and: [
          deviceQuery,
          { expiryDate: { $gte: monthStart, $lte: monthEnd } },
        ],
      }),
      RenewalRequest.distinct('imei', renewalQuery),
      RenewalRequest.aggregate([
        {
          $match: {
            ...renewalQuery,
            status: { $ne: 'Rejected' },
            paymentStatus: { $ne: 'Cancelled' },
          },
        },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$billAmount', 0] } } } },
      ]),
      RenewalRequest.aggregate([
        {
          $match: {
            ...unpaidRenewalQuery,
            renewalDate: { $lt: thirtyDaysAgo },
          },
        },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$remainingDue', 0] } } } },
      ]),
      RenewalRequest.aggregate([
        {
          $match: {
            ...renewalQuery,
            status: { $ne: 'Rejected' },
            paymentStatus: { $ne: 'Cancelled' },
            paymentDate: { $gte: todayStart, $lte: todayEnd },
          },
        },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$receivedAmount', 0] } } } },
      ]),
      ['DEALER', 'SUB_DEALER'].includes(role) ? syncDueForUser(req.user._id) : Promise.resolve(null),
      RenewalRequest.aggregate([
        {
          $match: {
            ...renewalQuery,
            status: { $ne: 'Rejected' },
            paymentStatus: { $ne: 'Cancelled' },
          },
        },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$receivedAmount', 0] } } } },
      ]),
    ]);
    const deviceTotalBillAmount = dueRecord ? dueRecord.totalBillAmount || 0 : 0;
    const deviceTotalPaidAmount = dueRecord ? dueRecord.totalPaidAmount || 0 : 0;
    const totalRenewalPaid = renewalPaidSummary[0]?.total || 0;

    const totalBillAmount = deviceTotalBillAmount + totalRenewalDues;
    const totalPaidAmount = deviceTotalPaidAmount + totalRenewalPaid;
    const remainingDues = Math.max(totalBillAmount - totalPaidAmount, 0);

    const todaysDeviceRevenue = ['DEALER', 'SUB_DEALER'].includes(role)
      ? await DuePayment.aggregate([
        {
          $match: {
            userId: req.user._id,
            paymentDate: { $gte: todayStart, $lte: todayEnd },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]).then((rows) => rows[0]?.total || 0)
      : 0;

    const latestRenewals = await RenewalRequest.find(renewalQuery)
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({
      role,
      assignedDevices,
      totalSubDealers: scope.users.filter((item) => getPortalRole(item) === 'SUB_DEALER').length,
      renewalDueDevices: renewalDueDeviceImeis.length,
      availableDevices: Math.max(assignedDevices - activatedDevices, 0),
      totalDevices: assignedDevices,
      expiringThisMonth,
      totalDues: deviceTotalBillAmount,
      totalRenewalDues,
      totalRenewalDue: totalRenewalDues,
      myTotalOutstanding: remainingDues,
      myCurrentDue: remainingDues,
      todaysRevenue: todaysDeviceRevenue + (Number(todaysRenewalSummary[0]?.total) || 0),
      totalBillAmount,
      totalPaidAmount,
      remainingDues,
      latestRenewals,
    });
  } catch (error) {
    console.error('Dealer dashboard summary error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

