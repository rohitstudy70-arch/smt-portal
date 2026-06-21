const mongoose = require('mongoose');

const paymentVerificationRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 1,
  },
  paymentMode: {
    type: String,
    enum: ['Cash', 'UPI', 'NEFT', 'Bank Transfer'],
    required: true,
  },
  referenceNumber: {
    type: String,
    required: true,
    trim: true,
  },
  screenshotUrl: {
    type: String,
    default: '',
  },
  remarks: {
    type: String,
    default: '',
    trim: true,
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
  },
  adminRemarks: {
    type: String,
    default: '',
    trim: true,
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  verifiedAt: {
    type: Date,
    default: null,
  },
  paymentDate: {
    type: Date,
  }
}, {
  timestamps: true,
});

paymentVerificationRequestSchema.index({ userId: 1, createdAt: -1 });
paymentVerificationRequestSchema.index({ status: 1 });

module.exports = mongoose.model('PaymentVerificationRequest', paymentVerificationRequestSchema);
