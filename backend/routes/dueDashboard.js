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
const ActivationRequest = require('../models/ActivationRequest');
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

const mapRenewalDevice = (device, renewalRequest, activationRequest) => {
  const now = startOfDay();
  const expiryDate = device.expiryDate ? new Date(device.expiryDate) : null;
  const remainingDays = expiryDate
    ? Math.ceil((startOfDay(expiryDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    : 0;

  let status = 'Expired';
  if (remainingDays >= 0) {
    if (remainingDays <= 30) {
      status = 'Expiring Soon';
    } else {
      status = 'Active';
    }
  }

  const vehicleNumber = activationRequest?.vehicleNo || '';

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
    status,
    vehicleNumber,
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

  const imeis = devices.map(d => d.imei || d.imeiNumber).filter(Boolean);
  const [renewalRequests, activationRequests] = await Promise.all([
    RenewalRequest.find({ imei: { $in: imeis } }),
    ActivationRequest.find({ imei: { $in: imeis } }),
  ]);

  const renewalMap = {};
  for (const r of renewalRequests) {
    const imei = (r.imei || '').trim();
    if (!renewalMap[imei] || new Date(r.createdAt) > new Date(renewalMap[imei].createdAt)) {
      renewalMap[imei] = r;
    }
  }

  const activationMap = {};
  for (const act of activationRequests) {
    const imei = (act.imei || '').trim();
    if (!activationMap[imei] || new Date(act.createdAt) > new Date(activationMap[imei].createdAt)) {
      activationMap[imei] = act;
    }
  }

  const customerRegex = customer && !isObjectId(customer)
    ? new RegExp(escapeRegExp(customer), 'i')
    : null;
  const normalizedStatus = String(deviceStatus || '').trim().toLowerCase();

  let rows = devices.map(d => {
    const imei = (d.imei || d.imeiNumber || '').trim();
    return mapRenewalDevice(d, renewalMap[imei], activationMap[imei]);
  }).filter((row) => {
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
      || regex.test(row.vehicleNumber)
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

const getColLetter = (colIndex) => {
  let temp = colIndex;
  let letter = '';
  while (temp > 0) {
    let modulo = (temp - 1) % 26;
    letter = String.fromCharCode(65 + modulo) + letter;
    temp = Math.floor((temp - modulo) / 26);
  }
  return letter;
};

const getPdfColSettings = (header, headers = []) => {
  const h = header.toLowerCase();
  const hasSubDealer = headers.some(x => x.toLowerCase() === 'sub dealer name');
  const hasTotalBill = headers.some(x => x.toLowerCase() === 'total bill amount');
  const hasPaymentMode = headers.some(x => x.toLowerCase() === 'payment mode');

  let width = 80;
  let align = 'left';

  if (hasSubDealer) {
    // Renewal Due Report (11 columns, total width: 780)
    if (h === 'imei') width = 80;
    else if (h === 'device name') width = 70;
    else if (h === 'vehicle number') width = 65;
    else if (h === 'customer name') width = 75;
    else if (h === 'dealer name') width = 75;
    else if (h === 'sub dealer name') width = 75;
    else if (h === 'activation date') width = 55;
    else if (h === 'expiry date') width = 55;
    else if (h === 'remaining days') { width = 80; align = 'right'; }
    else if (h === 'renewal amount') { width = 90; align = 'right'; }
    else if (h === 'status') { width = 60; align = 'center'; }
  } else if (hasTotalBill) {
    // Dealer Due Report
    if (h === 'dealer name') width = 120;
    else if (h === 'dealer id') { width = 80; align = 'center'; }
    else if (h === 'account type') { width = 80; align = 'center'; }
    else if (h === 'total devices assigned') { width = 60; align = 'right'; }
    else if (h === 'total bill amount') { width = 75; align = 'right'; }
    else if (h === 'total paid amount') { width = 75; align = 'right'; }
    else if (h === 'total outstanding') { width = 75; align = 'right'; }
    else if (h === 'current due') { width = 75; align = 'right'; }
    else if (h === 'last payment date') { width = 80; align = 'center'; }
    else if (h === 'status') { width = 60; align = 'center'; }
  } else if (hasPaymentMode) {
    // Collection / Payments Report
    if (h === 'date') { width = 80; align = 'center'; }
    else if (h === 'dealer name') width = 140;
    else if (h === 'dealer id') { width = 80; align = 'center'; }
    else if (h === 'amount') { width = 75; align = 'right'; }
    else if (h === 'payment mode') { width = 85; align = 'center'; }
    else if (h === 'reference number') { width = 105; align = 'center'; }
    else if (h === 'remarks') width = 110;
    else if (h === 'updated by') width = 105;
  }

  return { width, align };
};

const sendExcel = async (res, filename, sheetNameOrSheets, headers, rows, totalsColumns) => {
  const workbook = new ExcelJS.Workbook();
  
  let sheets = [];
  if (Array.isArray(sheetNameOrSheets)) {
    sheets = sheetNameOrSheets;
  } else {
    sheets = [{
      sheetName: sheetNameOrSheets,
      title: sheetNameOrSheets,
      headers,
      rows,
      totalsColumns: totalsColumns || []
    }];
  }

  for (const sheetInfo of sheets) {
    const { sheetName, title, headers: sheetHeaders, rows: sheetRows, totalsColumns: sheetTotals } = sheetInfo;
    const worksheet = workbook.addWorksheet(sheetName.slice(0, 31));
    
    // Gridlines visibility
    worksheet.views = [{ showGridLines: true }];

    // 1. Add Title Banner
    const titleRow = worksheet.addRow([title]);
    titleRow.height = 36;
    worksheet.mergeCells(1, 1, 1, sheetHeaders.length);
    const titleCell = titleRow.getCell(1);
    titleCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E78' } // Navy Blue
    };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // 2. Add Metadata Row
    const metaRow = worksheet.addRow([`Report Generated On: ${new Date().toLocaleString()} | Total Records: ${sheetRows.length}`]);
    metaRow.height = 20;
    worksheet.mergeCells(2, 1, 2, sheetHeaders.length);
    const metaCell = metaRow.getCell(1);
    metaCell.font = { name: 'Segoe UI', size: 9, italic: true, color: { argb: 'FF595959' } };
    metaCell.alignment = { vertical: 'middle', horizontal: 'left' };

    // 3. Add Empty Separator Row
    worksheet.addRow([]);
    worksheet.getRow(3).height = 10;

    // 4. Add Headers Row
    const headerRow = worksheet.addRow(sheetHeaders);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2E75B6' } // Medium Steel Blue
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
      };
    });

    // 5. Add Data Rows
    sheetRows.forEach((row, rowIndex) => {
      const dataRowValues = sheetHeaders.map(h => row[h]);
      const dataRow = worksheet.addRow(dataRowValues);
      dataRow.height = 20;
      
      const isEven = rowIndex % 2 === 0;
      const rowBgColor = isEven ? 'FFFFFFFF' : 'FFF2F6F9';

      dataRow.eachCell((cell, colIndex) => {
        const header = sheetHeaders[colIndex - 1];
        cell.font = { name: 'Segoe UI', size: 10 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: rowBgColor }
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
        };

        // Alignments and Number Formats
        const lowerHeader = header.toLowerCase();
        if (lowerHeader.includes('amount') || lowerHeader.includes('outstanding') || lowerHeader.includes('due') || lowerHeader.includes('price')) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.numFmt = '₹#,##0.00';
          if (cell.value !== undefined && cell.value !== null) {
            const num = Number(cell.value);
            if (!isNaN(num)) {
              cell.value = num;
            }
          }
        } else if (lowerHeader.includes('devices') || lowerHeader.includes('days') || lowerHeader.includes('quantity')) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.numFmt = '#,##0';
          if (cell.value !== undefined && cell.value !== null) {
            const num = Number(cell.value);
            if (!isNaN(num)) {
              cell.value = num;
            }
          }
        } else if (lowerHeader.includes('date')) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          if (cell.value && !(cell.value instanceof Date)) {
            const dateVal = new Date(cell.value);
            if (!isNaN(dateVal.getTime())) {
              cell.value = dateVal;
              cell.numFmt = 'yyyy-mm-dd';
            }
          }
        } else if (lowerHeader.includes('id') || lowerHeader.includes('imei') || lowerHeader.includes('status')) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        }
      });
    });

    // 6. Add Totals Row using formulas
    if (sheetTotals && sheetTotals.length > 0 && sheetRows.length > 0) {
      const totalsRowValues = sheetHeaders.map((header, index) => {
        if (index === 0) return 'Total';
        if (sheetTotals.includes(header)) {
          const colLetter = getColLetter(index + 1);
          const startRow = 5;
          const endRow = startRow + sheetRows.length - 1;
          return { formula: `SUM(${colLetter}${startRow}:${colLetter}${endRow})` };
        }
        return '';
      });

      const totalsRow = worksheet.addRow(totalsRowValues);
      totalsRow.height = 22;
      totalsRow.eachCell((cell, colIndex) => {
        const header = sheetHeaders[colIndex - 1];
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1F4E78' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFEFEFEF' }
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF1F4E78' } },
          bottom: { style: 'double', color: { argb: 'FF1F4E78' } },
          left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
        };

        const lowerHeader = header.toLowerCase();
        if (lowerHeader.includes('amount') || lowerHeader.includes('outstanding') || lowerHeader.includes('due') || lowerHeader.includes('price')) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.numFmt = '₹#,##0.00';
        } else if (lowerHeader.includes('devices') || lowerHeader.includes('days')) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.numFmt = '#,##0';
        }
      });
    }

    // 7. Auto-adjust columns widths
    sheetHeaders.forEach((header, index) => {
      const column = worksheet.getColumn(index + 1);
      let maxLen = header.length;
      sheetRows.forEach((row) => {
        const val = row[header];
        if (val !== undefined && val !== null) {
          const strVal = val instanceof Date ? val.toISOString().slice(0, 10) : String(val);
          maxLen = Math.max(maxLen, strVal.length);
        }
      });
      column.width = Math.min(Math.max(maxLen + 4, 12), 40);
    });

    // Freeze header and metadata row
    worksheet.views = [{ state: 'frozen', ySplit: 4, xSplit: 0, showGridLines: true }];
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
};

const sendPdf = (res, filename, title, headersOrSections, rows, totalsColumns) => {
  const PDFDocument = require('pdfkit');
  
  let sections = [];
  if (Array.isArray(headersOrSections) && typeof headersOrSections[0] === 'object') {
    sections = headersOrSections;
  } else {
    sections = [{
      sectionTitle: '',
      headers: headersOrSections,
      rows,
      totalsColumns: totalsColumns || []
    }];
  }

  const doc = new PDFDocument({
    layout: 'landscape',
    size: 'A4',
    margins: { top: 40, bottom: 40, left: 30, right: 30 },
    bufferPages: true
  });

  const margin = 30;
  let y = 60;

  sections.forEach((section, secIndex) => {
    const { sectionTitle, headers, rows: sectionRows, totalsColumns: sectionTotals } = section;

    if (secIndex > 0) {
      doc.addPage();
      y = 60;
    }

    // Draw Section Header
    if (sectionTitle) {
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#1F4E78').text(sectionTitle, margin, y);
      y += 20;
    }

    // Draw Table Header
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF');
    doc.rect(margin, y, 780, 22).fill('#1F4E78');

    let x = margin;
    headers.forEach((header) => {
      const { width, align } = getPdfColSettings(header, headers);
      doc.fillColor('#FFFFFF').text(header, x + 4, y + 6, {
        width: width - 8,
        align: align,
        height: 12,
        ellipsis: true
      });
      x += width;
    });
    y += 22;

    // Draw Table Rows
    doc.font('Helvetica').fontSize(8).fillColor('#333333');
    if (sectionRows.length === 0) {
      const rowHeight = 20;
      doc.rect(margin, y, 780, rowHeight).fill('#FFFFFF');
      doc.fillColor('#777777').text('No records found', margin + 4, y + 6, {
        width: 772,
        align: 'center'
      });
      doc.strokeColor('#E0E0E0').lineWidth(0.5).rect(margin, y, 780, rowHeight).stroke();
      y += rowHeight;
    } else {
      sectionRows.forEach((row, rowIndex) => {
        const rowHeight = 20;

        // Page break check (A4 Landscape height is 595.28)
        if (y + rowHeight > 510) {
          doc.addPage();
          y = 60;
          
          doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF');
          doc.rect(margin, y, 780, 22).fill('#1F4E78');
          let xTemp = margin;
          headers.forEach((header) => {
            const { width, align } = getPdfColSettings(header, headers);
            doc.fillColor('#FFFFFF').text(header, xTemp + 4, y + 6, {
              width: width - 8,
              align: align,
              height: 12,
              ellipsis: true
            });
            xTemp += width;
          });
          y += 22;
          doc.font('Helvetica').fontSize(8).fillColor('#333333');
        }

        const bgColor = rowIndex % 2 === 0 ? '#FFFFFF' : '#F9FBFD';
        doc.rect(margin, y, 780, rowHeight).fill(bgColor);

        let cellX = margin;
        headers.forEach((header) => {
          const { width, align } = getPdfColSettings(header, headers);
          let value = row[header] !== undefined && row[header] !== null ? String(row[header]) : '';
          
          const lowerHeader = header.toLowerCase();
          if (lowerHeader.includes('amount') || lowerHeader.includes('outstanding') || lowerHeader.includes('due') || lowerHeader.includes('price')) {
            const num = Number(value);
            if (!isNaN(num) && value !== '') {
              value = 'Rs. ' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
          }

          doc.fillColor('#333333').text(value, cellX + 4, y + 6, {
            width: width - 8,
            align: align,
            height: 12,
            ellipsis: true
          });

          doc.strokeColor('#E0E0E0').lineWidth(0.5)
            .moveTo(cellX, y).lineTo(cellX, y + rowHeight).stroke();

          cellX += width;
        });

        doc.strokeColor('#E0E0E0').lineWidth(0.5)
          .moveTo(cellX, y).lineTo(cellX, y + rowHeight).stroke();

        doc.strokeColor('#E0E0E0').lineWidth(0.5)
          .moveTo(margin, y + rowHeight).lineTo(margin + 780, y + rowHeight).stroke();

        y += rowHeight;
      });
    }

    // Draw Totals Row
    if (sectionTotals && sectionTotals.length > 0 && sectionRows.length > 0) {
      const rowHeight = 22;
      if (y + rowHeight > 510) {
        doc.addPage();
        y = 60;
      }

      doc.rect(margin, y, 780, rowHeight).fill('#ECEFF1');
      doc.strokeColor('#1F4E78').lineWidth(0.75)
        .moveTo(margin, y).lineTo(margin + 780, y).stroke();

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#1F4E78');
      let cellX = margin;
      headers.forEach((header, idx) => {
        const { width, align } = getPdfColSettings(header, headers);
        let value = '';
        if (idx === 0) {
          value = 'Total';
        } else if (sectionTotals.includes(header)) {
          const sum = sectionRows.reduce((acc, r) => {
            const val = Number(r[header]);
            return acc + (isNaN(val) ? 0 : val);
          }, 0);
          
          const lowerHeader = header.toLowerCase();
          if (lowerHeader.includes('amount') || lowerHeader.includes('outstanding') || lowerHeader.includes('due')) {
            value = 'Rs. ' + sum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          } else {
            value = sum.toLocaleString('en-IN');
          }
        }

        doc.text(value, cellX + 4, y + 7, {
          width: width - 8,
          align: align,
          height: 12,
          ellipsis: true
        });

        cellX += width;
      });

      doc.strokeColor('#1F4E78').lineWidth(0.75)
        .moveTo(margin, y + rowHeight - 2).lineTo(margin + 780, y + rowHeight - 2).stroke();
      doc.strokeColor('#1F4E78').lineWidth(0.75)
        .moveTo(margin, y + rowHeight).lineTo(margin + 780, y + rowHeight).stroke();

      y += rowHeight;
    }
  });

  // Global Page Numbers & Running Headers/Footers
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);

    // Draw header banner
    doc.rect(30, 15, 780, 20).fill('#1F4E78');
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#FFFFFF').text('SMT CUSTOMER PORTAL - SYSTEM REPORTS', 38, 21);
    doc.font('Helvetica').fontSize(9).fillColor('#FFFFFF').text(title.toUpperCase(), 30, 21, { align: 'right', width: 772 });

    // Draw footer page info
    doc.strokeColor('#D3D3D3').lineWidth(0.5).moveTo(30, 555).lineTo(810, 555).stroke();
    doc.font('Helvetica-Oblique').fontSize(7.5).fillColor('#777777')
      .text(`Generated On: ${new Date().toLocaleString()}`, 30, 563);
    doc.font('Helvetica').fontSize(8).fillColor('#777777')
      .text(`Page ${i + 1} of ${range.count}`, 30, 563, { align: 'right', width: 780 });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
  
  doc.pipe(res);
  doc.end();
};

router.get('/summary', async (req, res) => {
  try {
    const isDealerOrSubDealer = req.portalRole === PORTAL_ROLES.DEALER || req.portalRole === PORTAL_ROLES.SUB_DEALER;

    if (isDealerOrSubDealer) {
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

      // Calculate total renewal paid amount
      const renewalPaidSummary = await RenewalRequest.aggregate([
        {
          $match: {
            dealerId: selfId,
            status: { $ne: 'Rejected' },
            paymentStatus: { $ne: 'Cancelled' },
          }
        },
        {
          $group: {
            _id: null,
            totalPaid: { $sum: { $ifNull: ['$receivedAmount', 0] } }
          }
        }
      ]);
      const totalRenewalPaid = renewalPaidSummary[0]?.totalPaid || 0;

      const deviceTotalBillAmount = dueRecord ? dueRecord.totalBillAmount || 0 : 0;
      const deviceTotalPaidAmount = dueRecord ? dueRecord.totalPaidAmount || 0 : 0;

      const totalBillAmount = deviceTotalBillAmount + totalRenewalDues;
      const totalPaidAmount = deviceTotalPaidAmount;
      const remainingDues = Math.max(totalBillAmount - totalPaidAmount, 0);

      return res.json({
        totalOutstandingAmount: remainingDues, // Backward compatibility
        totalDueAmount: remainingDues, // Backward compatibility
        todaysRevenue: todaysTotalRevenue, // Backward compatibility
        totalBillAmount,
        totalPaidAmount,
        remainingDues,
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
    const allUserIds = [...userIds, req.user._id];
    const dues = await DealerDue.find({ userId: { $in: userIds } });
    const todayStart = startOfDay();
    const todayEnd = endOfDay();
    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfMonth(new Date());

    const [todaysCollection, monthlyCollection, todaysRevenue, monthlyRevenue] = await Promise.all([
      sumPayments({ userId: { $in: userIds }, paymentDate: { $gte: todayStart, $lte: todayEnd } }),
      sumPayments({ userId: { $in: userIds }, paymentDate: { $gte: monthStart, $lte: monthEnd } }),
      sumDeviceRevenue({ userId: { $in: allUserIds }, presentDate: { $gte: todayStart, $lte: todayEnd } }),
      sumDeviceRevenue({ userId: { $in: allUserIds }, presentDate: { $gte: monthStart, $lte: monthEnd } }),
    ]);

    // Aggregate renewals for Admin scoped users to combine in Admin cards
    const activeRenewals = await RenewalRequest.find({
      dealerId: { $in: userIds },
      status: { $ne: 'Rejected' },
      paymentStatus: { $ne: 'Cancelled' },
    }).lean();

    let totalRenewalDues = 0;
    let overdueRenewalDues = 0;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    activeRenewals.forEach((r) => {
      const remaining = Number(r.remainingDue) || 0;
      if (remaining <= 0) return;
      totalRenewalDues += remaining;

      const rDate = new Date(r.renewalDate);
      if (r.paymentStatus !== 'Paid' && !Number.isNaN(rDate.getTime()) && rDate < thirtyDaysAgo) {
        overdueRenewalDues += remaining;
      }
    });

    res.json({
      totalDueAmount: dues.reduce((sum, due) => sum + (due.currentDue || 0), 0) + overdueRenewalDues,
      totalOutstandingAmount: dues.reduce((sum, due) => sum + (due.totalOutstanding || 0), 0) + totalRenewalDues,
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

// @route   GET /api/due-dashboard/payments
// @desc    Get all payments (collections) visible to current hierarchy
// @access  Protected
router.get('/payments', async (req, res) => {
  try {
    const userIds = await getScopedDueUserIds(req);
    const query = paymentMatchForScope(userIds, req.query);

    const { limit = 100, page = 1 } = req.query;
    const parsedLimit = Math.min(parseInt(limit, 10) || 100, 500);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);

    const [payments, total] = await Promise.all([
      DuePayment.find(query)
        .populate('userId', 'displayName companyName username userType mobileNo')
        .populate('updatedBy', 'displayName companyName username userType')
        .sort({ paymentDate: -1, createdAt: -1 })
        .skip((parsedPage - 1) * parsedLimit)
        .limit(parsedLimit),
      DuePayment.countDocuments(query),
    ]);

    res.json({
      payments,
      total,
      pages: Math.ceil(total / parsedLimit),
      currentPage: parsedPage,
    });
  } catch (error) {
    console.error('All payments error:', error.message);
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

    // Map dues list dynamically to include renewal dues in the response
    const activeRenewals = await RenewalRequest.find({
      dealerId: { $in: dues.map(d => d.userId) },
      status: { $ne: 'Rejected' },
      paymentStatus: { $ne: 'Cancelled' },
    }).lean();

    const renewalsByDealer = {};
    activeRenewals.forEach((r) => {
      const dId = String(r.dealerId);
      if (!renewalsByDealer[dId]) {
        renewalsByDealer[dId] = {
          totalBill: 0,
          totalPaid: 0,
          totalOutstanding: 0,
          overdue: 0
        };
      }
      const bill = Number(r.billAmount) || 0;
      const received = Number(r.receivedAmount) || 0;
      const remaining = Number(r.remainingDue) || 0;

      renewalsByDealer[dId].totalBill += bill;
      renewalsByDealer[dId].totalPaid += received;
      renewalsByDealer[dId].totalOutstanding += remaining;

      const rDate = new Date(r.renewalDate);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      if (r.paymentStatus !== 'Paid' && !Number.isNaN(rDate.getTime()) && rDate < thirtyDaysAgo) {
        renewalsByDealer[dId].overdue += remaining;
      }
    });

    const modifiedDues = dues.map((d) => {
      const dObj = d.toObject();
      const dId = String(d.userId?._id || d.userId);
      const rSummary = renewalsByDealer[dId] || { totalBill: 0, totalPaid: 0, totalOutstanding: 0, overdue: 0 };

      const deviceTotalBillAmount = dObj.totalBillAmount || 0;
      const deviceTotalPaidAmount = dObj.totalPaidAmount || 0;

      dObj.totalPurchaseRevenue = deviceTotalBillAmount;
      dObj.totalRenewalRevenue = rSummary.totalOutstanding;
      dObj.totalBillAmount = deviceTotalBillAmount + rSummary.totalOutstanding;
      dObj.totalPaidAmount = deviceTotalPaidAmount;
      dObj.totalOutstanding = Math.max(dObj.totalBillAmount - dObj.totalPaidAmount, 0);
      dObj.currentDue = Math.max(dObj.totalBillAmount - dObj.totalPaidAmount, 0);

      return dObj;
    });

    res.json({
      dues: modifiedDues,
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

    const dueObj = due ? due.toObject() : null;
    if (dueObj) {
      const activeRenewals = await RenewalRequest.find({
        dealerId: user._id,
        status: { $ne: 'Rejected' },
        paymentStatus: { $ne: 'Cancelled' },
      }).lean();

      let totalRenewalBill = 0;
      let totalRenewalPaid = 0;
      let totalRenewalOutstanding = 0;
      let overdueRenewalDues = 0;

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      activeRenewals.forEach((r) => {
        const bill = Number(r.billAmount) || 0;
        const received = Number(r.receivedAmount) || 0;
        const remaining = Number(r.remainingDue) || 0;

        totalRenewalBill += bill;
        totalRenewalPaid += received;
        totalRenewalOutstanding += remaining;

        const rDate = new Date(r.renewalDate);
        if (r.paymentStatus !== 'Paid' && !Number.isNaN(rDate.getTime()) && rDate < thirtyDaysAgo) {
          overdueRenewalDues += remaining;
        }
      });

      const deviceTotalBillAmount = dueObj.totalBillAmount || 0;
      const deviceTotalPaidAmount = dueObj.totalPaidAmount || 0;

      dueObj.totalPurchaseRevenue = deviceTotalBillAmount;
      dueObj.totalRenewalRevenue = totalRenewalOutstanding;
      dueObj.totalBillAmount = deviceTotalBillAmount + totalRenewalOutstanding;
      dueObj.totalPaidAmount = deviceTotalPaidAmount;
      dueObj.totalOutstanding = Math.max(dueObj.totalBillAmount - dueObj.totalPaidAmount, 0);
      dueObj.currentDue = Math.max(dueObj.totalBillAmount - dueObj.totalPaidAmount, 0);
    }

    res.json({ user, due: dueObj, devices, payments });
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

    if (paymentMode === 'UPI') {
      if (!/^\d{12}$/.test(referenceNumber)) {
        return res.status(400).json({ message: 'For UPI payments, the Reference/UTR number must be exactly 12 numeric digits.' });
      }
    }

    const due = await syncDueForUser(user._id);
    if (!due) {
      return res.status(400).json({ message: 'Due account not found.' });
    }

    const renewals = await RenewalRequest.find({
      dealerId: user._id,
      status: { $ne: 'Rejected' },
      paymentStatus: { $ne: 'Cancelled' },
    }).lean();

    let totalRenewalDues = 0;
    renewals.forEach((r) => {
      const remaining = Number(r.remainingDue) || 0;
      if (remaining > 0) {
        totalRenewalDues += remaining;
      }
    });

    const totalOutstandingLimit = (due.totalOutstanding || 0) + totalRenewalDues;

    if (totalOutstandingLimit <= 0) {
      return res.status(400).json({ message: 'This account has no pending outstanding balance.' });
    }

    if (amount > totalOutstandingLimit) {
      return res.status(400).json({ message: `Payment amount cannot be greater than total outstanding balance (₹${totalOutstandingLimit.toLocaleString('en-IN')}).` });
    }

    let screenshotUrl = '';
    if (req.file) {
      screenshotUrl = `/uploads/screenshots/${req.file.filename}`;
    } else if (paymentMode === 'UPI') {
      // Require screenshot for UPI if admin records it
      return res.status(400).json({ message: 'UPI screenshot receipt is required.' });
    }

    const unpaidRenewals = await RenewalRequest.find({
      dealerId: user._id,
      status: { $ne: 'Rejected' },
      paymentStatus: { $ne: 'Paid' },
    }).sort({ renewalDate: 1 });

    let remainingAmount = amount;
    for (const renewal of unpaidRenewals) {
      if (remainingAmount <= 0) break;

      const billAmt = Number(renewal.billAmount) || 0;
      const currentReceived = Number(renewal.receivedAmount) || 0;
      const currentRemaining = Math.max(billAmt - currentReceived, 0);

      if (currentRemaining <= 0) continue;

      const appliedAmount = Math.min(remainingAmount, currentRemaining);

      renewal.receivedAmount = currentReceived + appliedAmount;
      if (renewal.receivedAmount >= billAmt) {
        renewal.paymentStatus = 'Paid';
        renewal.status = 'Approved';
      } else {
        renewal.paymentStatus = 'Partially Paid';
      }
      renewal.paymentDate = paymentDate;
      renewal.transactionId = referenceNumber;
      renewal.remarks = (renewal.remarks ? `${renewal.remarks} | ` : '') + (remarks ? `Manual payment: ${remarks}` : `Manual payment Ref: ${referenceNumber}`);

      await renewal.save();
      remainingAmount -= appliedAmount;
    }

    const renewalAmountApplied = amount - remainingAmount;

    const payment = await DuePayment.create({
      dealerDueId: due._id,
      userId: user._id,
      amount,
      renewalAmountApplied,
      paymentDate,
      paymentMode,
      referenceNumber,
      remarks: remarks || 'Manual payment',
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

    if (type === 'collection') {
      const userIds = await getScopedDueUserIds(req);
      const payments = await DuePayment.find(paymentMatchForScope(userIds, req.query))
        .populate('userId', 'displayName companyName username userType')
        .populate('updatedBy', 'displayName companyName username userType')
        .sort({ paymentDate: -1, createdAt: -1 });

      const title = 'Collection Report';
      const filename = 'collection-report';
      const headers = ['Date', 'Dealer Name', 'Dealer ID', 'Amount', 'Payment Mode', 'Reference Number', 'Remarks', 'Updated By'];
      const rows = payments.map((payment) => ({
        Date: payment.paymentDate ? payment.paymentDate.toISOString().slice(0, 10) : '',
        'Dealer Name': payment.userId ? labelForUser(payment.userId) : '',
        'Dealer ID': payment.userId?.username || '',
        Amount: payment.amount || 0,
        'Payment Mode': payment.paymentMode || '',
        'Reference Number': payment.referenceNumber || '',
        Remarks: payment.remarks || '',
        'Updated By': payment.updatedBy ? labelForUser(payment.updatedBy) : '',
      }));

      if (normalizedFormat === 'pdf') {
        return sendPdf(res, filename, title, headers, rows, ['Amount']);
      }
      return sendExcel(res, filename, title, headers, rows, ['Amount']);

    } else if (type === 'renewal-due') {
      const result = await buildRenewalRows(req, { paginate: false });
      const title = 'Renewal Due Report';
      const filename = 'renewal-due-report';
      const headers = ['IMEI', 'Device Name', 'Vehicle Number', 'Customer Name', 'Dealer Name', 'Sub Dealer Name', 'Activation Date', 'Expiry Date', 'Remaining Days', 'Renewal Amount', 'Status'];
      const rows = result.rows.map((device) => ({
        IMEI: device.imei,
        'Device Name': device.deviceName,
        'Vehicle Number': device.vehicleNumber || '',
        'Customer Name': device.customerName,
        'Dealer Name': device.dealerName,
        'Sub Dealer Name': device.subDealerName || '',
        'Activation Date': device.activationDate ? new Date(device.activationDate).toISOString().slice(0, 10) : '',
        'Expiry Date': device.expiryDate ? new Date(device.expiryDate).toISOString().slice(0, 10) : '',
        'Remaining Days': device.remainingDays,
        'Renewal Amount': device.renewalAmount,
        Status: device.status,
      }));

      if (normalizedFormat === 'pdf') {
        return sendPdf(res, filename, title, headers, rows, ['Renewal Amount']);
      }
      return sendExcel(res, filename, title, headers, rows, ['Renewal Amount']);

    } else {
      // dealer-due: Outstanding dues for all dealers + their full payment logs!
      const userIds = await getScopedDueUserIds(req);
      const dues = await DealerDue.find({ userId: { $in: userIds } })
        .populate('userId', 'displayName companyName username userType')
        .sort({ totalOutstanding: -1, currentDue: -1 });

      const dueHeaders = ['Dealer Name', 'Dealer ID', 'Account Type', 'Total Devices Assigned', 'Total Bill Amount', 'Total Paid Amount', 'Total Outstanding', 'Current Due', 'Last Payment Date', 'Status'];
      const dueRows = dues.map((due) => ({
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

      // Fetch payment records of these dealers
      const payments = await DuePayment.find({ userId: { $in: userIds } })
        .populate('userId', 'displayName companyName username userType')
        .populate('updatedBy', 'displayName companyName username userType')
        .sort({ paymentDate: -1, createdAt: -1 });

      const paymentHeaders = ['Date', 'Dealer Name', 'Dealer ID', 'Amount', 'Payment Mode', 'Reference Number', 'Remarks', 'Updated By'];
      const paymentRows = payments.map((payment) => ({
        Date: payment.paymentDate ? payment.paymentDate.toISOString().slice(0, 10) : '',
        'Dealer Name': payment.userId ? labelForUser(payment.userId) : '',
        'Dealer ID': payment.userId?.username || '',
        Amount: payment.amount || 0,
        'Payment Mode': payment.paymentMode || '',
        'Reference Number': payment.referenceNumber || '',
        Remarks: payment.remarks || '',
        'Updated By': payment.updatedBy ? labelForUser(payment.updatedBy) : '',
      }));

      const title = 'Dealer Due Report';
      const filename = 'dealer-due-report';

      if (normalizedFormat === 'pdf') {
        const sections = [
          {
            sectionTitle: 'Dealer Outstanding Dues Summary',
            headers: dueHeaders,
            rows: dueRows,
            totalsColumns: ['Total Bill Amount', 'Total Paid Amount', 'Total Outstanding', 'Current Due']
          },
          {
            sectionTitle: 'Dealer Due Payments History (Collections)',
            headers: paymentHeaders,
            rows: paymentRows,
            totalsColumns: ['Amount']
          }
        ];
        return sendPdf(res, filename, title, sections);
      } else {
        const sheets = [
          {
            sheetName: 'Dealer Dues Summary',
            title: 'Dealer Outstanding Dues Summary',
            headers: dueHeaders,
            rows: dueRows,
            totalsColumns: ['Total Bill Amount', 'Total Paid Amount', 'Total Outstanding', 'Current Due']
          },
          {
            sheetName: 'Due Payments History',
            title: 'Dealer Due Payments History (Collections)',
            headers: paymentHeaders,
            rows: paymentRows,
            totalsColumns: ['Amount']
          }
        ];
        return sendExcel(res, filename, sheets);
      }
    }
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
    } else if (period === 'prev_month') {
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      startDate = startOfMonth(prevMonth);
      endDate = endOfMonth(prevMonth);
    } else if (period === 'custom') {
      const { fromDate, toDate } = req.query;
      if (!fromDate || !toDate) {
        return res.status(400).json({ message: 'From Date and To Date are required for custom period.' });
      }
      startDate = startOfDay(fromDate);
      endDate = endOfDay(toDate);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({ message: 'Invalid custom dates provided.' });
      }
    } else {
      return res.status(400).json({ message: 'Invalid period. Use today, month, prev_month, year, or custom.' });
    }

    const users = await getScopedDueUsers(req);
    const userIds = [...users.map((u) => u._id), req.user._id];

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
      billAmount: Number(d.billAmount) || 0
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

router.post('/renew-device', requireRoles(PORTAL_ROLES.ADMIN), async (req, res) => {
  try {
    const { deviceId, validity } = req.body;
    if (!deviceId) {
      return res.status(400).json({ message: 'Device ID is required.' });
    }
    if (!['1 Year', '2 Years'].includes(validity)) {
      return res.status(400).json({ message: 'Validity must be 1 Year or 2 Years.' });
    }

    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ message: 'Device not found.' });
    }

    const currentExpiry = device.expiryDate ? new Date(device.expiryDate) : (device.presentDate ? new Date(device.presentDate) : new Date());
    
    const years = validity === '2 Years' ? 2 : 1;
    const nextExpiry = new Date(currentExpiry);
    nextExpiry.setFullYear(nextExpiry.getFullYear() + years);

    device.expiryDate = nextExpiry;
    device.validity = validity;
    await device.save();

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

    const dealer = await User.findById(device.dealerId);
    const ActivationRequest = require('../models/ActivationRequest');
    const activation = await ActivationRequest.findOne({ imei: device.imei }).sort({ dateTime: -1 });

    const customerName = activation?.customerName || 'N/A';
    const customerMobile = activation?.regMobNo || activation?.regMobNo2 || '0000000000';

    await RenewalRequest.create({
      requestId,
      userId: req.user._id,
      dealerId: device.dealerId || req.user._id,
      dealerName: dealer ? (dealer.displayName || dealer.companyName || dealer.username) : 'N/A',
      dealerCode: dealer ? (dealer.username || '') : '',
      createdBy: req.user._id,
      customerName,
      customerMobile,
      imei: device.imei,
      vehicleNumber: activation?.vehicleNo || 'N/A',
      deviceModel: device.vendor || 'iTriangle',
      activationType: (activation?.activationMode || 'NIC').toUpperCase() === 'MINING' ? 'MINING' : 'NIC',
      productDescription: device.deviceType === 'GPS' ? 'GPS RENEWAL' : (device.deviceType === 'VLTD' ? 'VLTD RENEWAL' : 'Renewal'),
      validity,
      renewalDate: currentExpiry,
      newExpiryDate: nextExpiry,
      billAmount: device.renewalAmount || device.billAmount || 0,
      receivedAmount: device.renewalAmount || device.billAmount || 0,
      remainingDue: 0,
      paymentMode: 'Cash',
      remarks: 'Immediate renewal by admin from due dashboard',
      status: 'Activated',
      paymentStatus: 'Paid',
      paymentDate: new Date()
    });

    if (device.dealerId) {
      await syncDueForUser(device.dealerId.toString());
    }

    res.json({
      message: 'Device renewed successfully.',
      expiryDate: nextExpiry.toISOString().split('T')[0]
    });
  } catch (error) {
    console.error('Renew device error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

