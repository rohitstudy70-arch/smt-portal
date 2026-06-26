const Device = require('../models/Device');
const Product = require('../models/Product');

const normalizeValidity = (value) => {
  const normalized = String(value || '1 Year').trim().toLowerCase();
  if (normalized === '2 year' || normalized === '2 years') return '2 Year';
  if (normalized === '3 year' || normalized === '3 years') return '3 Year';
  return '1 Year';
};

const syncDevicesToProducts = async () => {
  try {
    console.log('🔄 [Migration] Checking sync from Devices to Products...');
    const devices = await Device.find({});
    let createdCount = 0;
    
    for (const device of devices) {
      // Find if a product with the same IMEI exists
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
          vehicleNumber: '',
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
      }
    }
    
    if (createdCount > 0) {
      console.log(`✅ [Migration] Synced ${createdCount} new devices to Products collection.`);
    } else {
      console.log('✅ [Migration] Devices and Products are already fully synchronized.');
    }
  } catch (error) {
    console.error('❌ [Migration] Error syncing devices to products:', error.message);
  }
};

module.exports = syncDevicesToProducts;
