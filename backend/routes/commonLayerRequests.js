const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const CommonLayerRequest = require('../models/CommonLayerRequest');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Multer config for bulk upload
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'), false);
    }
  },
});

// Generate unique request ID for common layer requests
const generateCLRequestId = async () => {
  const lastRequest = await CommonLayerRequest.findOne()
    .sort({ requestId: -1 })
    .select('requestId');

  if (lastRequest && lastRequest.requestId) {
    const numPart = parseInt(lastRequest.requestId.replace('CL-REQ', ''), 10);
    if (!isNaN(numPart)) {
      return `CL-REQ${numPart + 1}`;
    }
  }

  return `CL-REQ${10000 + Math.floor(Math.random() * 90000)}`;
};

// @route   GET /api/common-layer-requests
// @desc    List common layer requests with pagination
// @access  Protected
router.get('/', protect, async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = req.query.search || '';

    let query = {};
    if (req.user.userType === 'End Customer') {
      query = {
        $or: [
          { customerId: req.user._id },
          { rmn: req.user.mobileNo },
          { endCustomerName: req.user.displayName }
        ]
      };
    } else {
      query = { userId: req.user._id };
    }

    console.log('[DEBUG] GET /api/common-layer-requests called by:', req.user.username, 'userType:', req.user.userType);
    console.log('[DEBUG] Query:', JSON.stringify(query, null, 2));

    if (search) {
      const searchConditions = [
        { requestId: { $regex: search, $options: 'i' } },
        { commonLayer: { $regex: search, $options: 'i' } },
        { vehicleType: { $regex: search, $options: 'i' } },
        { imei: { $regex: search, $options: 'i' } },
        { iccid: { $regex: search, $options: 'i' } },
        { status: { $regex: search, $options: 'i' } },
        { invoiceNo: { $regex: search, $options: 'i' } },
      ];
      if (query.$or) {
        query = {
          $and: [
            query,
            { $or: searchConditions }
          ]
        };
      } else {
        query.$or = searchConditions;
      }
    }

    const total = await CommonLayerRequest.countDocuments(query);
    const requests = await CommonLayerRequest.find(query)
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
    console.error('List common layer requests error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

const generateNextInvoiceNo = async () => {
  const lastInvRequest = await CommonLayerRequest.findOne({
    invoiceNo: /^INV-\d+$/
  }).sort({ invoiceNo: -1 });

  if (lastInvRequest && lastInvRequest.invoiceNo) {
    const numPart = parseInt(lastInvRequest.invoiceNo.replace('INV-', ''), 10);
    if (!isNaN(numPart)) {
      const nextNum = numPart + 1;
      return `INV-${String(nextNum).padStart(2, '0')}`;
    }
  }
  return 'INV-01';
};

// @route   GET /api/common-layer-requests/next-pi-no
// @desc    Get next sequential PI number (starting with AE-)
// @access  Protected
router.get('/next-pi-no', protect, async (req, res) => {
  try {
    const lastAeRequest = await CommonLayerRequest.findOne({
      piNo: /^AE-\d+$/
    }).sort({ piNo: -1 });

    let nextPiNo = 'AE-01';
    if (lastAeRequest && lastAeRequest.piNo) {
      const numPart = parseInt(lastAeRequest.piNo.replace('AE-', ''), 10);
      if (!isNaN(numPart)) {
        const nextNum = numPart + 1;
        nextPiNo = `AE-${String(nextNum).padStart(2, '0')}`;
      }
    }
    const nextInvoiceNo = await generateNextInvoiceNo();
    res.json({ nextPiNo, nextInvoiceNo });
  } catch (error) {
    console.error('Error generating next PI no:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/common-layer-requests
// @desc    Create a single common layer request
// @access  Protected
router.post('/', protect, async (req, res) => {
  try {
    const {
      commonLayer,
      vehicleType,
      validity,
      imei,
      iccid,
      isSubDealer,
      subDealerName,
      piNo,
      piValue,
      invoiceNo,
      engineNo,
      chassisNo,
      vehicleTypeOldNew,
      vehicleMake,
      vehicleModel,
      endCustomerName,
      rmn,
      rtoState,
      rtoNo,
      address,
      proofOfAddress,
      poaNo,
      proofOfIdentity,
      poiNo,
      vehicleNo,
      items
    } = req.body;

    const requestId = await generateCLRequestId();

    let finalImei = imei || '';
    let finalIccid = iccid || '';

    // Resolve partial IMEI or ICCID (like 6 digits)
    if (finalImei && finalImei.length < 15) {
      const Device = require('../models/Device');
      const matchedDevice = await Device.findOne({
        userId: req.user._id,
        $or: [
          { imei: new RegExp(finalImei, 'i') },
          { iccid: new RegExp(finalImei, 'i') }
        ]
      });
      if (matchedDevice) {
        finalImei = matchedDevice.imei;
        finalIccid = matchedDevice.iccid;
      }
    }

    // Auto-create/link customer login
    let customerId = null;
    let customerCredentials = null;

    if (rmn && rmn.trim()) {
      const User = require('../models/User');
      let customerUser = await User.findOne({
        $or: [
          { username: rmn.trim() },
          { mobileNo: rmn.trim() }
        ]
      });

      if (!customerUser) {
        customerUser = await User.create({
          username: rmn.trim(),
          password: rmn.trim(), // Pre-save hook will hash it
          role: 'customer',
          parentId: req.user._id,
          userType: 'End Customer',
          displayName: endCustomerName || 'End Customer',
          mobileNo: rmn.trim(),
          status: 'Active'
        });
        customerCredentials = {
          username: rmn.trim(),
          password: rmn.trim(),
          isNew: true
        };
      } else {
        let needsSave = false;
        if (!customerUser.userType) {
          customerUser.userType = 'End Customer';
          needsSave = true;
        }
        if (!customerUser.parentId) {
          customerUser.parentId = req.user._id;
          needsSave = true;
        }
        if (needsSave) {
          await customerUser.save();
        }
        customerCredentials = {
          username: customerUser.username,
          password: '(Existing Account)',
          isNew: false
        };
      }
      customerId = customerUser._id;
    }

    // Generate sequential PI number if empty or default
    let finalPiNo = piNo || '';
    if (!finalPiNo || finalPiNo === 'AE-01') {
      const lastAeRequest = await CommonLayerRequest.findOne({
        piNo: /^AE-\d+$/
      }).sort({ piNo: -1 });

      if (lastAeRequest && lastAeRequest.piNo) {
        const numPart = parseInt(lastAeRequest.piNo.replace('AE-', ''), 10);
        if (!isNaN(numPart)) {
          const nextNum = numPart + 1;
          finalPiNo = `AE-${String(nextNum).padStart(2, '0')}`;
        } else {
          finalPiNo = 'AE-01';
        }
      } else {
        finalPiNo = 'AE-01';
      }
    }

    let finalInvoiceNo = invoiceNo || '';
    if (!finalInvoiceNo) {
      finalInvoiceNo = await generateNextInvoiceNo();
    }

    const clRequest = await CommonLayerRequest.create({
      requestId,
      userId: req.user._id,
      customerId,
      commonLayer: commonLayer || '',
      vehicleType: vehicleType || '',
      validity: validity || '',
      imei: finalImei,
      iccid: finalIccid,
      isSubDealer: isSubDealer || false,
      subDealerName: subDealerName || '',
      piNo: finalPiNo,
      piValue: piValue || 0,
      invoiceNo: finalInvoiceNo,
      status: 'Pending',
      engineNo: engineNo || '',
      chassisNo: chassisNo || '',
      vehicleTypeOldNew: vehicleTypeOldNew || '',
      vehicleMake: vehicleMake || '',
      vehicleModel: vehicleModel || '',
      endCustomerName: endCustomerName || '',
      rmn: rmn || '',
      rtoState: rtoState || '',
      rtoNo: rtoNo || '',
      address: address || '',
      proofOfAddress: proofOfAddress || '',
      poaNo: poaNo || '',
      proofOfIdentity: proofOfIdentity || '',
      poiNo: poiNo || '',
      vehicleNo: vehicleNo || '',
      items: items || []
    });

    res.status(201).json({
      ...clRequest.toObject(),
      customerCredentials
    });
  } catch (error) {
    console.error('Create common layer request error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/common-layer-requests/bulk
// @desc    Bulk upload common layer requests via CSV file
// @access  Protected
router.post('/bulk', protect, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a CSV file' });
    }

    const filePath = req.file.path;
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line);

    if (lines.length < 2) {
      // Clean up uploaded file
      fs.unlinkSync(filePath);
      return res
        .status(400)
        .json({ message: 'File must contain a header row and at least one data row' });
    }

    // Parse header & normalize
    const rawHeaders = lines[0].split(',');
    const normalizedHeaders = rawHeaders.map(h => 
      h.trim()
       .replace(/\*/g, '')
       .replace(/[\s\.\-\(\)]+/g, '_')
       .replace(/_+$/g, '')
       .replace(/^_+/g, '')
       .toLowerCase()
    );

    const createdRequests = [];

    for (let i = 1; i < lines.length; i++) {
      // Split line while handling quoted strings containing commas
      let values = [];
      const line = lines[i];
      let currentVal = '';
      let insideQuotes = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          insideQuotes = !insideQuotes;
        } else if (char === ',' && !insideQuotes) {
          values.push(currentVal.trim().replace(/^"|"$/g, ''));
          currentVal = '';
        } else {
          currentVal += char;
        }
      }
      values.push(currentVal.trim().replace(/^"|"$/g, ''));

      const row = {};
      normalizedHeaders.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });

      const requestId = await generateCLRequestId();

      // Mappings (checking normalized keys)
      const imeiVal = row.device_imei || row.imei || '';
      const iccidVal = row.iccid || '';
      const commonLayerVal = row.common_layer || row.commonlayer || req.body.commonLayer || '';
      const vehicleTypeVal = row.vehicle_type || row.vehicletype || 'Truck';
      const validityVal = row.validity || '1 Year';
      const isSubDealerVal = row.is_sub_dealer === 'true' || row.issubdealer === 'true';
      const subDealerNameVal = row.sub_dealer_name || row.subdealername || '';
      const piNoVal = row.pi_no || row.pino || '';
      const piValueVal = parseFloat(row.pi_value || row.pivalue) || 0;
      const invoiceNoVal = row.invoice_no || row.invoiceno || '';

      // New columns from screenshot
      const engineNoVal = row.engine_no || '';
      const chassisNoVal = row.chassis_no || '';
      const vehicleTypeOldNewVal = row.vehicle_type_old_new || '';
      const vehicleMakeVal = row.vehicle_make_manufacturer || row.vehicle_make || '';
      const vehicleModelVal = row.vehicle_model || '';
      const endCustomerNameVal = row.end_customer_name || '';
      const rmnVal = row.registerd_mobile_no_rmn || row.rmn || '';
      const rtoStateVal = row.rto_state || '';
      const rtoNoVal = row.rto_no_in_which_rto_vehicle_go_for_registration || row.rto_no || '';
      const addressVal = row.address || '';
      const proofOfAddressVal = row.proof_of_address || '';
      const poaNoVal = row.poa_no || '';
      const proofOfIdentityVal = row.proof_of_identity || '';
      const poiNoVal = row.poi_no || '';
      const vehicleNoVal = row.vehicle_no || '';

      let finalImei = imeiVal;
      let finalIccid = iccidVal;

      // Resolve partial IMEI or ICCID (like 6 digits)
      if (finalImei && finalImei.length < 15) {
        const Device = require('../models/Device');
        const matchedDevice = await Device.findOne({
          userId: req.user._id,
          $or: [
            { imei: new RegExp(finalImei, 'i') },
            { iccid: new RegExp(finalImei, 'i') }
          ]
        });
        if (matchedDevice) {
          finalImei = matchedDevice.imei;
          finalIccid = matchedDevice.iccid;
        }
      }

      // Auto-create/link customer login for bulk item
      let customerId = null;
      if (rmnVal && rmnVal.trim()) {
        const User = require('../models/User');
        let customerUser = await User.findOne({
          $or: [
            { username: rmnVal.trim() },
            { mobileNo: rmnVal.trim() }
          ]
        });

        if (!customerUser) {
          customerUser = await User.create({
            username: rmnVal.trim(),
            password: rmnVal.trim(),
            role: 'customer',
            parentId: req.user._id,
            userType: 'End Customer',
            displayName: endCustomerNameVal || 'End Customer',
            mobileNo: rmnVal.trim(),
            status: 'Active'
          });
        } else {
          let needsSave = false;
          if (!customerUser.userType) {
            customerUser.userType = 'End Customer';
            needsSave = true;
          }
          if (!customerUser.parentId) {
            customerUser.parentId = req.user._id;
            needsSave = true;
          }
          if (needsSave) {
            await customerUser.save();
          }
        }
        customerId = customerUser._id;
      }

      let finalInvoiceNoVal = invoiceNoVal || '';
      if (!finalInvoiceNoVal) {
        finalInvoiceNoVal = await generateNextInvoiceNo();
      }

      const clRequest = await CommonLayerRequest.create({
        requestId,
        userId: req.user._id,
        customerId,
        commonLayer: commonLayerVal,
        vehicleType: vehicleTypeVal,
        validity: validityVal,
        imei: finalImei,
        iccid: finalIccid,
        isSubDealer: isSubDealerVal,
        subDealerName: subDealerNameVal,
        piNo: piNoVal,
        piValue: piValueVal,
        invoiceNo: finalInvoiceNoVal,
        status: 'Pending',
        engineNo: engineNoVal,
        chassisNo: chassisNoVal,
        vehicleTypeOldNew: vehicleTypeOldNewVal,
        vehicleMake: vehicleMakeVal,
        vehicleModel: vehicleModelVal,
        endCustomerName: endCustomerNameVal,
        rmn: rmnVal,
        rtoState: rtoStateVal,
        rtoNo: rtoNoVal,
        address: addressVal,
        proofOfAddress: proofOfAddressVal,
        poaNo: poaNoVal,
        proofOfIdentity: proofOfIdentityVal,
        poiNo: poiNoVal,
        vehicleNo: vehicleNoVal
      });

      createdRequests.push(clRequest);
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.status(201).json({
      message: `${createdRequests.length} common layer request(s) created successfully`,
      count: createdRequests.length,
      requests: createdRequests,
    });
  } catch (error) {
    console.error('Bulk upload error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
