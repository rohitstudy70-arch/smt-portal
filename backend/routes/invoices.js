const express = require('express');
const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const Device = require('../models/Device');
const User = require('../models/User');
const ActivationRequest = require('../models/ActivationRequest');
const RenewalRequest = require('../models/RenewalRequest');
const Transaction = require('../models/Transaction');
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
  const allInvoices = await Invoice.find({ piNo: /^(AE-\d+|AE_PI_\d+)$/ }).select('piNo');

  let maxNum = 12;

  if (allInvoices.length > 0) {
    const nums = allInvoices.map((inv) => {
      const match = inv.piNo.match(/^(?:AE-|AE_PI_)(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    });
    const dbMax = Math.max(...nums);
    if (dbMax > maxNum) {
      maxNum = dbMax;
    }
  }

  return `AE-${maxNum + 1}`;
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
    const qty = parseQty(item.qty) || (Array.isArray(item.imeis) && item.imeis.length > 0 ? item.imeis.length : 1);
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

    const imeis = Array.isArray(item.imeis) ? item.imeis : [];

    return {
      description: item.description || '',
      category: item.category || '',
      validity: item.validity || '',
      unitPrice,
      cgst,
      sgst,
      igst,
      priceWithGst: qty > 0 ? roundCurrency(grossAmt / qty) : roundCurrency(unitPrice),
      qty,
      grossAmt,
      imeis,
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
      .populate('userId')
      .populate('dealerId')
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

// @route   GET /api/invoices/dealer-billable-items
// @desc    Get categorized billable devices, top-ups, and renewals for a selected dealer
// @access  Protected (Admin / Dealer)
router.get('/dealer-billable-items', async (req, res) => {
  try {
    const { dealerId, fromDate, toDate } = req.query;

    if (!dealerId) {
      return res.status(400).json({ message: 'Please select a dealer.' });
    }

    if (!mongoose.Types.ObjectId.isValid(dealerId)) {
      return res.status(400).json({ message: 'Invalid dealer ID.' });
    }

    const dealer = await User.findById(dealerId).select('-password');
    if (!dealer) {
      return res.status(404).json({ message: 'Dealer not found.' });
    }

    // Find all sub-dealers under this dealer to include their devices if applicable
    const subDealers = await User.find({ parentId: dealer._id }).select('_id displayName username');
    const allScopedUserIds = [dealer._id, ...subDealers.map(sd => sd._id)];

    // Date filters (if passed)
    const deviceDateQuery = {};
    const reqDateQuery = {};
    if (fromDate || toDate) {
      deviceDateQuery.presentDate = {};
      reqDateQuery.dateTime = {};
      if (fromDate) {
        const from = new Date(`${fromDate}T00:00:00+05:30`);
        deviceDateQuery.presentDate.$gte = from;
        reqDateQuery.dateTime.$gte = from;
      }
      if (toDate) {
        const to = new Date(`${toDate}T23:59:59+05:30`);
        deviceDateQuery.presentDate.$lte = to;
        reqDateQuery.dateTime.$lte = to;
      }
    }

    // 1. Fetch all Devices for this dealer
    const deviceMatch = {
      $or: [
        { dealerId: { $in: allScopedUserIds } },
        { subDealerId: { $in: allScopedUserIds } },
        { userId: { $in: allScopedUserIds } },
        { dealerName: dealer.companyName || dealer.displayName || dealer.username },
      ],
      ...deviceDateQuery,
    };

    const devices = await Device.find(deviceMatch).sort({ presentDate: -1, createdAt: -1 }).lean();

    // 2. Fetch all Activation Requests for this dealer
    const actReqMatch = {
      $or: [
        { dealerId: { $in: allScopedUserIds } },
        { subDealerId: { $in: allScopedUserIds } },
        { userId: { $in: allScopedUserIds } },
        { dealerName: dealer.companyName || dealer.displayName || dealer.username },
      ],
      ...reqDateQuery,
    };
    const activationRequests = await ActivationRequest.find(actReqMatch).sort({ dateTime: -1 }).lean();

    // 3. Fetch all Renewal Requests for this dealer
    const renewalDateQuery = {};
    if (fromDate || toDate) {
      renewalDateQuery.renewalDate = {};
      if (fromDate) renewalDateQuery.renewalDate.$gte = new Date(`${fromDate}T00:00:00+05:30`);
      if (toDate) renewalDateQuery.renewalDate.$lte = new Date(`${toDate}T23:59:59+05:30`);
    }

    const renewalMatch = {
      $or: [
        { dealerId: { $in: allScopedUserIds } },
        { userId: { $in: allScopedUserIds } },
        { dealerName: dealer.companyName || dealer.displayName || dealer.username },
      ],
      ...renewalDateQuery,
    };
    const renewalRequests = await RenewalRequest.find(renewalMatch).sort({ renewalDate: -1 }).lean();

    // 4. Fetch all Top-Up Transactions for this dealer
    const txDateQuery = {};
    if (fromDate || toDate) {
      txDateQuery.date = {};
      if (fromDate) txDateQuery.date.$gte = new Date(`${fromDate}T00:00:00+05:30`);
      if (toDate) txDateQuery.date.$lte = new Date(`${toDate}T23:59:59+05:30`);
    }

    const txTopups = await Transaction.find({
      userId: { $in: allScopedUserIds },
      $or: [
        { paymentFor: /top\s*up|recharge/i },
        { remarks: /top\s*up|recharge/i },
      ],
      ...txDateQuery,
    }).sort({ date: -1 }).lean();

    // Categorization logic
    const twoYearList = [];
    const oneYearList = [];
    const topupList = [];
    const renewalList = [];

    const seenTopupImeis = new Set();
    const seenRenewalImeis = new Set();
    const seenActImeis = new Set();

    // Process Devices
    devices.forEach((dev) => {
      const imei = String(dev.imei || dev.imeiNumber || '').trim();
      if (!imei) return;

      const validityStr = String(dev.validity || '').toLowerCase();
      const statusStr = String(dev.status || '').toLowerCase();
      const topUpAmt = Number(dev.topUpAmount || dev.renewalAmount || 0);

      const baseItem = {
        id: dev._id,
        imei,
        serialNo: dev.serialNo || dev.serialNumber || '',
        iccid: dev.iccid || dev.iccidNumber || '',
        deviceName: dev.deviceName || 'VLTD Device',
        validity: dev.validity || '1 Year',
        billAmount: dev.billAmount || 0,
        date: dev.presentDate || dev.createdAt,
        type: 'Device',
      };

      // If top-up was done on this device (via Add Device or device management)
      if (topUpAmt > 0 || statusStr.includes('topup') || statusStr.includes('recharge') || validityStr.includes('recharge')) {
        if (!seenTopupImeis.has(imei)) {
          topupList.push({
            ...baseItem,
            plan: 'Device Top-up / Recharge',
            amount: topUpAmt || 590,
            type: 'DeviceTopUp',
          });
          seenTopupImeis.add(imei);
        }
      }

      // If renewal was done on this device
      if (statusStr.includes('renewal') || validityStr.includes('renewal')) {
        if (!seenRenewalImeis.has(imei)) {
          renewalList.push({
            ...baseItem,
            plan: 'Device Renewal',
            amount: dev.renewalAmount || 1770,
            type: 'DeviceRenewal',
          });
          seenRenewalImeis.add(imei);
        }
      }

      // Categorize into 2-Year or 1-Year activation
      if (!seenActImeis.has(imei)) {
        if (validityStr.includes('2 year') || validityStr.includes('2yr') || validityStr.includes('24 month')) {
          twoYearList.push(baseItem);
        } else {
          oneYearList.push(baseItem);
        }
        seenActImeis.add(imei);
      }
    });

    // Process Top-up Transactions
    txTopups.forEach((tx) => {
      const imei = String(tx.imei || tx.referenceNo || '').trim();
      if (imei && imei !== 'N/A' && !seenTopupImeis.has(imei)) {
        topupList.push({
          id: tx._id,
          requestId: tx.transactionId,
          imei,
          serialNo: tx.serialNo || '',
          iccid: tx.iccid || '',
          deviceName: tx.deviceName || 'Top Up / Recharge',
          customerName: dealer.displayName || 'Customer',
          vehicleNo: '-',
          plan: 'Data / SIM Top-up',
          amount: tx.transactedAmt || tx.requestedAmt || 590,
          date: tx.date,
          type: 'TransactionTopUp',
        });
        seenTopupImeis.add(imei);
      }
    });

    // Process ActivationRequests
    activationRequests.forEach((reqItem) => {
      const imei = String(reqItem.imei || '').trim();
      const planStr = String(reqItem.plan || '').toLowerCase();
      const reqTypeStr = String(reqItem.requestType || '').toLowerCase();

      const item = {
        id: reqItem._id,
        requestId: reqItem.requestId,
        imei: imei || 'N/A',
        customerName: reqItem.customerName || 'Customer',
        vehicleNo: reqItem.vehicleNo || '',
        plan: reqItem.plan || reqItem.requestType || '',
        amount: reqItem.amount || 0,
        date: reqItem.dateTime,
        type: 'ActivationRequest',
      };

      if (reqTypeStr.includes('top-up') || reqTypeStr.includes('topup') || planStr.includes('recharge') || reqTypeStr.includes('recharge')) {
        if (imei && !seenTopupImeis.has(imei)) {
          topupList.push(item);
          seenTopupImeis.add(imei);
        } else if (!imei) {
          topupList.push(item);
        }
      } else if (planStr.includes('renewal') || reqTypeStr.includes('renewal')) {
        if (imei && !seenRenewalImeis.has(imei)) {
          renewalList.push(item);
          seenRenewalImeis.add(imei);
        } else if (!imei) {
          renewalList.push(item);
        }
      } else if (imei && !seenActImeis.has(imei)) {
        if (planStr.includes('2 year') || planStr.includes('2yr')) {
          twoYearList.push(item);
        } else {
          oneYearList.push(item);
        }
        seenActImeis.add(imei);
      }
    });

    // Process RenewalRequests
    renewalRequests.forEach((renItem) => {
      const imei = String(renItem.imei || '').trim();
      if (!imei || !seenRenewalImeis.has(imei)) {
        renewalList.push({
          id: renItem._id,
          requestId: renItem.requestId,
          imei: imei || 'N/A',
          customerName: renItem.customerName || 'Customer',
          vehicleNo: renItem.vehicleNumber || '',
          validity: renItem.validity || '1 Year',
          amount: renItem.billAmount || 0,
          date: renItem.renewalDate || renItem.createdAt,
          type: 'RenewalRequest',
        });
        if (imei) seenRenewalImeis.add(imei);
      }
    });

    // Suggested standard pricing (editable on UI)
    const suggestedRates = {
      twoYearPriceWithGst: 4200,
      oneYearPriceWithGst: 2370,
      topupPriceWithGst: 590,
      renewalPriceWithGst: 1770,
    };

    res.json({
      dealer: {
        _id: dealer._id,
        displayName: dealer.displayName || dealer.companyName || dealer.username,
        companyName: dealer.companyName || dealer.displayName,
        username: dealer.username,
        userType: dealer.userType,
        mobileNo: dealer.mobileNo || '',
        email: dealer.email || '',
        address: dealer.address || '',
        city: dealer.city || '',
        state: dealer.state || 'Bihar',
        pincode: dealer.pincode || '',
        gstNo: dealer.gstNo || '',
        panNo: dealer.panNo || '',
        availableBalance: dealer.availableBalance || 0,
        overDrawnAmount: dealer.overDrawnAmount || 0,
      },
      categories: {
        twoYearActivations: {
          count: twoYearList.length,
          items: twoYearList,
          suggestedPriceWithGst: suggestedRates.twoYearPriceWithGst,
        },
        oneYearActivations: {
          count: oneYearList.length,
          items: oneYearList,
          suggestedPriceWithGst: suggestedRates.oneYearPriceWithGst,
        },
        topupPlans: {
          count: topupList.length,
          items: topupList,
          suggestedPriceWithGst: suggestedRates.topupPriceWithGst,
        },
        renewalPlans: {
          count: renewalList.length,
          items: renewalList,
          suggestedPriceWithGst: suggestedRates.renewalPriceWithGst,
        },
      },
      summary: {
        totalDevices: twoYearList.length + oneYearList.length,
        totalTopups: topupList.length,
        totalRenewals: renewalList.length,
        grandTotalItems: twoYearList.length + oneYearList.length + topupList.length + renewalList.length,
      },
    });
  } catch (error) {
    console.error('Get dealer billable items error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/invoices/generate-dealer-bill
// @desc    Generate and save a consolidated dealer bill/invoice
// @access  Protected (Admin)
router.post('/generate-dealer-bill', async (req, res) => {
  try {
    const {
      dealerId,
      dealerName,
      dealerAddress,
      dealerGstNo,
      dealerState,
      customerState,
      piNo,
      invoiceNo,
      items,
      notes,
      allImeis,
    } = req.body;

    if (!dealerId) {
      return res.status(400).json({ message: 'Dealer is required to generate bill.' });
    }

    const requestId = await generateInvoiceRequestId();

    let finalPiNo = piNo || '';
    if (!finalPiNo || finalPiNo === 'AE-01' || finalPiNo === 'AE_PI_001') {
      finalPiNo = await generateNextPiNo();
    }

    let finalInvoiceNo = invoiceNo || '';
    if (!finalInvoiceNo) {
      finalInvoiceNo = await generateNextInvoiceNo();
    }

    const targetState = dealerState || customerState || 'Bihar';
    const isIntraState = targetState && targetState.toLowerCase() === 'bihar';

    const normalizedItems = normalizeInvoiceItems(items, isIntraState);
    const calculatedPiValue = roundCurrency(
      normalizedItems.reduce((sum, item) => sum + item.grossAmt, 0),
    );

    const cleanAllImeis = Array.isArray(allImeis)
      ? allImeis.map((im) => {
          if (!im) return '';
          if (typeof im === 'string') return im.trim();
          return String(im.imei || im.serialNo || '').trim();
        }).filter(Boolean)
      : [];

    const invoice = await Invoice.create({
      requestId,
      userId: req.user._id,
      dealerId,
      invoiceType: 'DealerConsolidated',
      customerState: customerState || 'Bihar',
      dealerState: dealerState || 'Bihar',
      piNo: finalPiNo,
      piValue: calculatedPiValue,
      invoiceNo: finalInvoiceNo,
      status: 'Pending',
      endCustomerName: dealerName || 'Dealer',
      address: dealerAddress || '',
      poaNo: dealerGstNo || '',
      notes: notes || '',
      imeiList: cleanAllImeis,
      items: normalizedItems,
    });

    await invoice.populate('userId');
    if (invoice.dealerId) {
      await invoice.populate('dealerId');
    }

    res.status(201).json(invoice);
  } catch (error) {
    console.error('Generate dealer bill error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid invoice ID' });
    }

    const invoice = await Invoice.findOne({
      _id: req.params.id,
      ...buildInvoiceScope(req.user, req.hierarchyScope),
    }).populate('userId').populate('dealerId');

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
    if (!finalPiNo || finalPiNo === 'AE-01' || finalPiNo === 'AE_PI_001') {
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

    await invoice.populate('userId');

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
