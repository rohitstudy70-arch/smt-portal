const express = require('express');
const Invoice = require('../models/Invoice');
const Device = require('../models/Device');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const {
  PORTAL_ROLES,
  attachHierarchyScope,
  buildDeviceScopeQuery,
  getPortalRole,
  isIdInScope,
  requireRoles,
} = require('../middleware/hierarchy');

const router = express.Router();

router.use(protect, attachHierarchyScope);

const operationsRoles = [PORTAL_ROLES.ADMIN, PORTAL_ROLES.DEALER, PORTAL_ROLES.SUB_DEALER];

const combineQueries = (...queries) => {
  const activeQueries = queries.filter((query) => query && Object.keys(query).length > 0);
  if (activeQueries.length === 0) return {};
  if (activeQueries.length === 1) return activeQueries[0];
  return { $and: activeQueries };
};

const buildInvoiceScope = (user, scope) => {
  const role = getPortalRole(user);

  if (role === PORTAL_ROLES.ADMIN) {
    return {};
  }

  if (role === PORTAL_ROLES.CUSTOMER) {
    return {
      $or: [
        { customerId: user._id },
        { rmn: user.mobileNo },
        { endCustomerName: user.displayName },
      ],
    };
  }

  return {
    $or: [
      { userId: { $in: scope.userIds } },
      { customerId: { $in: scope.userIds } },
    ],
  };
};

const generateInvoiceRequestId = async () => {
  const lastInvoice = await Invoice.findOne()
    .sort({ requestId: -1 })
    .select('requestId');

  if (lastInvoice?.requestId) {
    const numPart = parseInt(lastInvoice.requestId.replace('INV-REQ', ''), 10);
    if (!Number.isNaN(numPart)) {
      return `INV-REQ${numPart + 1}`;
    }
  }

  return `INV-REQ${10000 + Math.floor(Math.random() * 90000)}`;
};

const generateNextInvoiceNo = async () => {
  const lastInvoice = await Invoice.findOne({
    invoiceNo: /^INV-\d+$/,
  }).sort({ invoiceNo: -1 });

  if (lastInvoice?.invoiceNo) {
    const numPart = parseInt(lastInvoice.invoiceNo.replace('INV-', ''), 10);
    if (!Number.isNaN(numPart)) {
      return `INV-${String(numPart + 1).padStart(2, '0')}`;
    }
  }

  return 'INV-01';
};

const generateNextPiNo = async () => {
  const allInvoices = await Invoice.find({ piNo: /^AE-\d+$/ }).select('piNo');
  
  if (allInvoices.length > 0) {
    const nums = allInvoices.map(inv => {
      const numPart = parseInt(inv.piNo.replace('AE-', ''), 10);
      return isNaN(numPart) ? 0 : numPart;
    });
    const maxNum = Math.max(...nums);
    return `AE-${String(maxNum + 1).padStart(2, '0')}`;
  }

  return 'AE-01';
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundCurrency = (value) => Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

const parseQty = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const normalizeInvoiceItems = (items = [], isIntraState = true) => {
  if (!Array.isArray(items)) return [];

  return items.map((item) => {
    const unitPrice = toNumber(item.unitPrice);
    const qty = parseQty(item.qty) || 1;
    const existingCgst = toNumber(item.cgst);
    const existingSgst = toNumber(item.sgst);
    const existingIgst = toNumber(item.igst);
    const totalGstRate = existingIgst || (existingCgst + existingSgst) || toNumber(item.gstRate) || 18;

    const cgst = isIntraState ? (existingCgst || (totalGstRate / 2)) : 0;
    const sgst = isIntraState ? (existingSgst || (totalGstRate / 2)) : 0;
    const igst = isIntraState ? 0 : (existingIgst || totalGstRate);
    const taxableValue = roundCurrency(unitPrice * qty);
    const cgstAmt = roundCurrency((taxableValue * cgst) / 100);
    const sgstAmt = roundCurrency((taxableValue * sgst) / 100);
    const igstAmt = roundCurrency((taxableValue * igst) / 100);
    const grossAmt = roundCurrency(taxableValue + cgstAmt + sgstAmt + igstAmt);

    return {
      description: item.description || '',
      validity: item.validity || '',
      unitPrice,
      cgst,
      sgst,
      igst,
      priceWithGst: qty > 0 ? roundCurrency(grossAmt / qty) : roundCurrency(unitPrice),
      qty,
      grossAmt,
    };
  });
};

router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = req.query.search || '';

    let query = buildInvoiceScope(req.user, req.hierarchyScope);

    if (search) {
      const searchConditions = [
        { requestId: { $regex: search, $options: 'i' } },
        { vehicleType: { $regex: search, $options: 'i' } },
        { imei: { $regex: search, $options: 'i' } },
        { iccid: { $regex: search, $options: 'i' } },
        { status: { $regex: search, $options: 'i' } },
        { invoiceNo: { $regex: search, $options: 'i' } },
        { piNo: { $regex: search, $options: 'i' } },
        { endCustomerName: { $regex: search, $options: 'i' } },
        { rmn: { $regex: search, $options: 'i' } },
      ];

      query = {
        $and: [
          query,
          { $or: searchConditions },
        ],
      };
    }

    const total = await Invoice.countDocuments(query);
    const requests = await Invoice.find(query)
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
    console.error('List invoices error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/next-pi-no', requireRoles(PORTAL_ROLES.ADMIN), async (req, res) => {
  try {
    const [nextPiNo, nextInvoiceNo] = await Promise.all([
      generateNextPiNo(),
      generateNextInvoiceNo(),
    ]);

    res.json({ nextPiNo, nextInvoiceNo });
  } catch (error) {
    console.error('Generate invoice numbers error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      ...buildInvoiceScope(req.user, req.hierarchyScope),
    }).populate('userId');

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    res.json(invoice);
  } catch (error) {
    console.error('Get invoice error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', requireRoles(...operationsRoles), async (req, res) => {
  try {
    const {
      vehicleType,
      validity,
      imei,
      iccid,
      isSubDealer,
      subDealerName,
      customerState,
      dealerState,
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
      items,
    } = req.body;

    const requestId = await generateInvoiceRequestId();
    let finalImei = imei || '';
    let finalIccid = iccid || '';

    if (finalImei && finalImei.length < 15) {
      const matchedDevice = await Device.findOne(combineQueries(
        buildDeviceScopeQuery(req.hierarchyScope),
        {
          $or: [
          { imei: new RegExp(finalImei, 'i') },
          { iccid: new RegExp(finalImei, 'i') },
          ],
        },
      ));

      if (matchedDevice) {
        finalImei = matchedDevice.imei;
        finalIccid = matchedDevice.iccid;
      }
    }

    let customerId = null;
    let customerCredentials = null;

    // User creation logic removed as per request to stop generating customer login ID on invoice generation

    let finalPiNo = piNo || '';
    if (!finalPiNo || finalPiNo === 'AE-01') {
      finalPiNo = await generateNextPiNo();
    }

    let finalInvoiceNo = invoiceNo || '';
    if (!finalInvoiceNo) {
      finalInvoiceNo = await generateNextInvoiceNo();
    }

    const targetState = isSubDealer ? (dealerState || 'Bihar') : (customerState || 'Bihar');
    const isIntraState = targetState && targetState.toLowerCase() === 'bihar';
    const normalizedItems = normalizeInvoiceItems(items, isIntraState);
    const calculatedPiValue = roundCurrency(
      normalizedItems.reduce((sum, item) => sum + item.grossAmt, 0),
    );

    const invoice = await Invoice.create({
      requestId,
      userId: req.user._id,
      customerId,
      vehicleType: vehicleType || '',
      validity: validity || '',
      imei: finalImei,
      iccid: finalIccid,
      isSubDealer: isSubDealer || false,
      subDealerName: subDealerName || '',
      customerState: customerState || 'Bihar',
      dealerState: dealerState || 'Bihar',
      piNo: finalPiNo,
      piValue: calculatedPiValue || toNumber(piValue),
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
      items: normalizedItems,
    });

    res.status(201).json({
      ...invoice.toObject(),
      customerCredentials,
    });
  } catch (error) {
    console.error('Create invoice error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
