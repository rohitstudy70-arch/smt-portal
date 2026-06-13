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
    enum: ['Commercial Plan', 'Top-up'],
  },
  plan: {
    type: String,
    enum: ['1 Month', '1 Year', '2 Years'],
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
});

module.exports = mongoose.model('ActivationRequest', activationRequestSchema);
