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
  dealerCode: {
    type: String,
    default: '',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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
  activationType: {
    type: String,
    enum: ['NIC', 'MINING', ''],
    default: '',
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
  receivedAmount: {
    type: Number,
    default: 0,
  },
  remainingDue: {
    type: Number,
    default: 0,
  },
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Partially Paid', 'Paid', 'Cancelled'],
    default: 'Pending',
  },
  transactionId: {
    type: String,
    default: '',
  },
  paymentDate: {
    type: Date,
    default: null,
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
  this.remainingDue = (this.billAmount || 0) - (this.receivedAmount || 0);
  if (this.remainingDue <= 0) {
    this.paymentStatus = 'Paid';
  } else if ((this.receivedAmount || 0) > 0) {
    this.paymentStatus = 'Partially Paid';
  } else {
    this.paymentStatus = 'Pending';
  }
  next();
});

module.exports = mongoose.model('RenewalRequest', renewalRequestSchema);
