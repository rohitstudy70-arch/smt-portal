const mongoose = require('mongoose');

const duePaymentSchema = new mongoose.Schema({
  dealerDueId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DealerDue',
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  paymentDate: {
    type: Date,
    default: Date.now,
  },
  paymentMode: {
    type: String,
    enum: ['Cash', 'UPI', 'Bank Transfer'],
    required: true,
  },
  referenceNumber: {
    type: String,
    default: '',
    trim: true,
  },
  remarks: {
    type: String,
    default: '',
    trim: true,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, {
  timestamps: true,
});

duePaymentSchema.index({ userId: 1, paymentDate: -1 });
duePaymentSchema.index({ dealerDueId: 1, paymentDate: -1 });

module.exports = mongoose.model('DuePayment', duePaymentSchema);
