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
  customerState: {
    type: String,
    default: 'Bihar',
  },
  dealerState: {
    type: String,
    default: 'Bihar',
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
  dealerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  imeiList: [{ type: String }],
  notes: {
    type: String,
    default: '',
  },
  invoiceType: {
    type: String,
    enum: ['Single', 'DealerConsolidated'],
    default: 'Single',
  },
  items: [
    {
      description: { type: String, default: '' },
      category: { type: String, default: '' }, // '2-Year Activation', '1-Year Activation', 'Top-up / Recharge', 'Renewal', etc.
      validity: { type: String, default: '' },
      unitPrice: { type: Number, default: 0 },
      cgst: { type: Number, default: 0 },
      sgst: { type: Number, default: 0 },
      igst: { type: Number, default: 0 },
      priceWithGst: { type: Number, default: 0 },
      qty: { type: Number, default: 1 },
      grossAmt: { type: Number, default: 0 },
      imeis: [{ type: mongoose.Schema.Types.Mixed }],
    },
  ],
});

module.exports = mongoose.model('Invoice', invoiceSchema);
