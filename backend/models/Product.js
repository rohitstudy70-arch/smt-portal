const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  dealerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  dealerName: {
    type: String,
    default: '',
    trim: true,
  },
  subDealerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  subDealerName: {
    type: String,
    default: '',
    trim: true,
  },
  vendor: {
    type: String,
    default: 'iTriangle',
    trim: true,
  },
  productDescription: {
    type: String,
    enum: ['VLTD', 'GPS', 'Renewal', 'VLTD RENEWAL', 'GPS RENEWAL'],
    default: 'VLTD',
  },
  existingDeviceSearch: {
    type: String,
    default: '',
    trim: true,
  },
  imei: {
    type: String,
    default: '',
    trim: true,
  },
  serialNo: {
    type: String,
    default: '',
    trim: true,
  },
  iccid: {
    type: String,
    default: '',
    trim: true,
  },
  msisdn1: {
    type: String,
    default: '',
    trim: true,
  },
  msisdn2: {
    type: String,
    default: '',
    trim: true,
  },
  itrNo: {
    type: String,
    default: '',
    trim: true,
  },
  vehicleNumber: {
    type: String,
    default: '',
    trim: true,
  },
  validity: {
    type: String,
    enum: ['1 Year', '2 Year', '2 Years', '3 Year', '3 Years'],
    default: '1 Year',
  },
  activationDate: {
    type: Date,
    default: null,
  },
  renewalDate: {
    type: Date,
    default: null,
  },
  expiryDate: {
    type: Date,
    default: null,
  },
  newExpiryDate: {
    type: Date,
    default: null,
  },
  billAmount: {
    type: Number,
    default: 0,
  },
  ledgerTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    default: null,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  createdByRole: {
    type: String,
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

productSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

productSchema.index({ dealerId: 1 });
productSchema.index({ userId: 1 });
productSchema.index({ createdBy: 1 });
productSchema.index({ productDescription: 1 });
productSchema.index({ imei: 1 });
productSchema.index({ vehicleNumber: 1 });

module.exports = mongoose.model('Product', productSchema);
