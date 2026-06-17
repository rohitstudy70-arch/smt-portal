const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
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
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  vehicleType: {
    type: String,
    default: '',
  },
  validity: {
    type: String,
    default: '',
  },
  imei: {
    type: String,
    default: '',
  },
  iccid: {
    type: String,
    default: '',
  },
  isSubDealer: {
    type: Boolean,
    default: false,
  },
  subDealerName: {
    type: String,
    default: '',
  },
  piNo: {
    type: String,
    default: '',
  },
  piValue: {
    type: Number,
    default: 0,
  },
  invoiceNo: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['Pending', 'Processing', 'Completed', 'Rejected'],
    default: 'Pending',
  },
  dateTime: {
    type: Date,
    default: Date.now,
  },
  engineNo: {
    type: String,
    default: '',
  },
  chassisNo: {
    type: String,
    default: '',
  },
  vehicleTypeOldNew: {
    type: String,
    default: '',
  },
  vehicleMake: {
    type: String,
    default: '',
  },
  vehicleModel: {
    type: String,
    default: '',
  },
  endCustomerName: {
    type: String,
    default: '',
  },
  rmn: {
    type: String,
    default: '',
  },
  rtoState: {
    type: String,
    default: '',
  },
  rtoNo: {
    type: String,
    default: '',
  },
  address: {
    type: String,
    default: '',
  },
  proofOfAddress: {
    type: String,
    default: '',
  },
  poaNo: {
    type: String,
    default: '',
  },
  proofOfIdentity: {
    type: String,
    default: '',
  },
  poiNo: {
    type: String,
    default: '',
  },
  vehicleNo: {
    type: String,
    default: '',
  },
  items: [
    {
      description: { type: String, default: '' },
      validity: { type: String, default: '' },
      unitPrice: { type: Number, default: 0 },
      cgst: { type: Number, default: 0 },
      sgst: { type: Number, default: 0 },
      priceWithGst: { type: Number, default: 0 },
      qty: { type: Number, default: 1 },
      grossAmt: { type: Number, default: 0 },
    },
  ],
});

module.exports = mongoose.model('Invoice', invoiceSchema);
