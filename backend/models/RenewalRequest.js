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
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  deviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    default: null,
  },
  imei: {
    type: String,
    required: true,
  },
  customerName: {
    type: String,
    default: '',
  },
  dealerName: {
    type: String,
    default: '',
  },
  validity: {
    type: String,
    enum: ['1 Year', '2 Years'],
    default: '1 Year',
  },
  currentExpiryDate: {
    type: Date,
    default: null,
  },
  requestedExpiryDate: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ['Requested', 'Processing', 'Completed', 'Rejected'],
    default: 'Requested',
  },
  remarks: {
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
