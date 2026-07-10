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
const multer = require('multer');
const ExcelJS = require('exceljs');
const path = require('path');

const router = express.Router();

router.use(protect, attachHierarchyScope);

const deviceManageRoles = [PORTAL_ROLES.ADMIN, PORTAL_ROLES.DEALER, PORTAL_ROLES.SUB_DEALER]; // assign/unassign
const deviceCreateRoles = [PORTAL_ROLES.ADMIN, PORTAL_ROLES.DEALER, PORTAL_ROLES.SUB_DEALER]; // add/edit/delete devices — ADMIN, DEALER, SUB_DEALER allowed

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .csv, .xlsx, and .xls files are allowed.'));
    }
  },
});


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
  const normalized = dealerName.trim().toLowerCase();

  return scope.users.find((candidate) => (
    getPortalRole(candidate) === PORTAL_ROLES.DEALER
    && labelForUser(candidate).trim().toLowerCase() === normalized
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

    const isSubDealer = req.portalRole === PORTAL_ROLES.SUB_DEALER;
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
    console.error('Get devices error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/devices/export
// @desc    Export devices list as a formatted Excel file
// @access  Protected
router.get('/export', async (req, res) => {
  try {
    const { assignedTo } = req.query;

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

    const devices = await populateDevice(Device.find(query)).sort({ createdAt: -1 });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Device Report');

    // Title Block
    sheet.mergeCells('A1:N1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'Device Management Report';
    titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 40;

    // Blank Spacer Row
    sheet.getRow(2).height = 15;

    const headers = [
      'Dealer Name', 'Sub Dealer Name', 'Assigned Customer', 'IMEI', 'ICCID', 
      'Serial No', 'MSISDN 1', 'MSISDN 2', 'Validity', 'Bill Amount',
      'Activation Date', 'Expiry Date', 'Created By', 'Status'
    ];

    const colWidths = [22, 22, 25, 20, 22, 18, 16, 16, 12, 15, 16, 16, 20, 14];
    sheet.columns = headers.map((h, i) => ({ header: h, key: h, width: colWidths[i] }));

    // Format Header Row (Row 3)
    const headerRow = sheet.getRow(3);
    headerRow.values = headers;
    headerRow.height = 26;
    for (let col = 1; col <= headers.length; col++) {
      const cell = headerRow.getCell(col);
      cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } }; // Dark slate
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFBDC3C7' } },
        left: { style: 'thin', color: { argb: 'FFBDC3C7' } },
        bottom: { style: 'medium', color: { argb: 'FF2C3E50' } },
        right: { style: 'thin', color: { argb: 'FFBDC3C7' } }
      };
    }

    const formatDate = (dateVal) => {
      if (!dateVal) return 'N/A';
      const d = new Date(dateVal);
      return isNaN(d.getTime()) ? 'N/A' : d.toISOString().slice(0, 10);
    };

    // Add Data Rows
    devices.forEach((device) => {
      const rowData = [
        device.dealerName || 'N/A',
        device.subDealerName || 'N/A',
        device.assignedTo ? labelForUser(device.assignedTo) : 'N/A',
        device.imei || '',
        device.iccid || '',
        device.serialNo || '',
        device.msisdn1 || '',
        device.msisdn2 || '',
        device.validity || '',
        device.billAmount || 0,
        formatDate(device.presentDate),
        formatDate(device.expiryDate),
        device.createdBy ? labelForUser(device.createdBy) : 'N/A',
        device.status || ''
      ];
      sheet.addRow(rowData);
    });

    // Apply Borders, Alignments & Alternate fills
    for (let i = 4; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      row.height = 20;
      row.eachCell((cell, colNum) => {
        cell.font = { name: 'Arial', size: 10 };
        const centerCols = [4, 5, 6, 7, 8, 9, 10, 11, 12, 14];
        cell.alignment = {
          horizontal: centerCols.includes(colNum) ? 'center' : 'left',
          vertical: 'middle'
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFECF0F1' } },
          left: { style: 'thin', color: { argb: 'FFECF0F1' } },
          bottom: { style: 'thin', color: { argb: 'FFECF0F1' } },
          right: { style: 'thin', color: { argb: 'FFECF0F1' } }
        };
        
        if (i % 2 === 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
        }
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=device_report.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Device export error:', error.message);
    res.status(500).json({ message: 'Server error during export.' });
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

    if (!input.vendor) {
      return res.status(400).json({ message: 'Model (vendor) is required.' });
    }

    if (req.portalRole !== PORTAL_ROLES.ADMIN && input.vendor === 'iTriangle') {
      return res.status(400).json({ message: 'Selection of model iTriangle is restricted to admin only.' });
    }

    if (!input.imei || !input.iccid || !input.serialNo) {
      return res.status(400).json({ message: 'IMEI, ICCID, and Serial No are required.' });
    }

    const ownership = await resolveDeviceOwnership(req, input);
    if (ownership.error) {
      return res.status(ownership.error.status).json({ message: ownership.error.message });
    }

    const duplicate = await findDuplicateDevice(input);
    if (duplicate) {
      if (req.portalRole === PORTAL_ROLES.DEALER && ownership.subDealer) {
        const isCurrentlyDealerDevice = 
          (duplicate.dealerId && duplicate.dealerId.toString() === req.user._id.toString()) ||
          (duplicate.assignedTo && duplicate.assignedTo.toString() === req.user._id.toString());

        if (isCurrentlyDealerDevice) {
          const subDealer = ownership.subDealer;
          const presentDate = input.presentDate || new Date();
          const validity = input.validity === '2 Years' ? '2 Years' : '1 Year';
          const expiryDate = addYears(presentDate, validity === '2 Years' ? 2 : 1);

          duplicate.userId = subDealer._id;
          duplicate.subDealerId = subDealer._id;
          duplicate.subDealerName = labelForUser(subDealer);
          duplicate.assignedTo = subDealer._id;
          duplicate.updatedAt = new Date();
          if (input.msisdn1) duplicate.msisdn1 = input.msisdn1;
          if (input.msisdn2) duplicate.msisdn2 = input.msisdn2;
          if (input.itrNo) duplicate.itrNo = input.itrNo;
          if (input.vendor) duplicate.vendor = input.vendor;
          duplicate.validity = validity;
          duplicate.presentDate = presentDate;
          duplicate.expiryDate = expiryDate;
          if (input.billAmount) duplicate.billAmount = Number(input.billAmount) || 0;

          duplicate.assignmentHistory.push({
            fromUser: req.user._id,
            toUser: subDealer._id,
            action: 'Assigned',
            note: 'Assigned by dealer through device management form',
            changedBy: req.user._id,
          });

          await duplicate.save();
          await syncDueForUsers([req.user._id, subDealer._id]);

          return res.json({
            message: `Device successfully assigned to ${labelForUser(subDealer)}.`,
            device: duplicate,
          });
        }
      }

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

        const transactionUserObj = ownership.subDealer ? ownership.dealer : targetUser;

        transactionCreated = await Transaction.create({
          userId: transactionUserObj._id,
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
          balanceAfterTransaction: transactionUserObj.availableBalance || 0,
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

      // Sync to Product collection
      const Product = require('../models/Product');
      await Product.create({
        userId: deviceCreated.userId,
        dealerId: deviceCreated.dealerId,
        dealerName: deviceCreated.dealerName,
        subDealerId: deviceCreated.subDealerId,
        subDealerName: deviceCreated.subDealerName,
        vendor: deviceCreated.vendor || 'iTriangle',
        productDescription: deviceCreated.deviceType === 'GPS' ? 'GPS' : 'VLTD',
        existingDeviceSearch: '',
        imei: deviceCreated.imei,
        serialNo: deviceCreated.serialNo,
        iccid: deviceCreated.iccid,
        msisdn1: deviceCreated.msisdn1,
        msisdn2: deviceCreated.msisdn2,
        itrNo: deviceCreated.itrNo,
        vehicleNumber: '',
        validity: deviceCreated.validity || '1 Year',
        activationDate: deviceCreated.presentDate,
        expiryDate: deviceCreated.expiryDate,
        billAmount: deviceCreated.billAmount || 0,
        createdBy: req.user._id,
        createdByRole: req.portalRole,
        createdAt: deviceCreated.createdAt,
        updatedAt: deviceCreated.updatedAt || deviceCreated.createdAt,
      });

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
  if (req.user.role !== 'partner') {
    return res.status(403).json({ message: 'Access denied: Only the Admin ID is allowed to edit devices.' });
  }
  try {
    const scopeQuery = buildDeviceScopeQuery(req.hierarchyScope);
    const device = await Device.findOne(combineQueries(scopeQuery, { _id: req.params.id }));
    if (!device) {
      return res.status(404).json({ message: 'Device not found or access denied.' });
    }

    const originalImei = device.imei;
    const input = normalizeDeviceInput(req.body);

    if (!input.vendor) {
      return res.status(400).json({ message: 'Model (vendor) is required.' });
    }

    if (req.portalRole !== PORTAL_ROLES.ADMIN && input.vendor === 'iTriangle') {
      return res.status(400).json({ message: 'Selection of model iTriangle is restricted to admin only.' });
    }

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

    const oldFinancialUserId = device.subDealerId ? device.dealerId : device.userId;
    const newFinancialUserId = ownership.subDealer ? ownership.dealer?._id : ownership.ownerId;

    const isSameFinancialOwner = oldFinancialUserId && newFinancialUserId && oldFinancialUserId.toString() === newFinancialUserId.toString();
    const oldFinancialOwner = await User.findById(oldFinancialUserId);
    const newFinancialOwner = isSameFinancialOwner ? oldFinancialOwner : await User.findById(newFinancialUserId);

    if (!newFinancialOwner) {
      return res.status(404).json({ message: 'Target financial user not found for wallet check.' });
    }

    let transactionsCreated = [];

    try {
      if (isSameFinancialOwner) {
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
            userId: newFinancialOwner._id,
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
            balanceAfterTransaction: newFinancialOwner.availableBalance || 0,
            createdBy: req.user._id,
          });
          transactionsCreated.push(transaction);
        }
      } else {
        // Refund old owner
        if (oldFinancialOwner && oldBillAmount > 0) {
          const randomNum = Math.floor(10000 + Math.random() * 90000);
          const date = new Date();
          const mm = String(date.getMonth() + 1).padStart(2, '0');
          const dd = String(date.getDate()).padStart(2, '0');
          const transactionId = `ITR_${mm}_${dd}_${randomNum}`;

          const transaction = await Transaction.create({
            userId: oldFinancialOwner._id,
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
            balanceAfterTransaction: oldFinancialOwner.availableBalance || 0,
            createdBy: req.user._id,
          });
          transactionsCreated.push(transaction);
        }

        // Charge new owner
        if (newFinancialOwner && newBillAmount > 0) {
          const randomNum = Math.floor(10000 + Math.random() * 90000);
          const date = new Date();
          const mm = String(date.getMonth() + 1).padStart(2, '0');
          const dd = String(date.getDate()).padStart(2, '0');
          const transactionId = `ITR_${mm}_${dd}_${randomNum}`;

          const transaction = await Transaction.create({
            userId: newFinancialOwner._id,
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
            balanceAfterTransaction: newFinancialOwner.availableBalance || 0,
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

      // Sync update to Product collection
      const Product = require('../models/Product');
      await Product.findOneAndUpdate(
        { imei: originalImei },
        {
          userId: device.userId,
          dealerId: device.dealerId,
          dealerName: device.dealerName,
          subDealerId: device.subDealerId,
          subDealerName: device.subDealerName,
          vendor: device.vendor || 'iTriangle',
          productDescription: device.deviceType === 'GPS' ? 'GPS' : 'VLTD',
          imei: device.imei,
          serialNo: device.serialNo,
          iccid: device.iccid,
          msisdn1: device.msisdn1,
          msisdn2: device.msisdn2,
          itrNo: device.itrNo,
          validity: device.validity || '1 Year',
          activationDate: device.presentDate,
          expiryDate: device.expiryDate,
          billAmount: device.billAmount || 0,
          updatedAt: new Date(),
        },
        { upsert: true }
      );

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
  if (req.user.role !== 'partner') {
    return res.status(403).json({ message: 'Access denied: Only the Admin ID is allowed to delete devices.' });
  }
  try {
    const scopeQuery = buildDeviceScopeQuery(req.hierarchyScope);
    const device = await Device.findOne(combineQueries(scopeQuery, { _id: req.params.id }));
    if (!device) {
      return res.status(404).json({ message: 'Device not found or access denied.' });
    }

    const dueOwnerIds = getDueOwnerIdsFromDevice(device);
    await Device.findByIdAndDelete(device._id);
    await syncDueForUsers(dueOwnerIds);

    // Sync delete to Product collection
    const Product = require('../models/Product');
    await Product.deleteOne({ imei: device.imei });

    res.json({ message: 'Device deleted successfully.' });
  } catch (error) {
    console.error('Delete device error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Bulk Upload: Download sample template ───────────────────────────────────
router.get(
  '/bulk-upload/sample',
  requireRoles(PORTAL_ROLES.ADMIN, PORTAL_ROLES.DEALER),
  async (req, res) => {
    try {
      const { portalRole: role, hierarchyScope: scope, user } = req;

      let sampleDealerName = 'ABC Traders';
      let sampleSubDealerName = '';

      if (role === PORTAL_ROLES.DEALER) {
        sampleDealerName = labelForUser(user);
        const sd = scope.users.find(
          (u) => getPortalRole(u) === PORTAL_ROLES.SUB_DEALER && u.parentId?.toString() === user._id.toString()
        );
        if (sd) {
          sampleSubDealerName = labelForUser(sd);
        }
      } else if (role === PORTAL_ROLES.ADMIN) {
        const firstDealer = scope.users.find((u) => getPortalRole(u) === PORTAL_ROLES.DEALER);
        if (firstDealer) {
          sampleDealerName = labelForUser(firstDealer);
          const sd = scope.users.find(
            (u) => getPortalRole(u) === PORTAL_ROLES.SUB_DEALER && u.parentId?.toString() === firstDealer._id.toString()
          );
          if (sd) {
            sampleSubDealerName = labelForUser(sd);
          }
        }
      }

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Sample Devices');

      const headers = [
        'Dealer Name', 'Sub Dealer Name', 'Model', 'IMEI', 'Serial No',
        'ICCID No', 'MSISDN1', 'MSISDN2', 'ITR No', 'Validity',
        'Activation Date', 'Expiry Date', 'Bill Amount',
      ];

      const colWidths = [20, 20, 15, 20, 15, 18, 15, 15, 12, 12, 16, 16, 14];
      sheet.columns = headers.map((h, i) => ({ header: h, key: h, width: colWidths[i] || 15 }));

      // Style header row
      const headerRow = sheet.getRow(1);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      // Example rows
      sheet.addRow([
        sampleDealerName, sampleSubDealerName, 'Acute', '123456789012345', 'SER001',
        'ICCID001', '9876543210', '9876543211', 'ITR001', '1 Year',
        '2025-01-15', '2026-01-15', 2500,
      ]);
      sheet.addRow([
        sampleDealerName, '', 'Markon', '123456789012346', 'SER002',
        'ICCID002', '9876543212', '', '', '2 Years',
        '2025-02-01', '2027-02-01', 3500,
      ]);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=bulk_upload_sample.xlsx');

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('Sample download error:', error.message);
      res.status(500).json({ message: 'Failed to generate sample file.' });
    }
  }
);

// ─── Bulk Upload: Process uploaded file ──────────────────────────────────────
router.post(
  '/bulk-upload',
  requireRoles(PORTAL_ROLES.ADMIN, PORTAL_ROLES.DEALER),
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'File size exceeds the 5 MB limit.' });
        }
        return res.status(400).json({ message: err.message || 'File upload failed.' });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded. Please upload a .csv, .xlsx, or .xls file.' });
      }

      const { portalRole: role, hierarchyScope: scope, user } = req;

      // ── Parse workbook ──────────────────────────────────────────────────
      const workbook = new ExcelJS.Workbook();
      const ext = path.extname(req.file.originalname).toLowerCase();

      if (ext === '.csv') {
        const { Readable } = require('stream');
        const readable = Readable.from(req.file.buffer);
        await workbook.csv.read(readable);
      } else {
        await workbook.xlsx.load(req.file.buffer);
      }

      const worksheet = workbook.worksheets[0];
      if (!worksheet || worksheet.rowCount < 2) {
        return res.status(400).json({ message: 'The uploaded file has no data rows.' });
      }

      // ── Build column index from header row ──────────────────────────────
      const COLUMN_MAP = {
        'dealer name': 'dealerName',
        'sub dealer name': 'subDealerName',
        'model': 'vendor',
        'imei': 'imei',
        'serial no': 'serialNo',
        'iccid no': 'iccid',
        'msisdn1': 'msisdn1',
        'msisdn2': 'msisdn2',
        'itr no': 'itrNo',
        'validity': 'validity',
        'activation date': 'presentDate',
        'expiry date': 'expiryDate',
        'bill amount': 'billAmount',
      };

      const headerRow = worksheet.getRow(1);
      const colIndex = {}; // field name → column number
      headerRow.eachCell((cell, colNumber) => {
        const raw = String(cell.value || '').trim().toLowerCase();
        if (COLUMN_MAP[raw]) {
          colIndex[COLUMN_MAP[raw]] = colNumber;
        }
      });

      // ── Read rows ──────────────────────────────────────────────────────
      const cellVal = (row, field) => {
        const col = colIndex[field];
        if (!col) return '';
        let v = row.getCell(col).value;
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') {
          if ('result' in v) v = v.result;
          else if ('text' in v) v = v.text;
        }
        if (v instanceof Date) return v;
        if (typeof v === 'number') return v;
        return String(v).trim();
      };

      const rows = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header
        rows.push({ rowNumber, row });
      });

      if (rows.length === 0) {
        return res.status(400).json({ message: 'The uploaded file has no data rows.' });
      }

      // ── Extract raw data ───────────────────────────────────────────────
      const parsed = rows.map(({ rowNumber, row }) => ({
        rowNumber,
        dealerName: cellVal(row, 'dealerName'),
        subDealerName: cellVal(row, 'subDealerName'),
        vendor: cellVal(row, 'vendor'),
        imei: cellVal(row, 'imei'),
        serialNo: cellVal(row, 'serialNo'),
        iccid: cellVal(row, 'iccid'),
        msisdn1: cellVal(row, 'msisdn1'),
        msisdn2: cellVal(row, 'msisdn2'),
        itrNo: cellVal(row, 'itrNo'),
        validity: cellVal(row, 'validity'),
        presentDate: cellVal(row, 'presentDate'),
        expiryDate: cellVal(row, 'expiryDate'),
        billAmount: cellVal(row, 'billAmount'),
      }));

      // ── Validation ─────────────────────────────────────────────────────
      const errors = [];
      const addErr = (row, field, message) => errors.push({ row, field, message });

      // 1. Required fields
      for (const p of parsed) {
        if (!p.imei) addErr(p.rowNumber, 'IMEI', 'IMEI is required.');
        if (!p.serialNo) addErr(p.rowNumber, 'Serial No', 'Serial No is required.');
        if (!p.iccid) addErr(p.rowNumber, 'ICCID No', 'ICCID No is required.');
        if (!p.vendor) addErr(p.rowNumber, 'Model', 'Model (vendor) is required.');
        if (role === PORTAL_ROLES.ADMIN && !p.dealerName && !req.body.dealerId) {
          addErr(p.rowNumber, 'Dealer Name', 'Dealer Name is required for admin uploads (unless selected in UI).');
        }
      }

      // 2. Intra-file duplicates
      const seenImei = {};
      const seenSerial = {};
      const seenIccid = {};
      for (const p of parsed) {
        if (p.imei) {
          if (seenImei[p.imei]) {
            addErr(p.rowNumber, 'IMEI', `Duplicate IMEI "${p.imei}" found in file (also in row ${seenImei[p.imei]}).`);
          } else {
            seenImei[p.imei] = p.rowNumber;
          }
        }
        if (p.serialNo) {
          if (seenSerial[p.serialNo]) {
            addErr(p.rowNumber, 'Serial No', `Duplicate Serial No "${p.serialNo}" found in file (also in row ${seenSerial[p.serialNo]}).`);
          } else {
            seenSerial[p.serialNo] = p.rowNumber;
          }
        }
        if (p.iccid) {
          if (seenIccid[p.iccid]) {
            addErr(p.rowNumber, 'ICCID No', `Duplicate ICCID "${p.iccid}" found in file (also in row ${seenIccid[p.iccid]}).`);
          } else {
            seenIccid[p.iccid] = p.rowNumber;
          }
        }
      }

      // 3. DB duplicates — batch queries
      const allImeis = parsed.map((p) => p.imei).filter(Boolean);
      const allSerials = parsed.map((p) => p.serialNo).filter(Boolean);
      const allIccids = parsed.map((p) => p.iccid).filter(Boolean);

      const [dbImeis, dbSerials, dbIccids] = await Promise.all([
        allImeis.length ? Device.find({ $or: [{ imei: { $in: allImeis } }, { imeiNumber: { $in: allImeis } }] }).select('imei imeiNumber').lean() : [],
        allSerials.length ? Device.find({ $or: [{ serialNo: { $in: allSerials } }, { serialNumber: { $in: allSerials } }] }).select('serialNo serialNumber').lean() : [],
        allIccids.length ? Device.find({ $or: [{ iccid: { $in: allIccids } }, { iccidNumber: { $in: allIccids } }] }).select('iccid iccidNumber').lean() : [],
      ]);

      const existingImeis = new Set(dbImeis.flatMap((d) => [d.imei, d.imeiNumber].filter(Boolean)));
      const existingSerials = new Set(dbSerials.flatMap((d) => [d.serialNo, d.serialNumber].filter(Boolean)));
      const existingIccids = new Set(dbIccids.flatMap((d) => [d.iccid, d.iccidNumber].filter(Boolean)));

      for (const p of parsed) {
        if (p.imei && existingImeis.has(p.imei)) {
          addErr(p.rowNumber, 'IMEI', `IMEI "${p.imei}" already exists in database.`);
        }
        if (p.serialNo && existingSerials.has(p.serialNo)) {
          addErr(p.rowNumber, 'Serial No', `Serial No "${p.serialNo}" already exists in database.`);
        }
        if (p.iccid && existingIccids.has(p.iccid)) {
          addErr(p.rowNumber, 'ICCID No', `ICCID "${p.iccid}" already exists in database.`);
        }
      }

      // 4–5. Dealer / sub-dealer resolution
      const dealerCache = {}; // dealerName → User doc | null
      const subDealerCache = {}; // key → User doc | null

      let selectedDealer = null;
      let selectedSubDealer = null;

      if (req.body.dealerId) {
        selectedDealer = await ensureUserInHierarchy(req.body.dealerId, scope);
        if (!selectedDealer || getPortalRole(selectedDealer) !== PORTAL_ROLES.DEALER) {
          return res.status(400).json({ message: 'Selected dealer is invalid or not in your hierarchy.' });
        }
      }
      if (req.body.subDealerId) {
        selectedSubDealer = await ensureUserInHierarchy(req.body.subDealerId, scope);
        if (!selectedSubDealer || getPortalRole(selectedSubDealer) !== PORTAL_ROLES.SUB_DEALER) {
          return res.status(400).json({ message: 'Selected sub dealer is invalid or not in your hierarchy.' });
        }
        const expectedDealerId = selectedDealer ? selectedDealer._id : (role === PORTAL_ROLES.DEALER ? user._id : null);
        if (expectedDealerId && selectedSubDealer.parentId?.toString() !== expectedDealerId.toString()) {
          return res.status(400).json({ message: 'Selected sub dealer does not belong to the selected dealer.' });
        }
      }

      for (const p of parsed) {
        if (selectedDealer) {
          // If a dealer is selected in the UI, we completely ignore any sheet-level dealer and sub-dealer columns
          // because all devices are assigned directly to the selected dealer (or selected sub-dealer if chosen in UI)
          continue;
        } else if (role === PORTAL_ROLES.ADMIN) {
          if (p.dealerName && !dealerCache.hasOwnProperty(p.dealerName)) {
            dealerCache[p.dealerName] = findDealerFromName(scope, p.dealerName);
          }
          if (p.dealerName && !dealerCache[p.dealerName]) {
            addErr(p.rowNumber, 'Dealer Name', `Dealer "${p.dealerName}" not found in your hierarchy.`);
          }
        }

        if (selectedSubDealer) {
          // resolved via body
        } else if (p.subDealerName) {
          const parentDealer = selectedDealer || (role === PORTAL_ROLES.ADMIN ? dealerCache[p.dealerName] : user);

          if (parentDealer) {
            const cacheKey = `${parentDealer._id}_${p.subDealerName.toLowerCase()}`;
            if (!subDealerCache.hasOwnProperty(cacheKey)) {
              const normalizedSub = p.subDealerName.trim().toLowerCase();
              subDealerCache[cacheKey] = scope.users.find((u) =>
                getPortalRole(u) === PORTAL_ROLES.SUB_DEALER
                && u.parentId?.toString() === parentDealer._id.toString()
                && labelForUser(u).trim().toLowerCase() === normalizedSub
              ) || null;
            }
            if (!subDealerCache[cacheKey]) {
              addErr(p.rowNumber, 'Sub Dealer Name', `Sub-dealer "${p.subDealerName}" not found under dealer.`);
            }
          }
        }
      }

      // 6. Validity normalization
      for (const p of parsed) {
        if (p.validity) {
          const normalized = normalizeValidity(p.validity);
          if (!normalized) {
            addErr(p.rowNumber, 'Validity', `Invalid validity "${p.validity}". Use "1 Year" or "2 Years".`);
          } else {
            p.validity = normalized;
          }
        } else {
          p.validity = '1 Year'; // default
        }
      }

      // 7. Parse dates
      const parseExcelDate = (val) => {
        if (!val) return null;
        if (val instanceof Date) {
          if (!isNaN(val.getTime())) return val;
        }
        if (typeof val === 'number') {
          const excelEpoch = new Date(Date.UTC(1899, 11, 30));
          const msInDay = 24 * 60 * 60 * 1000;
          const dObj = new Date(excelEpoch.getTime() + val * msInDay);
          if (!isNaN(dObj.getTime())) return dObj;
        }
        const str = String(val).trim();
        if (!str) return null;

        let parsedDate = new Date(str);
        if (!isNaN(parsedDate.getTime())) return parsedDate;

        const parts = str.split(/[-\/]/);
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10) - 1;
            const d = parseInt(parts[2], 10);
            parsedDate = new Date(y, m, d);
            if (!isNaN(parsedDate.getTime())) return parsedDate;
          } else if (parts[2].length === 4) {
            const d = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10) - 1;
            const y = parseInt(parts[2], 10);
            parsedDate = new Date(y, m, d);
            if (!isNaN(parsedDate.getTime())) return parsedDate;
          }
        }
        return null;
      };

      for (const p of parsed) {
        if (p.presentDate) {
          const d = parseExcelDate(p.presentDate);
          if (!d) {
            addErr(p.rowNumber, 'Activation Date', `Invalid activation date format "${p.presentDate}". Use YYYY-MM-DD or DD-MM-YYYY.`);
          } else {
            p.presentDate = d;
          }
        } else {
          p.presentDate = new Date();
        }

        if (p.expiryDate) {
          const d = parseExcelDate(p.expiryDate);
          if (!d) {
            addErr(p.rowNumber, 'Expiry Date', `Invalid expiry date format "${p.expiryDate}". Use YYYY-MM-DD or DD-MM-YYYY.`);
          } else {
            p.expiryDate = d;
          }
        } else if (p.presentDate instanceof Date) {
          p.expiryDate = addYears(p.presentDate, p.validity === '2 Years' ? 2 : 1);
        }
      }

      // ── Determine valid rows (no errors) ───────────────────────────────
      const errorRows = new Set(errors.map((e) => e.row));
      const validRows = parsed.filter((p) => !errorRows.has(p.rowNumber));

      // ── Insert valid rows ──────────────────────────────────────────────
      const Product = require('../models/Product');
      const successfulDevices = [];
      const affectedOwnerIds = new Set();

      for (const p of validRows) {
        try {
          // Resolve ownership
          let dealer;
          let subDealer = null;
          let ownerId;

          if (selectedDealer) {
            dealer = selectedDealer;
          } else if (role === PORTAL_ROLES.ADMIN) {
            dealer = dealerCache[p.dealerName];
          } else {
            dealer = user;
          }

          if (selectedSubDealer) {
            subDealer = selectedSubDealer;
          } else if (p.subDealerName && !selectedDealer) {
            const cacheKey = `${dealer._id}_${p.subDealerName.toLowerCase()}`;
            subDealer = subDealerCache[cacheKey] || null;
          }

          ownerId = subDealer ? subDealer._id : dealer._id;

          const dealerNameLabel = labelForUser(dealer);
          const subDealerNameLabel = subDealer ? labelForUser(subDealer) : '';
          const billAmt = Number(p.billAmount) || 0;

          const deviceCreated = await Device.create({
            userId: ownerId,
            dealerId: dealer._id,
            dealerName: dealerNameLabel,
            subDealerId: subDealer?._id || null,
            subDealerName: subDealerNameLabel,
            vendor: p.vendor,
            deviceName: p.deviceName || 'Aquila Track Bharat 101 With IRNSS',
            imei: p.imei,
            imeiNumber: p.imei,
            iccid: p.iccid,
            iccidNumber: p.iccid,
            serialNo: p.serialNo,
            serialNumber: p.serialNo,
            msisdn1: p.msisdn1 || '',
            msisdn2: p.msisdn2 || '',
            itrNo: p.itrNo || '',
            billAmount: billAmt,
            validity: p.validity,
            presentDate: p.presentDate,
            expiryDate: p.expiryDate,
            assignedTo: null,
            assignmentHistory: [],
            status: 'Processing',
            activationRequestStatus: 'processing',
            hasSim: Boolean(p.msisdn1 || p.msisdn2 || p.iccid),
            createdBy: req.user._id,
            createdByRole: req.portalRole,
            updatedAt: p.presentDate,
          });

          // Transaction
          if (billAmt > 0) {
            const txUserId = subDealer ? dealer._id : ownerId;
            const targetUserObj = subDealer ? dealer : await User.findById(ownerId);
            const randomNum = Math.floor(10000 + Math.random() * 90000);
            const date = new Date();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            const transactionId = `ITR_${mm}_${dd}_${randomNum}`;

            await Transaction.create({
              userId: txUserId,
              transactionId,
              paymentId: deviceCreated._id.toString(),
              paymentFor: 'Device Purchase',
              referenceNo: p.imei,
              payMode: 'Itwallet',
              transactionType: 'Debit',
              status: 'Success',
              remarks: `Device Purchase: IMEI ${p.imei}`,
              requestedAmt: billAmt,
              transactedAmt: billAmt,
              deviceName: deviceCreated.deviceName,
              imei: p.imei,
              iccid: p.iccid,
              serialNo: p.serialNo,
              balanceAfterTransaction: targetUserObj?.availableBalance || 0,
              createdBy: req.user._id,
            });
          }

          // Product sync
          await Product.create({
            userId: deviceCreated.userId,
            dealerId: deviceCreated.dealerId,
            dealerName: deviceCreated.dealerName,
            subDealerId: deviceCreated.subDealerId,
            subDealerName: deviceCreated.subDealerName,
            vendor: deviceCreated.vendor || 'iTriangle',
            productDescription: deviceCreated.deviceType === 'GPS' ? 'GPS' : 'VLTD',
            existingDeviceSearch: '',
            imei: deviceCreated.imei,
            serialNo: deviceCreated.serialNo,
            iccid: deviceCreated.iccid,
            msisdn1: deviceCreated.msisdn1,
            msisdn2: deviceCreated.msisdn2,
            itrNo: deviceCreated.itrNo,
            vehicleNumber: '',
            validity: deviceCreated.validity || '1 Year',
            activationDate: deviceCreated.presentDate,
            expiryDate: deviceCreated.expiryDate,
            billAmount: deviceCreated.billAmount || 0,
            createdBy: req.user._id,
            createdByRole: req.portalRole,
            createdAt: deviceCreated.createdAt,
            updatedAt: deviceCreated.updatedAt || deviceCreated.createdAt,
          });

          // Audit log
          await AuditLog.create({
            userId: req.user._id,
            action: 'DEVICE_ASSIGNMENT',
            ipAddress: req.ip || '',
            details: {
              imei: p.imei,
              assignedTo: ownerId,
              billAmount: billAmt,
              source: 'bulk-upload',
            },
          }).catch((e) => console.error('Bulk upload audit log error:', e.message));

          affectedOwnerIds.add(ownerId.toString());

          const populated = await populateDevice(Device.findById(deviceCreated._id));
          successfulDevices.push(populated);
        } catch (rowErr) {
          console.error(`Bulk upload row ${p.rowNumber} insert error:`, rowErr.message);
          addErr(p.rowNumber, 'insert', `Failed to insert: ${rowErr.message}`);
        }
      }

      // Sync dues for all affected users
      if (affectedOwnerIds.size > 0) {
        await syncDueForUsers([...affectedOwnerIds]).catch((e) =>
          console.error('Bulk upload due sync error:', e.message)
        );
      }

      res.status(200).json({
        totalRows: parsed.length,
        successCount: successfulDevices.length,
        errorCount: errors.length,
        errors,
        successfulDevices,
      });
    } catch (error) {
      console.error('Bulk upload error:', error.message);
      res.status(500).json({ message: 'Server error during bulk upload.' });
    }
  }
);

module.exports = router;
