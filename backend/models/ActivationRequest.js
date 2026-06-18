const mongoose = require('mongoose');

const activationRequestSchema = new mongoose.Schema({
  requestId: {
    type: String,
    required: true,
    unique: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  isSubDealer: {
    type: Boolean,
    default: false,
  },
  subDealerName: {
    type: String,
    default: '',
  },
  dateTime: {
    type: Date,
    default: Date.now,
  },
  quantity: {
    type: Number,
    required: true,
  },
  requestType: {
    type: String,
    enum: ['Commercial Plan', 'Top-up', 'Recharge Plan'],
  },
  plan: {
    type: String,
    enum: ['1 Month', '1 Year', '2 Years', 'recharge NIC', 'RENEWAL MINING'],
  },
  piNo: {
    type: String,
    default: '',
  },
  amount: {
    type: Number,
    required: true,
  },
  remarks: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['Requested', 'Processing', 'Completed', 'Rejected'],
    default: 'Requested',
  },

  // --- Activation Form Fields ---
  // Auto-set from device
  dealerName: { type: String, default: '' },
  dealerAddress: { type: String, default: '' },
  imei: { type: String, default: '' },
  iccid: { type: String, default: '' },
  serialNo: { type: String, default: '' },
  msisdn1: { type: String, default: '' },
  msisdn2: { type: String, default: '' },
  validity: { type: String, default: '' },
  expiryDate: { type: Date, default: null },
  itrNo: { type: String, default: '' },
  vendor: { type: String, default: '' },

  // Date fields
  installationDate: { type: Date, default: null },

  // Dropdowns
  activationMode: { type: String, default: '' },     // NIC / Mining
  vehicleCondition: { type: String, default: '' },   // Old / New
  vehicleMake: { type: String, default: '' },
  vehicleModel: { type: String, default: '' },
  registrationYear: { type: String, default: '' },

  // Manual fill
  vehicleNo: { type: String, default: '' },
  rto: { type: String, default: '' },
  engineNo: { type: String, default: '' },
  chassisNo: { type: String, default: '' },
  regMobNo: { type: String, default: '' },
  regMobNo2: { type: String, default: '' },
  customerName: { type: String, default: '' },
  aadharNo: { type: String, default: '' },
  address: { type: String, default: '' },
});

module.exports = mongoose.model('ActivationRequest', activationRequestSchema);
