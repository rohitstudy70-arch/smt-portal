const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
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
  subDealerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  imei: {
    type: String,
    required: true,
    trim: true,
  },
  imeiNumber: {
    type: String,
    trim: true,
  },
  serialNo: {
    type: String,
    trim: true,
  },
  serialNumber: {
    type: String,
    trim: true,
  },
  iccid: {
    type: String,
    trim: true,
  },
  iccidNumber: {
    type: String,
    trim: true,
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
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  assignmentHistory: [
    {
      fromUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      toUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      action: {
        type: String,
        enum: ['Assigned', 'Transferred', 'Unassigned'],
        default: 'Assigned',
      },
      note: {
        type: String,
        default: '',
      },
      changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      changedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  vendor: {
    type: String,
    default: '',
  },
  deviceType: {
    type: String,
    default: 'Esim',
  },
  deviceName: {
    type: String,
    default: 'Aquila Track Bharat 101 With IRNSS',
  },
  trackingId: {
    type: String,
    default: '',
    trim: true,
  },
  software: {
    type: String,
    default: '',
    trim: true,
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
  itrNo: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    default: 'Activated',
  },
  dealerName: {
    type: String,
    default: '',
  },
  subDealerName: {
    type: String,
    default: '',
  },
  validity: {
    type: String,
    enum: ['1 Year', '2 Years'],
    default: '1 Year',
  },
  presentDate: {
    type: Date,
    default: Date.now,
  },
  expiryDate: {
    type: Date,
    default: null,
  },
  billAmount: {
    type: Number,
    default: 0,
  },
  renewalAmount: {
    type: Number,
    default: 0,
  },
  claSyAmount: {
    type: Number,
    default: 0,
  },
  claSyCharges: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  createdByRole: {
    type: String,
    default: '',
  },
  activationRequestStatus: {
    type: String,
    enum: ['none', 'processing', 'active', 'rejected'],
    default: 'none',
  },
  deviceStatus: {
    type: String,
    enum: ['inactive', 'active'],
    default: 'inactive',
  },
  activationDate: {
    type: Date,
    default: null,
  },
  documents: [
    {
      documentType: {
        type: String,
        required: true,
      },
      fileName: {
        type: String,
        required: true,
      },
      originalName: {
        type: String,
        required: true,
      },
      fileUrl: {
        type: String,
        required: true,
      },
      mimeType: {
        type: String,
        required: true,
      },
      fileSize: {
        type: Number,
        required: true,
      },
      uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  kycDocuments: [
    {
      documentType: {
        type: String,
        required: true,
      },
      fileName: {
        type: String,
        required: true,
      },
      originalName: {
        type: String,
        required: true,
      },
      fileUrl: {
        type: String,
        required: true,
      },
      mimeType: {
        type: String,
        required: true,
      },
      fileSize: {
        type: Number,
        required: true,
      },
      uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

deviceSchema.pre('validate', function (next) {
  this.imei = this.imei || this.imeiNumber;
  this.imeiNumber = this.imeiNumber || this.imei;

  const rawIccid = (this.iccid || this.iccidNumber || '').toString().trim();
  if (rawIccid) {
    this.iccid = rawIccid;
    this.iccidNumber = rawIccid;
  } else {
    this.iccid = undefined;
    this.iccidNumber = undefined;
  }

  const rawSerial = (this.serialNo || this.serialNumber || '').toString().trim();
  if (rawSerial) {
    this.serialNo = rawSerial;
    this.serialNumber = rawSerial;
  } else {
    this.serialNo = undefined;
    this.serialNumber = undefined;
  }

  next();
});

deviceSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

deviceSchema.index({ imei: 1 }, { unique: true, sparse: true });
deviceSchema.index(
  { iccid: 1 },
  { unique: true, partialFilterExpression: { iccid: { $type: 'string', $gt: '' } } }
);
deviceSchema.index(
  { serialNo: 1 },
  { unique: true, partialFilterExpression: { serialNo: { $type: 'string', $gt: '' } } }
);
deviceSchema.index({ dealerId: 1 });
deviceSchema.index({ subDealerId: 1 });
deviceSchema.index({ createdBy: 1 });
deviceSchema.index({ dealerId: 1, subDealerId: 1, status: 1 });
deviceSchema.index({ expiryDate: 1, status: 1 });

module.exports = mongoose.model('Device', deviceSchema);
