const express = require('express');
const { protect } = require('../middleware/auth');
const CommonLayerRequest = require('../models/CommonLayerRequest');
const AuditLog = require('../models/AuditLog');
const ExcelJS = require('exceljs');

const router = express.Router();

// Middleware to ensure user is an Admin/User (role: partner or customer)
const checkAuth = (req, res, next) => {
  if (req.user && (req.user.role === 'partner' || req.user.role === 'customer')) {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized. Login required.' });
  }
};

// @route   GET /api/reports/common-layer/export
// @desc    Export filtered Common Layer requests as Excel (.xlsx) file
// @access  Protected (Admin / Main Customer Only)
router.get('/common-layer/export', protect, checkAuth, async (req, res) => {
  try {
    const { startDate, endDate, search } = req.query;

    const match = {};

    // Security: If regular customer, restrict query to their own requests only
    if (req.user.role === 'customer') {
      const mongoose = require('mongoose');
      match.userId = new mongoose.Types.ObjectId(req.user._id);
    }

    // Date-wise filter
    if (startDate || endDate) {
      match.dateTime = {};
      if (startDate) {
        match.dateTime.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        // If it's a simple date format, set it to the end of the day
        if (endDate.length <= 10) {
          end.setHours(23, 59, 59, 999);
        }
        match.dateTime.$lte = end;
      }
    }

    // Search by Vehicle Number, IMEI, Mobile Number (RMN)
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      match.$or = [
        { vehicleNo: searchRegex },
        { imei: searchRegex },
        { rmn: searchRegex }
      ];
    }

    // Retrieve matching records using aggregation
    const records = await CommonLayerRequest.aggregate([
      { $match: match },
      { $sort: { dateTime: -1 } }
    ]);

    // Create Audit Log for the export action
    await AuditLog.create({
      userId: req.user._id,
      action: 'EXPORT_COMMON_LAYER_REPORT',
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      details: {
        filters: { startDate, endDate, search },
        recordsCount: records.length
      }
    });

    // Create Excel Workbook and Worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Common Layer Report');

    // Report columns configuration matching screenshot exactly (asterisks styled red in code)
    const headersConfig = [
      { key: 'srNo', label: 'SR_NO', required: false },
      { key: 'imei', label: 'DEVICE_IMEI', required: true },
      { key: 'engineNo', label: 'ENGINE_NO', required: true },
      { key: 'chassisNo', label: 'CHASSIS_NO', required: true },
      { key: 'vehicleTypeOldNew', label: 'Vehicle type Old/New', required: true },
      { key: 'vehicleMake', label: 'Vehicle Make/Manufacturer', required: true },
      { key: 'vehicleModel', label: 'Vehicle Model', required: true },
      { key: 'endCustomerName', label: 'End_Customer_NAME', required: true },
      { key: 'rmn', label: 'Registerd Mobile no. (RMN)', required: true },
      { key: 'rtoState', label: 'RTO State', required: false },
      { key: 'rtoNo', label: 'RTO No.(In which RTO vehicle go for registration)', required: true },
      { key: 'address', label: 'Address', required: true },
      { key: 'proofOfAddress', label: 'PROOF OF ADDRESS', required: true },
      { key: 'poaNo', label: 'POA No', required: true },
      { key: 'proofOfIdentity', label: 'PROOF OF IDENTITY', required: false },
      { key: 'poiNo', label: 'POI No', required: false },
      { key: 'vehicleNo', label: 'Vehicle No', required: true }
    ];

    worksheet.columns = headersConfig.map(h => ({ key: h.key, header: h.label }));

    // Excel header styling (white background + black bold text + red asterisks)
    const headerRow = worksheet.getRow(1);
    headersConfig.forEach((h, index) => {
      const cell = headerRow.getCell(index + 1);
      if (h.required) {
        cell.value = {
          richText: [
            { text: h.label, font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: '000000' } } },
            { text: '*', font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF0000' } } }
          ]
        };
      } else {
        cell.value = {
          richText: [
            { text: h.label, font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: '000000' } } }
          ]
        };
      }
      
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF' } // Plain white background matching screenshot
      };
      
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      
      cell.border = {
        top: { style: 'thin', color: { argb: 'A0A0A0' } },
        bottom: { style: 'thin', color: { argb: 'A0A0A0' } },
        left: { style: 'thin', color: { argb: 'A0A0A0' } },
        right: { style: 'thin', color: { argb: 'A0A0A0' } }
      };
    });
    headerRow.height = 42;

    // Add rows with Auto serial number generation
    records.forEach((record, index) => {
      const isEven = index % 2 === 1;
      const row = worksheet.addRow({
        srNo: index + 1,
        imei: record.imei || '',
        engineNo: record.engineNo || '',
        chassisNo: record.chassisNo || '',
        vehicleTypeOldNew: record.vehicleTypeOldNew || '',
        vehicleMake: record.vehicleMake || '',
        vehicleModel: record.vehicleModel || '',
        endCustomerName: record.endCustomerName || '',
        rmn: record.rmn || '',
        rtoState: record.rtoState || '',
        rtoNo: record.rtoNo || '',
        address: record.address || '',
        proofOfAddress: record.proofOfAddress || '',
        poaNo: record.poaNo || '',
        proofOfIdentity: record.proofOfIdentity || '',
        poiNo: record.poiNo || '',
        vehicleNo: record.vehicleNo || ''
      });
      
      row.height = 28; // nice padded height for data cells
      
      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Segoe UI', size: 9.5, color: { argb: '262626' } };
        
        // Dynamic column alignment
        const centeredColumns = [1, 2, 3, 4, 5, 9, 10, 11, 14, 16, 17]; // SR_NO, IMEI, ENGINE, CHASSIS, TYPE, RMN, STATE, RTO_NO, POA_NO, POI_NO, VEHICLE_NO
        const isCentered = centeredColumns.includes(colNumber);
        
        cell.alignment = { 
          vertical: 'middle', 
          horizontal: isCentered ? 'center' : 'left'
        };

        // Zebra striping backgrounds
        if (isEven) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'F2F5F8' } // Soft bluish gray zebra background
          };
        } else {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFF' }
          };
        }

        cell.border = {
          top: { style: 'thin', color: { argb: 'D9D9D9' } },
          bottom: { style: 'thin', color: { argb: 'D9D9D9' } },
          left: { style: 'thin', color: { argb: 'D9D9D9' } },
          right: { style: 'thin', color: { argb: 'D9D9D9' } }
        };
      });
    });

    // Auto column width (calculate dynamic widths based on content with padding)
    worksheet.columns.forEach((column, colIdx) => {
      const headerLabel = headersConfig[colIdx]?.label || '';
      let maxLen = headerLabel.length;
      column.eachCell({ includeHeader: true }, (cell) => {
        let val = '';
        if (cell.value) {
          if (typeof cell.value === 'object' && cell.value.richText) {
            val = cell.value.richText.map(t => t.text).join('');
          } else {
            val = cell.value.toString();
          }
        }
        if (val.length > maxLen) {
          maxLen = val.length;
        }
      });
      // Set column width with extra spacious padding (min 25 characters, max 90 characters)
      column.width = Math.min(Math.max(maxLen + 14, 25), 90);
    });

    // Generate filename in DD-MM-YYYY format
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const filename = `Common_Layer_Report_${day}-${month}-${year}.xlsx`;

    // Response settings
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

    await workbook.xlsx.write(res);
    res.status(200).end();

  } catch (error) {
    console.error('Export report error:', error.message);
    res.status(500).json({ message: 'Server error generating Excel report.' });
  }
});

module.exports = router;
