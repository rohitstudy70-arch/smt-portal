const Device = require('../models/Device');
const Product = require('../models/Product');
const ActivationRequest = require('../models/ActivationRequest');
const RenewalRequest = require('../models/RenewalRequest');

const normalizeValidity = (value) => {
  const normalized = String(value || '1 Year').trim().toLowerCase();
  if (normalized === '2 year' || normalized === '2 years') return '2 Year';
  if (normalized === '3 year' || normalized === '3 years') return '3 Year';
  return '1 Year';
};

const syncDevicesToProducts = async () => {
  try {
    console.log('🔄 [Migration] Checking sync from Devices to Products & Vehicle Numbers...');
    const devices = await Device.find({});
    let createdCount = 0;
    let vehicleSyncCount = 0;

    // Build lookup maps from ActivationRequests, RenewalRequests, and Products
    const activations = await ActivationRequest.find({ imei: { $exists: true, $ne: '' } }).sort({ dateTime: -1 }).lean();
    const renewals = await RenewalRequest.find({ imei: { $exists: true, $ne: '' } }).sort({ createdAt: -1 }).lean();

    const activationMap = {};
    for (const act of activations) {
      if (act.imei && !activationMap[act.imei]) {
        activationMap[act.imei] = act;
      }
    }

    const renewalMap = {};
    for (const ren of renewals) {
      if (ren.imei && !renewalMap[ren.imei]) {
        renewalMap[ren.imei] = ren;
      }
    }

    for (const device of devices) {
      // 1. Sync vehicleNo/customerName/customerMobile onto Device if missing
      const act = activationMap[device.imei];
      const ren = renewalMap[device.imei];
      
      const vNo = (act?.vehicleNo || ren?.vehicleNumber || '').trim();
      const cName = (act?.customerName || ren?.customerName || '').trim();
      const cMob = (act?.regMobNo || ren?.customerMobile || '').trim();

      let deviceUpdated = false;
      if (vNo && (!device.vehicleNo || device.vehicleNo !== vNo)) {
        device.vehicleNo = vNo;
        device.vehicleNumber = vNo;
        deviceUpdated = true;
      }
      if (cName && (!device.customerName || device.customerName !== cName)) {
        device.customerName = cName;
        deviceUpdated = true;
      }
      if (cMob && (!device.customerMobile || device.customerMobile !== cMob)) {
        device.customerMobile = cMob;
        deviceUpdated = true;
      }

      if (deviceUpdated) {
        await device.save();
        vehicleSyncCount++;
      }

      // 2. Find if a product with the same IMEI exists
      const existingProduct = await Product.findOne({ imei: device.imei });
      if (!existingProduct) {
        await Product.create({
          userId: device.userId,
          dealerId: device.dealerId,
          dealerName: device.dealerName,
          subDealerId: device.subDealerId,
          subDealerName: device.subDealerName,
          vendor: device.vendor || 'iTriangle',
          productDescription: device.deviceType === 'GPS' ? 'GPS' : 'VLTD',
          existingDeviceSearch: '',
          imei: device.imei,
          serialNo: device.serialNo,
          iccid: device.iccid,
          msisdn1: device.msisdn1,
          msisdn2: device.msisdn2,
          itrNo: device.itrNo,
          vehicleNumber: device.vehicleNo || vNo || '',
          validity: normalizeValidity(device.validity),
          activationDate: device.presentDate,
          renewalDate: null,
          expiryDate: device.expiryDate,
          newExpiryDate: null,
          billAmount: device.billAmount || 0,
          createdBy: device.createdBy,
          createdByRole: device.createdByRole || 'ADMIN',
          createdAt: device.createdAt,
          updatedAt: device.updatedAt || device.createdAt,
        });
        createdCount++;
      } else if (vNo && !existingProduct.vehicleNumber) {
        existingProduct.vehicleNumber = vNo;
        await existingProduct.save();
      }
    }
    
    if (createdCount > 0 || vehicleSyncCount > 0) {
      console.log(`✅ [Migration] Synced ${createdCount} new devices to Products, and updated vehicle info for ${vehicleSyncCount} devices.`);
    } else {
      console.log('✅ [Migration] Devices and Products are already fully synchronized.');
    }
  } catch (error) {
    console.error('❌ [Migration] Error syncing devices to products:', error.message);
  }
};

module.exports = syncDevicesToProducts;
