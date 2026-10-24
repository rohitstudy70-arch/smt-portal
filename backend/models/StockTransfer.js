const mongoose = require('mongoose');

const stockTransferSchema = new mongoose.Schema(
  {
    transferId: {
      type: String,
      unique: true,
      index: true,
    },
    action: {
      type: String,
      enum: ['STOCK_ADDED', 'STOCK_TRANSFERRED'],
      default: 'STOCK_TRANSFERRED',
    },
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    fromUserName: {
      type: String,
      default: 'Admin Stock (Arshi Enterprises)',
    },
    toUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    toUserName: {
      type: String,
      required: true,
    },
    vendor: {
      type: String,
      default: 'iTriangle',
    },
    count: {
      type: Number,
      required: true,
    },
    imeis: {
      type: [String],
      default: [],
    },
    notes: {
      type: String,
      default: '',
    },
    transferredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    transferredByName: {
      type: String,
      default: 'Admin',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StockTransfer', stockTransferSchema);
