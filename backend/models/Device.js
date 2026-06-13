const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  imei: {
    type: String,
    required: true,
  },
  serialNo: {
    type: String,
    required: true,
  },
  iccid: {
    type: String,
    default: '',
  },
  hasSim: {
    type: Boolean,
    default: false,
  },
  isTaisys: {
    type: Boolean,
    default: false,
  },
  simExpiryDate: {
    type: Date,
    default: null,
  },
  commonLayer: {
    type: String,
    default: '',
  },
  clExpiryDate: {
    type: Date,
    default: null,
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  vendor: {
    type: String,
    default: 'Taisys',
  },
  deviceType: {
    type: String,
    default: 'Esim',
  },
  deviceName: {
    type: String,
    default: 'Aquila Track Bharat 101 With IRNSS',
  },
  msisdn1: {
    type: String,
    default: '',
  },
  tsp1: {
    type: String,
    default: 'Airtel',
  },
  msisdn2: {
    type: String,
    default: '',
  },
  tsp2: {
    type: String,
    default: 'BSNL',
  },
  status: {
    type: String,
    default: 'Activated',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Device', deviceSchema);
