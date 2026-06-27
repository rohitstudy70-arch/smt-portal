const mongoose = require('mongoose');

const renewalRequestSchema = new mongoose.Schema({
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
  dealerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  dealerName: {
    type: String,
    required: true,
  },
  customerName: {
    type: String,
    required: true,
  },
  customerMobile: {
    type: String,
    required: true,
  },
  imei: {
    type: String,
    required: true,
  },
  vehicleNumber: {
    type: String,
    required: true,
  },
  deviceModel: {
    type: String,
    required: true,
  },
  productDescription: {
    type: String,
    required: true,
  },
  validity: {
    type: String,
    enum: ['1 Year', '2 Years'],
    required: true,
    default: '1 Year',
  },
  renewalDate: {
    type: Date,
    required: true,
    default: Date.now,
  },
  newExpiryDate: {
    type: Date,
    required: true,
  },
  billAmount: {
    type: Number,
    required: true,
  },
  paymentMode: {
    type: String,
    enum: ['Cash', 'UPI', 'Bank Transfer', 'Cheque', ''],
    default: '',
  },
  remarks: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['Requested', 'Under Review', 'Approved', 'Activated', 'Completed', 'Rejected'],
    default: 'Requested',
  },
  screenshotUrl: {
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

renewalRequestSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('RenewalRequest', renewalRequestSchema);
