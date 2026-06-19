const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  transactionId: {
    type: String,
    required: true,
    unique: true,
  },
  paymentId: {
    type: String,
    default: '',
  },
  paymentFor: {
    type: String,
    required: true,
  },
  referenceNo: {
    type: String,
    default: '',
  },
  payMode: {
    type: String,
    default: 'Itwallet',
  },
  transactionType: {
    type: String,
    enum: ['Debit', 'Credit'],
    required: true,
  },
  status: {
    type: String,
    default: 'Success',
  },
  remarks: {
    type: String,
    default: '',
  },
  maxDays: {
    type: String,
    default: '-',
  },
  requestedAmt: {
    type: String,
    default: '-',
  },
  transactedAmt: {
    type: Number,
    required: true,
  },
  deviceName: {
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
  serialNo: {
    type: String,
    default: '',
  },
  balanceAfterTransaction: {
    type: Number,
    default: 0,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Transaction', transactionSchema);
