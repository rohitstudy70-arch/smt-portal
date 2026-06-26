const express = require('express');
const Product = require('../models/Product');
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

const router = express.Router();

router.use(protect, attachHierarchyScope);

const productManageRoles = [PORTAL_ROLES.ADMIN, PORTAL_ROLES.DEALER];
const productTypes = ['VLTD', 'GPS', 'Renewal', 'VLTD RENEWAL', 'GPS RENEWAL'];

const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const combineQueries = (...queries) => {
  const activeQueries = queries.filter((query) => query && Object.keys(query).length > 0);
  if (activeQueries.length === 0) return {};
  if (activeQueries.length === 1) return activeQueries[0];
  return { $and: activeQueries };
};

const buildProductScopeQuery = (scope) => {
  if (scope.role === PORTAL_ROLES.ADMIN) {
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

const normalizeProductType = (value) => {
  const normalized = String(value || 'VLTD').trim().toLowerCase();
  if (normalized === 'gps') return 'GPS';
  if (normalized === 'renewal') return 'Renewal';
  if (normalized === 'vltd renewal') return 'VLTD RENEWAL';
  if (normalized === 'gps renewal') return 'GPS RENEWAL';
  return 'VLTD';
};

const normalizeValidity = (value) => {
  const normalized = String(value || '1 Year').trim().toLowerCase();
  if (normalized === '2 year' || normalized === '2 years') return '2 Year';
  if (normalized === '3 year' || normalized === '3 years') return '3 Year';
  return '1 Year';
};

const validityYears = (validity) => {
  if (validity === '3 Year') return 3;
  if (validity === '2 Year') return 2;
  return 1;
};

const parseOptionalDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const addYears = (date, years) => {
  if (!date) return null;
  const nextDate = new Date(date);
  nextDate.setFullYear(nextDate.getFullYear() + years);
  return nextDate;
};

const normalizeProductInput = (body = {}) => {
  const productDescription = normalizeProductType(body.productDescription || body.product);
  const validity = normalizeValidity(body.validity);
  const activationDate = parseOptionalDate(body.activationDate);
  const renewalDate = parseOptionalDate(body.renewalDate);

  const input = {
    dealerId: String(body.dealerId || '').trim(),
    dealerName: String(body.dealerName || '').trim(),
    subDealerId: (body.subDealerId && body.subDealerId.match(/^[0-9a-fA-F]{24}$/)) ? body.subDealerId : null,
    subDealerName: String(body.subDealerName || '').trim(),
    vendor: String(body.vendor || '').trim(),
    productDescription,
    existingDeviceSearch: String(body.existingDeviceSearch || body.search || '').trim(),
    imei: String(body.imei || body.imeiNo || '').trim(),
    serialNo: String(body.serialNo || body.serialNumber || '').trim(),
    iccid: String(body.iccid || body.iccidNo || '').trim(),
    msisdn1: String(body.msisdn1 || '').trim(),
    msisdn2: String(body.msisdn2 || '').trim(),
    itrNo: String(body.itrNo || '').trim(),
    vehicleNumber: String(body.vehicleNumber || '').trim(),
    validity,
    activationDate,
    renewalDate,
    expiryDate: addYears(activationDate, validityYears(validity)),
    newExpiryDate: addYears(renewalDate, validityYears(validity)),
    billAmount: Number(body.billAmount) || 0,
  };

  if (input.productDescription === 'GPS') {
    input.iccid = '';
    input.msisdn1 = '';
    input.msisdn2 = '';
    input.itrNo = '';
  }

  if (['Renewal', 'VLTD RENEWAL', 'GPS RENEWAL'].includes(input.productDescription)) {
    input.serialNo = '';
    input.iccid = '';
    input.msisdn1 = '';
    input.msisdn2 = '';
    input.itrNo = '';
    input.activationDate = null;
    input.expiryDate = input.newExpiryDate;
  }

  return input;
};

const buildRegexCondition = (value, fields) => {
  if (!value) return null;
  const regex = new RegExp(escapeRegExp(String(value).trim()), 'i');
  return { $or: fields.map((field) => ({ [field]: regex })) };
};

const buildProductFilterQuery = (queryParams = {}) => {
  const conditions = [];
  const {
    search = '',
    productDescription = '',
    dealerId = '',
    dateFrom = '',
    dateTo = '',
  } = queryParams;

  const searchCondition = buildRegexCondition(search, [
    'dealerName',
    'productDescription',
    'existingDeviceSearch',
    'imei',
    'serialNo',
    'iccid',
    'vehicleNumber',
  ]);
  if (searchCondition) conditions.push(searchCondition);

  if (productDescription && productTypes.includes(productDescription)) {
    conditions.push({ productDescription });
  }

  if (dealerId) {
    conditions.push({ dealerId });
  }

  if (dateFrom || dateTo) {
    const range = {};
    if (dateFrom) {
      const start = new Date(dateFrom);
      if (!Number.isNaN(start.getTime())) range.$gte = start;
    }
    if (dateTo) {
      const end = new Date(dateTo);
      if (!Number.isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
    }
    if (Object.keys(range).length > 0) {
      conditions.push({ createdAt: range });
    }
  }

  return combineQueries(...conditions);
};

const populateProduct = (query) => query
  .populate('dealerId', 'displayName companyName username userType availableBalance')
  .populate('subDealerId', 'displayName companyName username userType')
  .populate('createdBy', 'displayName companyName username userType');

const findDealerFromName = (scope, dealerName) => {
  if (!dealerName) return null;
  const normalized = dealerName.toLowerCase();

  return scope.users.find((candidate) => (
    getPortalRole(candidate) === PORTAL_ROLES.DEALER
    && labelForUser(candidate).toLowerCase() === normalized
  )) || null;
};

const resolveProductDealer = async (req, input) => {
  if (req.portalRole === PORTAL_ROLES.ADMIN) {
    const dealer = input.dealerId
      ? await ensureUserInHierarchy(input.dealerId, req.hierarchyScope)
      : findDealerFromName(req.hierarchyScope, input.dealerName);

    if (!dealer || getPortalRole(dealer) !== PORTAL_ROLES.DEALER) {
      return { error: { status: 400, message: 'Please select a valid dealer.' } };
    }

    return { dealer };
  }

  if (req.portalRole === PORTAL_ROLES.DEALER) {
    if (input.dealerId && input.dealerId !== req.user._id.toString()) {
      return { error: { status: 403, message: 'Dealers can create products only for their own account.' } };
    }

    return { dealer: req.user };
  }

  return { error: { status: 403, message: 'Sub Dealers cannot create products.' } };
};

const generateTransactionId = () => {
  const randomNum = Math.floor(10000 + Math.random() * 90000);
  const date = new Date();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `ITR_${mm}_${dd}_${randomNum}`;
};

const buildLedgerRemarks = (input) => {
  const vehicle = input.vehicleNumber ? ` Vehicle ${input.vehicleNumber}` : '';
  const imei = input.imei ? ` IMEI ${input.imei}` : '';
  return `Product ${input.productDescription}:${vehicle}${imei}`.trim();
};

const createLedgerDebit = async ({ targetDealer, product, input, amount, createdBy }) => {
  const originalBalance = Number(targetDealer.availableBalance) || 0;
  targetDealer.availableBalance = originalBalance - amount;
  await targetDealer.save();

  const transaction = await Transaction.create({
    userId: targetDealer._id,
    transactionId: generateTransactionId(),
    paymentId: product._id.toString(),
    paymentFor: ['Renewal', 'VLTD RENEWAL', 'GPS RENEWAL'].includes(input.productDescription) ? 'Product Renewal' : 'Product Purchase',
    referenceNo: input.vehicleNumber || input.imei || input.existingDeviceSearch || product._id.toString(),
    payMode: 'Itwallet',
    transactionType: 'Debit',
    status: 'Success',
    remarks: buildLedgerRemarks(input),
    requestedAmt: amount,
    transactedAmt: amount,
    deviceName: input.productDescription,
    imei: input.imei,
    iccid: input.iccid,
    serialNo: input.serialNo,
    balanceAfterTransaction: targetDealer.availableBalance,
    createdBy,
  });

  return { transaction, originalBalance };
};

const toExistingDevicePayload = (source, item) => ({
  source,
  _id: item._id,
  dealerId: item.dealerId,
  dealerName: item.dealerName,
  imei: item.imei || item.imeiNumber || '',
  serialNo: item.serialNo || item.serialNumber || '',
  iccid: item.iccid || item.iccidNumber || '',
  vehicleNumber: item.vehicleNumber || '',
  expiryDate: item.newExpiryDate || item.expiryDate || null,
});

router.get('/search-existing', requireRoles(...productManageRoles), async (req, res) => {
  try {
    const searchText = String(req.query.query || '').trim();
    if (!searchText) {
      return res.status(400).json({ message: 'Search value is required.' });
    }

    let dealerQuery = {};
    if (req.portalRole === PORTAL_ROLES.DEALER) {
      dealerQuery = { dealerId: req.user._id };
    } else if (req.query.dealerId) {
      const dealer = await ensureUserInHierarchy(req.query.dealerId, req.hierarchyScope);
      if (!dealer || getPortalRole(dealer) !== PORTAL_ROLES.DEALER) {
        return res.status(400).json({ message: 'Please select a valid dealer.' });
      }
      dealerQuery = { dealerId: dealer._id };
    }

    const regex = new RegExp(escapeRegExp(searchText), 'i');
    const productQuery = combineQueries(
      buildProductScopeQuery(req.hierarchyScope),
      dealerQuery,
      {
        $or: [
          { imei: regex },
          { vehicleNumber: regex },
          { existingDeviceSearch: regex },
          { serialNo: regex },
        ],
      },
    );

    const product = await Product.findOne(productQuery).sort({ createdAt: -1 });
    if (product) {
      return res.json(toExistingDevicePayload('Product', product));
    }

    const deviceQuery = combineQueries(
      buildDeviceScopeQuery(req.hierarchyScope),
      dealerQuery,
      {
        $or: [
          { imei: regex },
          { imeiNumber: regex },
          { serialNo: regex },
          { serialNumber: regex },
        ],
      },
    );

    const device = await Device.findOne(deviceQuery).sort({ createdAt: -1 });
    if (device) {
      return res.json(toExistingDevicePayload('Device', device));
    }

    return res.status(404).json({ message: 'No matching device found.' });
  } catch (error) {
    console.error('Search existing product/device error:', error.message);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/', requireRoles(...productManageRoles), async (req, res) => {
  try {
    const { limit = 10, page = 1 } = req.query;

    if (req.query.dealerId) {
      const dealer = await ensureUserInHierarchy(req.query.dealerId, req.hierarchyScope);
      if (!dealer || getPortalRole(dealer) !== PORTAL_ROLES.DEALER) {
        return res.status(400).json({ message: 'Please select a valid dealer.' });
      }
    }

    const scopeQuery = buildProductScopeQuery(req.hierarchyScope);
    const filterQuery = buildProductFilterQuery(req.query);
    const query = combineQueries(scopeQuery, filterQuery);

    const parsedLimit = Math.min(parseInt(limit, 10) || 10, 500);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);

    const [products, total] = await Promise.all([
      populateProduct(Product.find(query))
        .sort({ createdAt: -1 })
        .skip((parsedPage - 1) * parsedLimit)
        .limit(parsedLimit),
      Product.countDocuments(query),
    ]);

    return res.json({
      products,
      total,
      pages: Math.ceil(total / parsedLimit),
      currentPage: parsedPage,
    });
  } catch (error) {
    console.error('Get products error:', error.message);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', requireRoles(PORTAL_ROLES.ADMIN), async (req, res) => {
  let productCreated = null;
  let transactionCreated = null;
  let balanceRollback = null;

  try {
    const input = normalizeProductInput(req.body);

    if (req.portalRole !== PORTAL_ROLES.ADMIN && input.vendor === 'iTriangle') {
      return res.status(400).json({ message: 'Selection of model iTriangle is restricted to admin only.' });
    }

    if (!productTypes.includes(input.productDescription)) {
      return res.status(400).json({ message: 'Please select a valid product.' });
    }

    if (['Renewal', 'VLTD RENEWAL', 'GPS RENEWAL'].includes(input.productDescription) && !input.existingDeviceSearch) {
      return res.status(400).json({ message: 'Existing Device Search is required for Renewal.' });
    }

    if (input.billAmount < 0) {
      return res.status(400).json({ message: 'Bill Amount cannot be negative.' });
    }

    const ownership = await resolveProductDealer(req, input);
    if (ownership.error) {
      return res.status(ownership.error.status).json({ message: ownership.error.message });
    }

    const targetDealer = await User.findById(ownership.dealer._id);
    if (!targetDealer) {
      return res.status(404).json({ message: 'Dealer not found.' });
    }

    const dealerName = labelForUser(targetDealer);
    const billAmount = Number(input.billAmount) || 0;

    productCreated = await Product.create({
      userId: targetDealer._id,
      dealerId: targetDealer._id,
      dealerName,
      subDealerId: input.subDealerId,
      subDealerName: input.subDealerName,
      vendor: input.vendor,
      productDescription: input.productDescription,
      existingDeviceSearch: input.existingDeviceSearch,
      imei: input.imei,
      serialNo: input.serialNo,
      iccid: input.iccid,
      msisdn1: input.msisdn1,
      msisdn2: input.msisdn2,
      itrNo: input.itrNo,
      vehicleNumber: input.vehicleNumber,
      validity: input.validity,
      activationDate: input.activationDate,
      renewalDate: input.renewalDate,
      expiryDate: input.expiryDate,
      newExpiryDate: input.newExpiryDate,
      billAmount,
      createdBy: req.user._id,
      createdByRole: req.portalRole,
    });

    if (billAmount > 0) {
      const ledgerResult = await createLedgerDebit({
        targetDealer,
        product: productCreated,
        input,
        amount: billAmount,
        createdBy: req.user._id,
      });
      transactionCreated = ledgerResult.transaction;
      balanceRollback = {
        userId: targetDealer._id,
        originalBalance: ledgerResult.originalBalance,
      };

      productCreated.ledgerTransactionId = transactionCreated._id;
      await productCreated.save();
    }

    await AuditLog.create({
      userId: req.user._id,
      action: 'PRODUCT_CREATE',
      ipAddress: req.ip || '',
      details: {
        dealerId: targetDealer._id,
        productDescription: input.productDescription,
        vehicleNumber: input.vehicleNumber,
        billAmount,
        transactionId: transactionCreated?.transactionId || null,
      },
    }).catch((e) => console.error('Failed to log product audit event:', e.message));

    const populatedProduct = await populateProduct(Product.findById(productCreated._id));
    return res.status(201).json({ message: 'Product added successfully!', product: populatedProduct });
  } catch (error) {
    console.error('Create product error, rolling back changes:', error.message);

    if (transactionCreated) {
      await Transaction.deleteOne({ _id: transactionCreated._id }).catch((rollbackError) => {
        console.error('Failed to rollback product transaction:', rollbackError.message);
      });
    }

    if (balanceRollback) {
      await User.updateOne(
        { _id: balanceRollback.userId },
        { $set: { availableBalance: balanceRollback.originalBalance } },
      ).catch((rollbackError) => {
        console.error('Failed to rollback product ledger balance:', rollbackError.message);
      });
    }

    if (productCreated) {
      await Product.deleteOne({ _id: productCreated._id }).catch((rollbackError) => {
        console.error('Failed to rollback product record:', rollbackError.message);
      });
    }

    return res.status(500).json({ message: error.message || 'Server error' });
  }
});

// Edit Product
router.put('/:id', requireRoles(PORTAL_ROLES.ADMIN), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    const input = normalizeProductInput(req.body);

    if (req.portalRole !== PORTAL_ROLES.ADMIN && input.vendor === 'iTriangle') {
      return res.status(400).json({ message: 'Selection of model iTriangle is restricted to admin only.' });
    }

    if (!productTypes.includes(input.productDescription)) {
      return res.status(400).json({ message: 'Please select a valid product.' });
    }

    if (['Renewal', 'VLTD RENEWAL', 'GPS RENEWAL'].includes(input.productDescription) && !input.existingDeviceSearch) {
      return res.status(400).json({ message: 'Existing Device Search is required for Renewal.' });
    }

    if (input.billAmount < 0) {
      return res.status(400).json({ message: 'Bill Amount cannot be negative.' });
    }

    const ownership = await resolveProductDealer(req, input);
    if (ownership.error) {
      return res.status(ownership.error.status).json({ message: ownership.error.message });
    }

    const targetDealer = await User.findById(ownership.dealer._id);
    if (!targetDealer) {
      return res.status(404).json({ message: 'Dealer not found.' });
    }

    const dealerName = labelForUser(targetDealer);
    const billAmount = Number(input.billAmount) || 0;

    product.userId = targetDealer._id;
    product.dealerId = targetDealer._id;
    product.dealerName = dealerName;
    product.subDealerId = input.subDealerId;
    product.subDealerName = input.subDealerName;
    product.vendor = input.vendor;
    product.productDescription = input.productDescription;
    product.existingDeviceSearch = input.existingDeviceSearch;
    product.imei = input.imei;
    product.serialNo = input.serialNo;
    product.iccid = input.iccid;
    product.msisdn1 = input.msisdn1;
    product.msisdn2 = input.msisdn2;
    product.itrNo = input.itrNo;
    product.vehicleNumber = input.vehicleNumber;
    product.validity = input.validity;
    product.activationDate = input.activationDate;
    product.renewalDate = input.renewalDate;
    product.expiryDate = input.expiryDate;
    product.newExpiryDate = input.newExpiryDate;
    product.billAmount = billAmount;
    product.updatedAt = new Date();

    await product.save();

    const populatedProduct = await populateProduct(Product.findById(product._id));
    res.json({ message: 'Product updated successfully!', product: populatedProduct });
  } catch (error) {
    console.error('Update product error:', error.message);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// Delete Product
router.delete('/:id', requireRoles(PORTAL_ROLES.ADMIN), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    await Product.findByIdAndDelete(product._id);
    res.json({ message: 'Product deleted successfully.' });
  } catch (error) {
    console.error('Delete product error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
