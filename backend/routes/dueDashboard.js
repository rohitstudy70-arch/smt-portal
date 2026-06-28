const express = require('express');
const ExcelJS = require('exceljs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const DealerDue = require('../models/DealerDue');
const Device = require('../models/Device');
const DuePayment = require('../models/DuePayment');
const RenewalRequest = require('../models/RenewalRequest');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { protect } = require('../middleware/auth');

// Multer Storage Configuration for screenshots
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
const {
  PORTAL_ROLES,
  attachHierarchyScope,
  buildDeviceScopeQuery,
  getPortalRole,
  isIdInScope,
  labelForUser,
  requireRoles,
} = require('../middleware/hierarchy');
const {
  buildDeviceDueQuery,
  getDueUsersForScope,
  syncDueForScope,
  syncDueForUser,
} = require('../services/dueService');

const router = express.Router();

router.use(protect, attachHierarchyScope, requireRoles(
  PORTAL_ROLES.ADMIN,
  PORTAL_ROLES.DEALER,
  PORTAL_ROLES.SUB_DEALER,
));

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const startOfDay = (value = new Date()) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfDay = (value = new Date()) => {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

const startOfMonth = (value = new Date()) => {
  const date = new Date(value.getFullYear(), value.getMonth(), 1);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfMonth = (value = new Date()) => {
  const date = new Date(value.getFullYear(), value.getMonth() + 1, 0);
  date.setHours(23, 59, 59, 999);
  return date;
};

const toDateOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || ''));

const getScopedDueUsers = async (req) => {
  const users = await syncDueForScope(req.hierarchyScope, req.user);
  return users;
};

const getScopedDueUserIds = async (req) => {
  const users = await getScopedDueUsers(req);
  return users.map((user) => user._id);
};

const ensureDueUserAccess = async (req, targetUserId) => {
  if (!targetUserId || !isObjectId(targetUserId)) return null;

  const user = await User.findById(targetUserId).select('-password');
  if (!user) return null;

  const targetRole = getPortalRole(user);
  if (![PORTAL_ROLES.DEALER, PORTAL_ROLES.SUB_DEALER].includes(targetRole)) return null;

  if (req.portalRole === PORTAL_ROLES.ADMIN) return user;

  if (isIdInScope(req.hierarchyScope, user._id)) return user;
  return null;
};

const paymentMatchForScope = (userIds, query = {}) => {
  const match = { userId: { $in: userIds } };
  const fromDate = toDateOrNull(query.fromDate);
  const toDate = toDateOrNull(query.toDate);

  if (fromDate || toDate) {
    match.paymentDate = {};
    if (fromDate) match.paymentDate.$gte = startOfDay(fromDate);
    if (toDate) match.paymentDate.$lte = endOfDay(toDate);
  }

  if (query.paymentMode) {
    match.paymentMode = query.paymentMode;
  }

  return match;
};

const sumPayments = async (match) => {
  const [summary] = await DuePayment.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return summary?.total || 0;
};

const sumDeviceRevenue = async (match) => {
  const [summary] = await Device.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$billAmount' } } },
  ]);
  return summary?.total || 0;
};

const getRenewalStatus = (expiryDate) => {
  if (!expiryDate) return 'Expired';
  const now = startOfDay();
  const expiry = startOfDay(expiryDate);
  const remainingDays = Math.ceil((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  if (remainingDays < 0) return 'Expired';
  if (remainingDays <= 30) return 'Expiring Soon';
  return 'Active';
};

const mapRenewalDevice = (device) => {
  const now = startOfDay();
  const expiryDate = device.expiryDate ? new Date(device.expiryDate) : null;
  const remainingDays = expiryDate
    ? Math.ceil((startOfDay(expiryDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    : 0;

  return {
    _id: device._id,
    imei: device.imei || device.imeiNumber || '',
    deviceName: device.deviceName || 'Device',
    customerName: device.assignedTo ? labelForUser(device.assignedTo) : '',
    dealerName: device.dealerId ? labelForUser(device.dealerId) : device.dealerName || '',
    subDealerName: device.subDealerId ? labelForUser(device.subDealerId) : device.subDealerName || '',
    activationDate: device.presentDate || device.createdAt,
    expiryDate,
    remainingDays,
    renewalAmount: Number(device.renewalAmount || device.billAmount || 0),
    status: getRenewalStatus(expiryDate),
  };
};

const buildRenewalRows = async (req, { paginate = true } = {}) => {
  const {
    search = '',
    dealer = '',
    dealerId = '',
    subDealer = '',
    subDealerId = '',
    customer = '',
    expiryMonth = '',
    deviceStatus = '',
    limit = 10,
    page = 1,
  } = req.query;

  const query = buildDeviceScopeQuery(req.hierarchyScope);
  const andConditions = [];

  if (dealerId || dealer) {
    if (isObjectId(dealerId || dealer)) {
      andConditions.push({ dealerId: dealerId || dealer });
    } else {
      andConditions.push({ dealerName: new RegExp(escapeRegExp(dealer || dealerId), 'i') });
    }
  }

  if (subDealerId || subDealer) {
    if (isObjectId(subDealerId || subDealer)) {
      andConditions.push({ subDealerId: subDealerId || subDealer });
    } else {
      andConditions.push({ subDealerName: new RegExp(escapeRegExp(subDealer || subDealerId), 'i') });
    }
  }

  if (expiryMonth) {
    const [year, month] = String(expiryMonth).split('-').map((part) => parseInt(part, 10));
    if (year && month) {
      const start = new Date(year, month - 1, 1);
      const end = endOfMonth(start);
      andConditions.push({ expiryDate: { $gte: start, $lte: end } });
    }
  }

  if (search) {
    const regex = new RegExp(escapeRegExp(search), 'i');
    andConditions.push({
      $or: [
        { imei: regex },
        { imeiNumber: regex },
        { deviceName: regex },
        { dealerName: regex },
        { subDealerName: regex },
      ],
    });
  }

  if (andConditions.length > 0) {
    query.$and = [...(query.$and || []), ...andConditions];
  }

  const devices = await Device.find(query)
    .populate('assignedTo', 'displayName companyName username userType')
    .populate('dealerId', 'displayName companyName username userType')
    .populate('subDealerId', 'displayName companyName username userType')
    .sort({ expiryDate: 1, createdAt: -1 });

  const customerRegex = customer && !isObjectId(customer)
    ? new RegExp(escapeRegExp(customer), 'i')
    : null;
  const normalizedStatus = String(deviceStatus || '').trim().toLowerCase();

  let rows = devices.map(mapRenewalDevice).filter((row) => {
    if (customer) {
      if (isObjectId(customer)) {
        const rawDevice = devices.find((device) => device._id.toString() === row._id.toString());
        if ((rawDevice?.assignedTo?._id || rawDevice?.assignedTo || '').toString() !== customer) return false;
      } else if (!customerRegex.test(row.customerName)) {
        return false;
      }
    }

    if (normalizedStatus && normalizedStatus !== 'all') {
      return row.status.toLowerCase() === normalizedStatus;
    }

    return true;
  });

  if (search) {
    const regex = new RegExp(escapeRegExp(search), 'i');
    rows = rows.filter((row) => (
      regex.test(row.imei)
      || regex.test(row.deviceName)
      || regex.test(row.customerName)
      || regex.test(row.dealerName)
      || regex.test(row.subDealerName)
    ));
  }

  const total = rows.length;
  const parsedLimit = Math.min(parseInt(limit, 10) || 10, 500);
  const parsedPage = Math.max(parseInt(page, 10) || 1, 1);

  return {
    rows: paginate ? rows.slice((parsedPage - 1) * parsedLimit, parsedPage * parsedLimit) : rows,
    total,
    pages: Math.ceil(total / parsedLimit) || 1,
    currentPage: parsedPage,
  };
};

const escapePdfText = (value) => String(value ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/\(/g, '\\(')
  .replace(/\)/g, '\\)')
  .replace(/[^\x20-\x7E]/g, ' ');

const buildSimplePdf = (title, headers, rows) => {
  const pages = [];
  const rowsPerPage = 28;
  const preparedRows = rows.length > 0 ? rows : [['No records found']];
  const pageCount = Math.ceil(preparedRows.length / rowsPerPage);

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const chunk = preparedRows.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage);
    const lines = [
      `BT /F1 16 Tf 40 800 Td (${escapePdfText(title)}) Tj ET`,
      `BT /F1 8 Tf 40 780 Td (${escapePdfText(headers.join(' | ')).slice(0, 130)}) Tj ET`,
    ];

    chunk.forEach((row, index) => {
      const y = 760 - (index * 24);
      const line = row.map((cell) => String(cell ?? '')).join(' | ').slice(0, 150);
      lines.push(`BT /F1 8 Tf 40 ${y} Td (${escapePdfText(line)}) Tj ET`);
    });

    lines.push(`BT /F1 8 Tf 500 30 Td (${pageIndex + 1} / ${pageCount}) Tj ET`);
    pages.push(lines.join('\n'));
  }

  const objects = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');

  const kids = pages.map((_, index) => `${4 + (index * 2)} 0 R`).join(' ');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  pages.forEach((content, index) => {
    const pageObjectId = 4 + (index * 2);
    const contentObjectId = pageObjectId + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf);
};

const sendExcel = async (res, filename, sheetName, headers, rows) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);
  worksheet.columns = headers.map((header) => ({
    header,
    key: header,
    width: Math.max(16, header.length + 4),
  }));
  rows.forEach((row) => worksheet.addRow(row));
  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
};

const sendPdf = (res, filename, title, headers, rows) => {
  const pdf = buildSimplePdf(title, headers, rows.map((row) => headers.map((header) => row[header])));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
  res.send(pdf);
};

router.get('/summary', async (req, res) => {
  try {
    const isDealer = req.portalRole === PORTAL_ROLES.DEALER;

    if (isDealer) {
      const selfId = req.user._id;

      // 1. Sync & get dealer's unpaid device dues.
      const dueRecord = await syncDueForUser(selfId);
      const deviceTotalOutstanding = dueRecord ? dueRecord.totalOutstanding || 0 : 0;
      const deviceCurrentDue = dueRecord ? dueRecord.currentDue || 0 : 0;

      // 2. Renewal dues are unpaid renewal bills. Only overdue renewal dues
      // are included in the current due card.
      const renewals = await RenewalRequest.find({
        dealerId: selfId,
        status: { $ne: 'Rejected' },
        paymentStatus: { $ne: 'Cancelled' },
      }).lean();

      let totalRenewalDues = 0;
      let overdueRenewalDues = 0;

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      renewals.forEach((r) => {
        const remaining = Number(r.remainingDue) || 0;
        if (remaining <= 0) return;

        totalRenewalDues += remaining;

        const rDate = new Date(r.renewalDate);
        if (r.paymentStatus !== 'Paid' && !Number.isNaN(rDate.getTime()) && rDate < thirtyDaysAgo) {
          overdueRenewalDues += remaining;
        }
      });

      // 3. Today's Revenue = Sum of payments received today (Device DuePayment + RenewalRequest receivedAmount)
      const todayStart = startOfDay();
      const todayEnd = endOfDay();

      // Today's Device payments
      const todaysDevicePayments = await sumPayments({
        userId: selfId,
        paymentDate: { $gte: todayStart, $lte: todayEnd }
      });

      // Today's Renewal payments received today (based on paymentDate being today)
      const todaysRenewalPayments = await RenewalRequest.aggregate([
        {
          $match: {
            dealerId: selfId,
            status: { $ne: 'Rejected' },
            paymentStatus: { $ne: 'Cancelled' },
            paymentDate: { $gte: todayStart, $lte: todayEnd },
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$receivedAmount' }
          }
        }
      ]);
      const todaysRenewalRevenue = todaysRenewalPayments[0]?.total || 0;
      const todaysTotalRevenue = todaysDevicePayments + todaysRenewalRevenue;

      // My Total Outstanding = Total Dues + Total Renewal Dues
      const myTotalOutstanding = deviceTotalOutstanding + totalRenewalDues;

      // My Current Due (Over 30 Days) = deviceCurrentDue + overdueRenewalDues
      const myCurrentDue = deviceCurrentDue + overdueRenewalDues;

      return res.json({
        totalOutstandingAmount: myTotalOutstanding,
        totalDueAmount: myCurrentDue,
        todaysRevenue: todaysTotalRevenue,
        totalDealers: 0,
        totalSubDealers: 0,
        totalPendingDevices: 0,
        todaysCollection: 0,
        monthlyCollection: 0,
        monthlyRevenue: 0
      });
    }

    const users = await getScopedDueUsers(req);
    const userIds = users.map((user) => user._id);
    const dues = await DealerDue.find({ userId: { $in: userIds } });
    const todayStart = startOfDay();
    const todayEnd = endOfDay();
    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfMonth(new Date());

    const [todaysCollection, monthlyCollection, todaysRevenue, monthlyRevenue] = await Promise.all([
      sumPayments({ userId: { $in: userIds }, paymentDate: { $gte: todayStart, $lte: todayEnd } }),
      sumPayments({ userId: { $in: userIds }, paymentDate: { $gte: monthStart, $lte: monthEnd } }),
      sumDeviceRevenue({ userId: { $in: userIds }, presentDate: { $gte: todayStart, $lte: todayEnd } }),
      sumDeviceRevenue({ userId: { $in: userIds }, presentDate: { $gte: monthStart, $lte: monthEnd } }),
    ]);

    res.json({
      totalDueAmount: dues.reduce((sum, due) => sum + (due.currentDue || 0), 0),
      totalOutstandingAmount: dues.reduce((sum, due) => sum + (due.totalOutstanding || 0), 0),
      totalDealers: users.filter((user) => getPortalRole(user) === PORTAL_ROLES.DEALER).length,
      totalSubDealers: users.filter((user) => getPortalRole(user) === PORTAL_ROLES.SUB_DEALER).length,
      totalPendingDevices: dues.reduce((sum, due) => sum + (due.totalOutstanding > 0 ? due.totalDevicesAssigned || 0 : 0), 0),
      todaysCollection,
      monthlyCollection,
      todaysRevenue,
      monthlyRevenue,
    });
  } catch (error) {
    console.error('Due summary error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/dealers', async (req, res) => {
  try {
    const userIds = await getScopedDueUserIds(req);
    const { search = '', status = '', accountType = '', limit = 10, page = 1 } = req.query;
    const query = { userId: { $in: userIds } };

    if (status && status !== 'all') {
      if (status === 'PendingDues') {
        query.totalOutstanding = { $gt: 0 };
      } else {
        query.status = status;
      }
    }
    if (accountType && accountType !== 'all') query.accountType = accountType;
    if (search) {
      const regex = new RegExp(escapeRegExp(search), 'i');
      query.$or = [
        { dealerName: regex },
        { dealerCode: regex },
        { accountType: regex },
        { status: regex },
      ];
    }

    const parsedLimit = Math.min(parseInt(limit, 10) || 10, 500);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const [dues, total] = await Promise.all([
      DealerDue.find(query)
        .populate('userId', 'displayName companyName username userType mobileNo email address city state pincode')
        .populate('parentDealerId', 'displayName companyName username userType')
        .sort({ totalOutstanding: -1, currentDue: -1, updatedAt: -1 })
        .skip((parsedPage - 1) * parsedLimit)
        .limit(parsedLimit),
      DealerDue.countDocuments(query),
    ]);

    res.json({
      dues,
      total,
      pages: Math.ceil(total / parsedLimit) || 1,
      currentPage: parsedPage,
    });
  } catch (error) {
    console.error('Due dealers error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/dealers/:userId', async (req, res) => {
  try {
    const user = await ensureDueUserAccess(req, req.params.userId);
    if (!user) return res.status(404).json({ message: 'Due account not found or access denied.' });

    const due = await syncDueForUser(user._id);
    const deviceQuery = buildDeviceDueQuery(user);
    const [devices, payments] = await Promise.all([
      Device.find(deviceQuery)
        .populate('assignedTo', 'displayName companyName username userType')
        .sort({ presentDate: -1, createdAt: -1 }),
      DuePayment.find({ userId: user._id })
        .populate('updatedBy', 'displayName companyName username userType')
        .sort({ paymentDate: -1, createdAt: -1 }),
    ]);

    res.json({ user, due, devices, payments });
  } catch (error) {
    console.error('Due detail error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/dealers/:userId/payments', async (req, res) => {
  try {
    const user = await ensureDueUserAccess(req, req.params.userId);
    if (!user) return res.status(404).json({ message: 'Due account not found or access denied.' });

    const payments = await DuePayment.find({ userId: user._id })
      .populate('updatedBy', 'displayName companyName username userType')
      .sort({ paymentDate: -1, createdAt: -1 });
    res.json(payments);
  } catch (error) {
    console.error('Due payments error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/dealers/:userId/payments', requireRoles(PORTAL_ROLES.ADMIN), upload.single('screenshot'), async (req, res) => {
  try {
    const user = await ensureDueUserAccess(req, req.params.userId);
    if (!user) return res.status(404).json({ message: 'Due account not found or access denied.' });

    const amount = Number(req.body.amount);
    const paymentMode = String(req.body.paymentMode || '').trim();
    const paymentDate = toDateOrNull(req.body.paymentDate) || new Date();
    const remarks = String(req.body.remarks || '').trim();
    const referenceNumber = String(req.body.referenceNumber || `DUE-${Date.now()}`).trim();

    if (!amount || Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Valid payment amount is required.' });
    }

    if (!['Cash', 'UPI', 'Bank Transfer'].includes(paymentMode)) {
      return res.status(400).json({ message: 'Valid payment mode is required.' });
    }

    const due = await syncDueForUser(user._id);
    if (!due || due.totalOutstanding <= 0) {
      return res.status(400).json({ message: 'This account has no pending outstanding balance.' });
    }

    if (amount > due.totalOutstanding) {
      return res.status(400).json({ message: 'Payment amount cannot be greater than total outstanding balance.' });
    }

    let screenshotUrl = '';
    if (req.file) {
      screenshotUrl = `/uploads/screenshots/${req.file.filename}`;
    } else if (paymentMode === 'UPI') {
      // Require screenshot for UPI if admin records it
      return res.status(400).json({ message: 'UPI screenshot receipt is required.' });
    }

    const payment = await DuePayment.create({
      dealerDueId: due._id,
      userId: user._id,
      amount,
      paymentDate,
      paymentMode,
      referenceNumber,
      remarks,
      screenshotUrl,
      updatedBy: req.user._id,
    });

    const updatedDue = await syncDueForUser(user._id);
    await AuditLog.create({
      userId: req.user._id,
      action: 'DUE_PAYMENT_RECEIVED',
      ipAddress: req.ip || '',
      details: {
        targetUserId: user._id,
        targetName: labelForUser(user),
        amount,
        paymentMode,
        referenceNumber,
      },
    }).catch((error) => console.error('Failed to log due payment audit event:', error.message));

    res.status(201).json({ message: 'Payment received successfully.', payment, due: updatedDue });
  } catch (error) {
    console.error('Receive due payment error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/renewal-due-devices', async (req, res) => {
  try {
    const result = await buildRenewalRows(req, { paginate: true });
    res.json({
      devices: result.rows,
      total: result.total,
      pages: result.pages,
      currentPage: result.currentPage,
    });
  } catch (error) {
    console.error('Renewal due devices error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/export', async (req, res) => {
  try {
    const { type = 'dealer-due', format = 'excel' } = req.query;
    const normalizedFormat = String(format).toLowerCase();

    if (!['excel', 'pdf'].includes(normalizedFormat)) {
      return res.status(400).json({ message: 'Export format must be excel or pdf.' });
    }

    let title = 'Dealer Due Report';
    let filename = 'dealer-due-report';
    let headers = [];
    let rows = [];

    if (type === 'collection') {
      const userIds = await getScopedDueUserIds(req);
      const payments = await DuePayment.find(paymentMatchForScope(userIds, req.query))
        .populate('userId', 'displayName companyName username userType')
        .populate('updatedBy', 'displayName companyName username userType')
        .sort({ paymentDate: -1, createdAt: -1 });

      title = 'Collection Report';
      filename = 'collection-report';
      headers = ['Date', 'Dealer Name', 'Dealer ID', 'Amount', 'Payment Mode', 'Reference Number', 'Remarks', 'Updated By'];
      rows = payments.map((payment) => ({
        Date: payment.paymentDate ? payment.paymentDate.toISOString().slice(0, 10) : '',
        'Dealer Name': payment.userId ? labelForUser(payment.userId) : '',
        'Dealer ID': payment.userId?.username || '',
        Amount: payment.amount || 0,
        'Payment Mode': payment.paymentMode || '',
        'Reference Number': payment.referenceNumber || '',
        Remarks: payment.remarks || '',
        'Updated By': payment.updatedBy ? labelForUser(payment.updatedBy) : '',
      }));
    } else if (type === 'renewal-due') {
      const result = await buildRenewalRows(req, { paginate: false });
      title = 'Renewal Due Report';
      filename = 'renewal-due-report';
      headers = ['IMEI', 'Device Name', 'Customer Name', 'Dealer Name', 'Activation Date', 'Expiry Date', 'Remaining Days', 'Renewal Amount', 'Status'];
      rows = result.rows.map((device) => ({
        IMEI: device.imei,
        'Device Name': device.deviceName,
        'Customer Name': device.customerName,
        'Dealer Name': device.dealerName,
        'Activation Date': device.activationDate ? new Date(device.activationDate).toISOString().slice(0, 10) : '',
        'Expiry Date': device.expiryDate ? new Date(device.expiryDate).toISOString().slice(0, 10) : '',
        'Remaining Days': device.remainingDays,
        'Renewal Amount': device.renewalAmount,
        Status: device.status,
      }));
    } else {
      const userIds = await getScopedDueUserIds(req);
      const dues = await DealerDue.find({ userId: { $in: userIds } })
        .populate('userId', 'displayName companyName username userType')
        .sort({ totalOutstanding: -1, currentDue: -1 });

      headers = ['Dealer Name', 'Dealer ID', 'Account Type', 'Total Devices Assigned', 'Total Bill Amount', 'Total Paid Amount', 'Total Outstanding', 'Current Due', 'Last Payment Date', 'Status'];
      rows = dues.map((due) => ({
        'Dealer Name': due.dealerName || (due.userId ? labelForUser(due.userId) : ''),
        'Dealer ID': due.dealerCode || due.userId?.username || '',
        'Account Type': due.accountType,
        'Total Devices Assigned': due.totalDevicesAssigned || 0,
        'Total Bill Amount': due.totalBillAmount || 0,
        'Total Paid Amount': due.totalPaidAmount || 0,
        'Total Outstanding': due.totalOutstanding || 0,
        'Current Due': due.currentDue || 0,
        'Last Payment Date': due.lastPaymentDate ? due.lastPaymentDate.toISOString().slice(0, 10) : '',
        Status: due.status,
      }));
    }

    if (normalizedFormat === 'pdf') {
      return sendPdf(res, filename, title, headers, rows);
    }

    return sendExcel(res, filename, title.slice(0, 31), headers, rows);
  } catch (error) {
    console.error('Due export error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/revenue-breakdown', async (req, res) => {
  try {
    const { period } = req.query; // 'today', 'month', 'year'
    
    let startDate, endDate;
    const now = new Date();
    if (period === 'today') {
      startDate = startOfDay();
      endDate = endOfDay();
    } else if (period === 'month') {
      startDate = startOfMonth(now);
      endDate = endOfMonth(now);
    } else if (period === 'year') {
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    } else {
      return res.status(400).json({ message: 'Invalid period. Use today, month, or year.' });
    }

    const users = await getScopedDueUsers(req);
    const userIds = users.map((u) => u._id);

    const devices = await Device.find({
      userId: { $in: userIds },
      presentDate: { $gte: startDate, $lte: endDate }
    })
    .populate('assignedTo dealerId subDealerId')
    .sort({ presentDate: -1 });

    const breakdown = devices.map(d => ({
      _id: d._id,
      imei: d.imei || d.imeiNumber || 'N/A',
      dealerName: d.dealerId ? labelForUser(d.dealerId) : (d.dealerName || 'N/A'),
      subDealerName: d.subDealerId ? labelForUser(d.subDealerId) : (d.subDealerName || 'N/A'),
      customerName: d.assignedTo ? labelForUser(d.assignedTo) : 'N/A',
      presentDate: d.presentDate,
      billAmount: d.billAmount
    }));

    const totalRevenue = breakdown.reduce((sum, d) => sum + d.billAmount, 0);

    res.json({
      period,
      breakdown,
      totalRevenue
    });
  } catch (error) {
    console.error('Revenue breakdown error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
