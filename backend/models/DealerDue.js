const mongoose = require('mongoose');

const dealerDueSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  parentDealerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  accountType: {
    type: String,
    enum: ['Dealer', 'Sub Dealer'],
    default: 'Dealer',
  },
  dealerName: {
    type: String,
    default: '',
  },
  dealerCode: {
    type: String,
    default: '',
  },
  totalDevicesAssigned: {
    type: Number,
    default: 0,
  },
  totalBillAmount: {
    type: Number,
    default: 0,
  },
  totalPaidAmount: {
    type: Number,
    default: 0,
  },
  currentDue: {
    type: Number,
    default: 0,
  },
  lastPaymentDate: {
    type: Date,
    default: null,
  },
  oldestPendingDate: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ['Clear', 'Partial', 'Overdue'],
    default: 'Clear',
  },
  lastSyncedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

dealerDueSchema.index({ accountType: 1 });
dealerDueSchema.index({ status: 1 });
dealerDueSchema.index({ currentDue: -1 });

module.exports = mongoose.model('DealerDue', dealerDueSchema);
