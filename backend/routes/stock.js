const express = require('express');
const mongoose = require('mongoose');
const Device = require('../models/Device');
const Product = require('../models/Product');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const StockTransfer = require('../models/StockTransfer');
const { protect } = require('../middleware/auth');
const {
  PORTAL_ROLES,
  attachHierarchyScope,
  getPortalRole,
  labelForUser,
} = require('../middleware/hierarchy');

const router = express.Router();

router.use(protect, attachHierarchyScope);

// Stock Inventory is strictly restricted to Admin (partner / super admin)
router.use((req, res, next) => {
  const isSuperAdmin = req.user?.role === 'partner' ||
    ['admin', 'arshienterprises'].includes(String(req.user?.username || '').toLowerCase());
  if (!isSuperAdmin) {
    return res.status(403).json({ message: 'Access denied: Stock Inventory is restricted to Admin.' });
  }
  next();
});

// Helper to sanitize array of IMEIs from text/string
const parseImeis = (textOrArray) => {
  if (!textOrArray) return [];
  let rawList = [];
  if (Array.isArray(textOrArray)) {
    rawList = textOrArray;
  } else if (typeof textOrArray === 'string') {
    rawList = textOrArray.split(/[\r\n,;\s\t]+/);
  }
  const cleanList = rawList
    .map(s => String(s || '').trim().replace(/[^0-9]/g, ''))
    .filter(s => s.length >= 10); // allow 10-18 digit IMEIs/identifiers, standard is 15
  return [...new Set(cleanList)];
};


// Helper to backfill StockTransfer records if collection is empty
const ensureBackfilledStockTransfers = async () => {
  try {
    const existingCount = await StockTransfer.countDocuments();
    if (existingCount > 0) return;

    const devices = await Device.find({
      status: { $regex: /^stock$/i },
    }).lean();

    if (devices.length === 0) return;

    const grouped = {};
    for (const d of devices) {
      const dName = d.dealerName || 'Admin Stock (Arshi Enterprises)';
      const isArshi = /admin\s*stock|arshi/i.test(dName);
      const key = `${dName}__${d.vendor || 'iTriangle'}`;
      if (!grouped[key]) {
        grouped[key] = {
          dealerId: d.dealerId,
          dealerName: dName,
          vendor: d.vendor || 'iTriangle',
          isArshi,
          imeis: [],
          firstDate: d.createdAt || d.updatedAt || new Date(),
        };
      }
      grouped[key].imeis.push(d.imei);
    }

    const docsToInsert = [];
    for (const item of Object.values(grouped)) {
      docsToInsert.push({
        transferId: `STK-INIT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        action: item.isArshi ? 'STOCK_ADDED' : 'STOCK_TRANSFERRED',
        fromUserId: null,
        fromUserName: item.isArshi ? 'Supplier / Factory Import' : 'Admin Stock (Arshi Enterprises)',
        toUserId: item.dealerId,
        toUserName: item.dealerName,
        vendor: item.vendor,
        count: item.imeis.length,
        imeis: item.imeis,
        notes: item.isArshi ? 'Initial Admin Stock Available' : `Stock transferred to ${item.dealerName}`,
        transferredByName: 'Admin',
        createdAt: item.firstDate,
        updatedAt: item.firstDate,
      });
    }

    if (docsToInsert.length > 0) {
      await StockTransfer.insertMany(docsToInsert);
      console.log(`✅ Backfilled ${docsToInsert.length} stock transfer history records!`);
    }
  } catch (err) {
    console.warn('Backfill stock transfer warning:', err.message);
  }
};

// @route   GET /api/stock/dealers
// @desc    Get list of all active dealers & sub-dealers for Stock selection
// @access  Protected
router.get('/dealers', async (req, res) => {
  try {
    const isAdministration = req.hierarchy?.role === PORTAL_ROLES.ADMIN ||
      String(req.user?.userType || '').toLowerCase() === 'administration' ||
      String(req.user?.role || '').toLowerCase() === 'partner';

    let dealers = [];

    if (isAdministration) {
      // Find all non-admin users (dealers, sub-dealers, and customers)
      const allUsers = await User.find(
        {
          userType: { $nin: ['Administration'] },
          username: { $nin: ['admin', 'ArshiEnterprises', 'arshienterprises'] },
        },
        {
          displayName: 1,
          companyName: 1,
          username: 1,
          userType: 1,
          mobileNo: 1,
          email: 1,
          state: 1,
          role: 1,
          status: 1,
          parentId: 1,
        }
      ).sort({ displayName: 1, companyName: 1, username: 1 }).lean();

      // If empty, query all and filter
      if (allUsers.length > 0) {
        dealers = allUsers;
      } else {
        const raw = await User.find({}, {
          displayName: 1,
          companyName: 1,
          username: 1,
          userType: 1,
          mobileNo: 1,
          email: 1,
          state: 1,
          role: 1,
          status: 1,
          parentId: 1,
        }).lean();
        dealers = raw.filter(u => {
          const type = String(u.userType || '').toLowerCase();
          const uname = String(u.username || '').toLowerCase();
          return type !== 'administration' && uname !== 'admin' && uname !== 'arshienterprises';
        });
      }
    } else {
      // For Dealer: get descendants + self
      const descendants = await getDescendantUsers(req.user._id);
      const scoped = [req.user, ...descendants];
      dealers = scoped.filter(u => {
        const type = String(u.userType || '').toLowerCase();
        return type === 'dealer' || type === 'sub dealer' || type === 'subdealer';
      });
    }

    res.json(dealers);
  } catch (err) {
    console.error('Error fetching stock dealers:', err);
    res.status(500).json({ message: 'Failed to fetch dealers list.' });
  }
});

// @route   GET /api/stock/dealer-devices/:dealerId
// @desc    Get stock devices currently assigned to a dealer
// @access  Protected
router.get('/dealer-devices/:dealerId', async (req, res) => {
  try {
    const { dealerId } = req.params;
    const { vendor, search } = req.query;

    let targetObjIds = [];
    if (dealerId === 'admin' || dealerId === 'central') {
      const adminUsers = await User.find({
        $or: [
          { role: 'partner' },
          { userType: 'Administration' },
          { username: { $in: ['admin', 'ArshiEnterprises', 'arshienterprises'] } }
        ]
      }).select('_id');
      targetObjIds = adminUsers.map(u => u._id).filter(id => mongoose.Types.ObjectId.isValid(id));
      if (req.user && req.user._id && mongoose.Types.ObjectId.isValid(req.user._id)) {
        targetObjIds.push(new mongoose.Types.ObjectId(req.user._id));
      }
    } else if (mongoose.Types.ObjectId.isValid(dealerId)) {
      targetObjIds = [new mongoose.Types.ObjectId(dealerId)];
    } else {
      return res.json([]);
    }

    const query = {
      $or: [
        { dealerId: { $in: targetObjIds } },
        { subDealerId: { $in: targetObjIds } },
        { userId: { $in: targetObjIds } },
        { assignedTo: { $in: targetObjIds } },
      ]
    };

    if (vendor && vendor !== 'all') {
      query.vendor = vendor;
    }

    if (search && search.trim()) {
      const cleanSearch = search.trim();
      query.$and = [
        {
          $or: [
            { imei: new RegExp(cleanSearch, 'i') },
            { iccid: new RegExp(cleanSearch, 'i') },
            { serialNo: new RegExp(cleanSearch, 'i') },
          ]
        }
      ];
    }

    const devices = await Device.find(query)
      .select('imei imeiNumber vendor validity status presentDate expiryDate vehicleNo customerName createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .limit(1000);

    res.json(devices);
  } catch (err) {
    console.error('Error fetching dealer devices:', err);
    res.status(500).json({ message: 'Failed to load dealer stock devices.' });
  }
});

// @route   POST /api/stock/add
// @desc    Add bulk stock devices for a target user (dealer / sub-dealer) and model
// @access  Protected (Admin / Administration)
router.post('/add', async (req, res) => {
  try {
    const { dealerId, vendor, imeisText, validity, billAmount, notes } = req.body;

    if (!vendor) {
      return res.status(400).json({ message: 'Model (Vendor) is required.' });
    }

    let dealer = null;
    if (dealerId && dealerId !== 'admin') {
      try {
        dealer = await User.findById(dealerId);
      } catch (e) {}
    }

    if (!dealer) {
      dealer = req.user || await User.findOne({ username: { $in: ['ArshiEnterprises', 'admin'] } });
      if (!dealer) {
        dealer = await User.findOne({ role: 'partner' });
      }
    }

    if (!dealer) {
      return res.status(404).json({ message: 'Admin / Target user not found.' });
    }

    const imeis = parseImeis(imeisText);
    if (imeis.length === 0) {
      return res.status(400).json({ message: 'Please provide at least one valid IMEI number.' });
    }

    const isAdministration = String(dealer.userType || '').toLowerCase() === 'administration' ||
      String(dealer.role || '').toLowerCase() === 'partner' ||
      dealerId === 'admin';

    const dealerName = isAdministration
      ? 'Admin Stock (Arshi Enterprises)'
      : (dealer.displayName || dealer.companyName || dealer.username);

    const isSubDealer = !isAdministration && (
      String(dealer.userType || '').toLowerCase() === 'sub dealer' ||
      String(dealer.userType || '').toLowerCase() === 'subdealer'
    );

    let assignedDealerId = dealer._id;
    let assignedDealerName = dealerName;
    let assignedSubDealerId = null;
    let assignedSubDealerName = '';

    if (isSubDealer) {
      assignedSubDealerId = dealer._id;
      assignedSubDealerName = dealerName;
      if (dealer.parentId) {
        const parentUser = await User.findById(dealer.parentId);
        if (parentUser) {
          assignedDealerId = parentUser._id;
          assignedDealerName = parentUser.displayName || parentUser.companyName || parentUser.username;
        }
      }
    }

    // Check for existing devices in MongoDB
    const existing = await Device.find({
      $or: [
        { imei: { $in: imeis } },
        { imeiNumber: { $in: imeis } }
      ]
    }).select('imei');

    const existingSet = new Set(existing.map(d => String(d.imei).trim()));
    const newImeis = imeis.filter(im => !existingSet.has(im));
    const duplicateImeis = imeis.filter(im => existingSet.has(im));

    if (newImeis.length === 0) {
      return res.status(400).json({
        message: `All ${imeis.length} IMEIs already exist in the database. No new devices were added.`,
        duplicates: duplicateImeis,
        addedCount: 0
      });
    }

    const presentDate = new Date();
    const expiryDate = new Date(presentDate);
    const validStr = validity === '2 Years' ? '2 Years' : '1 Year';
    expiryDate.setFullYear(expiryDate.getFullYear() + (validStr === '2 Years' ? 2 : 1));
    const deviceRate = Number(billAmount) || 0;

    const devicesToCreate = newImeis.map(imei => ({
      userId: dealer._id,
      dealerId: assignedDealerId,
      dealerName: assignedDealerName,
      subDealerId: assignedSubDealerId,
      subDealerName: assignedSubDealerName,
      vendor: vendor.trim(),
      deviceName: `${vendor.trim()} Device`,
      imei: imei.trim(),
      imeiNumber: imei.trim(),
      billAmount: deviceRate,
      renewalAmount: 0,
      claSyAmount: 0,
      claSyCharges: 0,
      validity: validStr,
      presentDate,
      expiryDate,
      assignedTo: dealer._id,
      status: 'Stock',
      deviceStatus: 'inactive',
      activationRequestStatus: 'none',
      createdBy: req.user._id,
      createdByRole: req.portalRole || 'ADMIN',
      assignmentHistory: [{
        fromUser: req.user._id,
        toUser: dealer._id,
        action: 'Assigned',
        note: notes ? `Stock added: ${notes}` : `Initial stock added to ${dealerName} via Stock Inventory`,
        changedBy: req.user._id,
        changedAt: presentDate,
      }],
      updatedAt: presentDate,
    }));

    await Device.insertMany(devicesToCreate);

    // Sync to Product collection for compatibility
    try {
      const productsToCreate = newImeis.map(imei => ({
        userId: dealer._id,
        dealerId: assignedDealerId,
        dealerName: assignedDealerName,
        subDealerId: assignedSubDealerId,
        subDealerName: assignedSubDealerName,
        vendor: vendor.trim(),
        productDescription: 'VLTD',
        existingDeviceSearch: '',
        imei: imei.trim(),
        validity: validStr,
        activationDate: presentDate,
        expiryDate,
        billAmount: deviceRate,
        createdBy: req.user._id,
      }));
      await Product.insertMany(productsToCreate);
    } catch (prodErr) {
      console.warn('Product collection sync warning:', prodErr.message);
    }

    // Audit log
    await AuditLog.create({
      userId: req.user._id,
      action: 'STOCK_ADDED',
      ipAddress: req.ip || '',
      details: {
        dealerId: dealer._id,
        dealerName,
        vendor,
        count: newImeis.length,
        duplicatesCount: duplicateImeis.length,
      }
    }).catch(e => console.error('Audit log error:', e.message));

    res.json({
      success: true,
      message: `Successfully added ${newImeis.length} devices into stock for ${dealerName}!${duplicateImeis.length > 0 ? ` (${duplicateImeis.length} duplicates skipped)` : ''}`,
      addedCount: newImeis.length,
      duplicatesCount: duplicateImeis.length,
      duplicateImeis,
      addedImeis: newImeis,
      dealerName,
      vendor,
    });
  } catch (err) {
    console.error('Error adding stock devices:', err);
    res.status(500).json({ message: err.message || 'Failed to add stock devices.' });
  }
});

// @route   POST /api/stock/move
// @desc    Move/transfer stock devices between dealers
// @access  Protected (Admin / Administration)
router.post('/move', async (req, res) => {
  try {
    const { fromDealerId, toDealerId, imeisText, imeisList, notes } = req.body;

    if (!toDealerId) {
      return res.status(400).json({ message: 'Target (To) Dealer is required.' });
    }

    const toDealer = await User.findById(toDealerId);
    if (!toDealer) {
      return res.status(404).json({ message: 'Target (To) Dealer not found.' });
    }

    let targetImeis = [];
    if (Array.isArray(imeisList) && imeisList.length > 0) {
      targetImeis = imeisList.map(s => String(s || '').trim()).filter(Boolean);
    } else if (imeisText) {
      targetImeis = parseImeis(imeisText);
    }

    if (targetImeis.length === 0) {
      return res.status(400).json({ message: 'Please provide or select at least one IMEI to move.' });
    }

    const toDealerName = toDealer.displayName || toDealer.companyName || toDealer.username;

    // Build search query for devices to transfer
    const conditions = [
      {
        $or: [
          { imei: { $in: targetImeis } },
          { imeiNumber: { $in: targetImeis } }
        ]
      }
    ];

    if (fromDealerId) {
      let fromMatches = [];
      if (fromDealerId === 'admin' || fromDealerId === 'central') {
        const adminUsers = await User.find({
          $or: [
            { role: 'partner' },
            { userType: 'Administration' },
            { username: { $in: ['admin', 'ArshiEnterprises', 'arshienterprises'] } }
          ]
        }).select('_id');
        fromMatches = adminUsers.map(u => u._id).filter(id => mongoose.Types.ObjectId.isValid(id));
        if (req.user && req.user._id && mongoose.Types.ObjectId.isValid(req.user._id)) {
          fromMatches.push(new mongoose.Types.ObjectId(req.user._id));
        }
      } else if (mongoose.Types.ObjectId.isValid(fromDealerId)) {
        fromMatches = [new mongoose.Types.ObjectId(fromDealerId)];
      }

      conditions.push({
        $or: [
          { dealerId: { $in: fromMatches } },
          { subDealerId: { $in: fromMatches } },
          { userId: { $in: fromMatches } },
          { assignedTo: { $in: fromMatches } }
        ]
      });
    }

    const query = { $and: conditions };

    const matchingDevices = await Device.find(query);
    if (matchingDevices.length === 0) {
      return res.status(404).json({
        message: fromDealerId
          ? 'No matching devices found in the selected user\'s stock.'
          : 'No matching devices found in database with the provided IMEIs. Please verify the IMEI numbers.'
      });
    }

    const matchedIds = matchingDevices.map(d => d._id);
    const matchedImeis = matchingDevices.map(d => d.imei);
    const notFoundImeis = targetImeis.filter(im => !matchedImeis.includes(im));

    const now = new Date();
    let fromUserName = null;
    let fromUserObjectId = null;
    if (fromDealerId === 'admin' || fromDealerId === 'central') {
      fromUserObjectId = req.user?._id || null;
    } else if (fromDealerId && mongoose.Types.ObjectId.isValid(fromDealerId)) {
      fromUserObjectId = new mongoose.Types.ObjectId(fromDealerId);
      fromUserName = await User.findById(fromDealerId).select('displayName companyName username');
    }
    const fromLabel = (fromDealerId === 'admin' || fromDealerId === 'central')
      ? 'Admin Stock (Arshi Enterprises)'
      : (fromUserName ? (fromUserName.displayName || fromUserName.username) : 'Previous User');

    const isToSubDealer = String(toDealer.userType || '').toLowerCase() === 'sub dealer' || String(toDealer.userType || '').toLowerCase() === 'subdealer';
    let newDealerId = toDealer._id;
    let newDealerName = toDealerName;
    let newSubDealerId = null;
    let newSubDealerName = '';

    if (isToSubDealer) {
      newSubDealerId = toDealer._id;
      newSubDealerName = toDealerName;
      if (toDealer.parentId) {
        const parentUser = await User.findById(toDealer.parentId);
        if (parentUser) {
          newDealerId = parentUser._id;
          newDealerName = parentUser.displayName || parentUser.companyName || parentUser.username;
        }
      }
    }

    // Update Device records
    await Device.updateMany(
      { _id: { $in: matchedIds } },
      {
        $set: {
          userId: toDealer._id,
          dealerId: newDealerId,
          dealerName: newDealerName,
          subDealerId: newSubDealerId,
          subDealerName: newSubDealerName,
          assignedTo: toDealer._id,
          status: 'Stock',
          deviceStatus: 'inactive',
          updatedAt: now,
        },
        $push: {
          assignmentHistory: {
            fromUser: fromUserObjectId,
            toUser: toDealer._id,
            action: 'Transferred',
            note: notes ? `Stock moved: ${notes}` : `Moved from ${fromLabel} to ${toDealerName} via Stock Inventory`,
            changedBy: req.user._id,
            changedAt: now,
          }
        }
      }
    );

    // Sync to Product records
    try {
      await Product.updateMany(
        { imei: { $in: matchedImeis } },
        {
          $set: {
            userId: toDealer._id,
            dealerId: newDealerId,
            dealerName: newDealerName,
            subDealerId: newSubDealerId,
            subDealerName: newSubDealerName,
          }
        }
      );
    } catch (prodErr) {
      console.warn('Product move sync warning:', prodErr.message);
    }

    // Audit log
    await AuditLog.create({
      userId: req.user._id,
      action: 'STOCK_MOVED',
      ipAddress: req.ip || '',
      details: {
        fromDealerId: fromDealerId || null,
        fromDealerName: fromLabel,
        toDealerId: toDealer._id,
        toDealerName,
        count: matchedIds.length,
      }
    }).catch(e => console.error('Audit log error:', e.message));

    res.json({
      success: true,
      message: `Successfully moved ${matchedIds.length} devices to ${toDealerName}!${notFoundImeis.length > 0 ? ` (${notFoundImeis.length} IMEIs not found/skipped)` : ''}`,
      movedCount: matchedIds.length,
      movedImeis: matchedImeis,
      notFoundImeis,
      toDealerName,
      fromDealerName: fromLabel,
    });
  } catch (err) {
    console.error('Error moving stock devices:', err);
    res.status(500).json({ message: err.message || 'Failed to move stock devices.' });
  }
});

// @route   DELETE /api/stock/device/:id
// @desc    Permanently delete a stock device from inventory
// @access  Protected (Admin only)
router.delete('/device/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const device = await Device.findById(id);
    if (!device) {
      return res.status(404).json({ message: 'Device not found.' });
    }

    if (!/^stock$/i.test(String(device.status || ''))) {
      return res.status(400).json({ message: 'Only devices currently in Stock status can be deleted from Stock Inventory.' });
    }

    const imei = device.imei;
    await Device.findByIdAndDelete(device._id);

    // Sync to Product collection
    try {
      await Product.deleteMany({ imei });
    } catch (pErr) {
      console.warn('Product delete sync warning:', pErr.message);
    }

    // Audit log
    await AuditLog.create({
      userId: req.user._id,
      action: 'STOCK_DELETED',
      ipAddress: req.ip || '',
      details: {
        deviceId: device._id,
        imei,
        dealerName: device.dealerName,
        count: 1,
      }
    }).catch(e => console.error('Audit log error:', e.message));

    res.json({
      success: true,
      message: `Stock device (IMEI: ${imei}) deleted permanently from inventory.`,
      deletedImei: imei,
    });
  } catch (err) {
    console.error('Error deleting stock device:', err);
    res.status(500).json({ message: err.message || 'Failed to delete stock device.' });
  }
});

// @route   POST /api/stock/delete-devices
// @desc    Bulk delete stock devices from inventory
// @access  Protected (Admin only)
router.post('/delete-devices', async (req, res) => {
  try {
    const { deviceIds = [], imeis = [] } = req.body;

    const conditions = [];
    if (Array.isArray(deviceIds) && deviceIds.length > 0) {
      conditions.push({ _id: { $in: deviceIds.map(id => new mongoose.Types.ObjectId(id)) } });
    }
    if (Array.isArray(imeis) && imeis.length > 0) {
      conditions.push({ imei: { $in: imeis } });
    }

    if (conditions.length === 0) {
      return res.status(400).json({ message: 'Please provide deviceIds or imeis to delete.' });
    }

    const query = {
      status: { $regex: /^stock$/i },
      $or: conditions,
    };

    const devicesToDelete = await Device.find(query).select('_id imei dealerName');
    if (devicesToDelete.length === 0) {
      return res.status(404).json({ message: 'No matching stock devices found to delete.' });
    }

    const idsToDelete = devicesToDelete.map(d => d._id);
    const imeisToDelete = devicesToDelete.map(d => d.imei);

    await Device.deleteMany({ _id: { $in: idsToDelete } });

    // Sync to Product collection
    try {
      await Product.deleteMany({ imei: { $in: imeisToDelete } });
    } catch (pErr) {
      console.warn('Product bulk delete sync warning:', pErr.message);
    }

    // Audit log
    await AuditLog.create({
      userId: req.user._id,
      action: 'STOCK_DELETED',
      ipAddress: req.ip || '',
      details: {
        count: idsToDelete.length,
        imeis: imeisToDelete,
      }
    }).catch(e => console.error('Audit log error:', e.message));

    res.json({
      success: true,
      message: `Successfully deleted ${idsToDelete.length} stock device(s) permanently from inventory!`,
      deletedCount: idsToDelete.length,
      deletedImeis: imeisToDelete,
    });
  } catch (err) {
    console.error('Error bulk deleting stock devices:', err);
    res.status(500).json({ message: err.message || 'Failed to bulk delete stock devices.' });
  }
});

// @route   GET /api/stock/overview
// @desc    Get aggregate stock counts by dealer and by model, plus admin stock and transfer logs
// @access  Protected
router.get('/overview', async (req, res) => {
  try {
    await ensureBackfilledStockTransfers();

    const adminUsers = await User.find({
      $or: [
        { role: 'partner' },
        { userType: 'Administration' },
        { username: { $in: ['admin', 'ArshiEnterprises', 'arshienterprises'] } }
      ]
    }).select('_id');
    const adminIds = adminUsers.map(u => u._id);

    // 1. Admin current stock
    const adminStockCount = await Device.countDocuments({
      status: { $regex: /^stock$/i },
      $or: [
        { dealerId: { $in: adminIds } },
        { dealerName: { $regex: /admin\s*stock|arshi/i } }
      ]
    });

    // 2. Dealer allocated stock
    const dealerStockCount = await Device.countDocuments({
      status: { $regex: /^stock$/i },
      dealerId: { $nin: adminIds },
      dealerName: { $not: { $regex: /admin\s*stock|arshi/i } }
    });

    // 3. Total stock
    const totalStockCount = adminStockCount + dealerStockCount;

    // 4. Total devices in entire system (including active/processing)
    const totalDevicesCount = await Device.countDocuments();

    // 5. Target Receiver Dealers Breakdown (who got stock and how much)
    const receiverDealers = await Device.aggregate([
      {
        $match: {
          status: { $regex: /^stock$/i },
          dealerName: { $not: { $regex: /admin\s*stock|arshi/i } }
        }
      },
      {
        $group: {
          _id: '$dealerName',
          dealerId: { $first: '$dealerId' },
          dealerName: { $first: '$dealerName' },
          stockCount: { $sum: 1 },
          vendor: { $first: '$vendor' },
          lastTransferDate: { $max: '$updatedAt' },
          imeis: { $push: '$imei' }
        }
      },
      { $sort: { stockCount: -1 } }
    ]);

    const receiverDealerStats = receiverDealers.map(d => ({
      _id: d._id,
      dealerId: d.dealerId,
      dealerName: d.dealerName || 'Target Dealer',
      stockCount: d.count || d.stockCount || 0,
      vendor: d.vendor || 'iTriangle',
      lastTransferDate: d.lastTransferDate,
      sampleImeis: (d.imeis || []).slice(0, 5),
      totalImeisCount: (d.imeis || []).length,
      imeis: d.imeis || []
    }));

    // 6. Stock breakdown by Model
    const modelStats = await Device.aggregate([
      { $match: { status: { $regex: /^stock$/i } } },
      { $group: { _id: '$vendor', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // 7. Recent Transfers (last 50 batches)
    const recentTransfers = await StockTransfer.find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({
      adminStockCount,
      dealerStockCount,
      totalStockCount,
      totalDevicesCount,
      receiverDealerStats,
      modelStats,
      recentTransfers,
    });
  } catch (err) {
    console.error('Error fetching stock overview:', err);
    res.status(500).json({ message: 'Failed to fetch stock overview.' });
  }
});

// @route   GET /api/stock/transfers
// @desc    Get paginated and searchable stock transfers log
// @access  Protected
router.get('/transfers', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', dealerId } = req.query;
    const query = {};

    if (search && search.trim()) {
      const q = search.trim();
      query.$or = [
        { toUserName: { $regex: q, $options: 'i' } },
        { fromUserName: { $regex: q, $options: 'i' } },
        { notes: { $regex: q, $options: 'i' } },
        { transferId: { $regex: q, $options: 'i' } },
        { imeis: { $in: [q] } },
        { imeis: { $regex: q, $options: 'i' } }
      ];
    }

    if (dealerId && dealerId !== 'all') {
      if (dealerId === 'admin') {
        query.$or = [
          { toUserName: { $regex: /admin|arshi/i } },
          { fromUserName: { $regex: /admin|arshi/i } }
        ];
      } else if (mongoose.Types.ObjectId.isValid(dealerId)) {
        query.$or = [
          { toUserId: new mongoose.Types.ObjectId(dealerId) },
          { fromUserId: new mongoose.Types.ObjectId(dealerId) }
        ];
      }
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [transfers, total] = await Promise.all([
      StockTransfer.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      StockTransfer.countDocuments(query)
    ]);

    res.json({
      transfers,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1
    });
  } catch (err) {
    console.error('Error fetching stock transfers:', err);
    res.status(500).json({ message: 'Failed to fetch stock transfers.' });
  }
});

module.exports = router;
