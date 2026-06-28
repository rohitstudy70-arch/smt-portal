const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PaymentVerificationRequest = require('../models/PaymentVerificationRequest');
const DuePayment = require('../models/DuePayment');
const DealerDue = require('../models/DealerDue');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const RenewalRequest = require('../models/RenewalRequest');
const { protect } = require('../middleware/auth');
const { PORTAL_ROLES, requireRoles } = require('../middleware/hierarchy');
const { syncDueForUser } = require('../services/dueService');

const router = express.Router();

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '..', 'uploads', 'screenshots');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only images (jpg, jpeg, png, gif) and PDF files are allowed.'));
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Protect all routes
router.use(protect);

// Helper to check if role is Admin
const isAdminUser = (user) => {
  return user.role === 'partner' || user.userType === 'Administration';
};

// @route   POST /api/payment-verification-requests
// @desc    Create a new payment verification request
// @access  Protected (Dealer/Sub Dealer)
router.post('/', upload.single('screenshot'), async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    const { paymentMode, referenceNumber, remarks } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Valid payment amount is required.' });
    }

    if (!['Cash', 'UPI', 'NEFT', 'Bank Transfer'].includes(paymentMode)) {
      return res.status(400).json({ message: 'Valid payment mode (Cash, UPI, NEFT, Bank Transfer) is required.' });
    }

    if (!referenceNumber || !referenceNumber.trim()) {
      return res.status(400).json({ message: 'Reference number is required.' });
    }

    // Check if the reference number has already been submitted for verification
    const existingRef = await PaymentVerificationRequest.findOne({
      referenceNumber: referenceNumber.trim(),
      status: { $in: ['Pending', 'Approved'] }
    });
    if (existingRef) {
      return res.status(400).json({ message: 'A payment request with this reference number has already been submitted.' });
    }

    let screenshotUrl = '';
    if (req.file) {
      screenshotUrl = `/uploads/screenshots/${req.file.filename}`;
    } else if (paymentMode !== 'Cash') {
      // Screenshot is required for non-cash modes
      return res.status(400).json({ message: 'Payment screenshot proof is required for digital payments.' });
    }

    let paymentDate = new Date();
    if (req.body.paymentDate) {
      const parsed = new Date(req.body.paymentDate);
      if (!isNaN(parsed.getTime())) {
        paymentDate = parsed;
      }
    }

    const request = await PaymentVerificationRequest.create({
      userId: req.user._id,
      amount,
      paymentMode,
      referenceNumber: referenceNumber.trim(),
      remarks: (remarks || '').trim(),
      screenshotUrl,
      paymentDate,
      status: 'Pending'
    });

    res.status(201).json({ message: 'Payment report submitted successfully for verification.', request });
  } catch (error) {
    console.error('Submit payment verification request error:', error.message);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   GET /api/payment-verification-requests
// @desc    Get all payment verification requests (Admin sees all, Dealer sees own)
// @access  Protected
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const isAdmin = isAdminUser(req.user);

    let query = {};
    if (!isAdmin) {
      query.userId = req.user._id;
    }

    if (status && ['Pending', 'Approved', 'Rejected'].includes(status)) {
      query.status = status;
    }

    const requests = await PaymentVerificationRequest.find(query)
      .populate('userId', 'username displayName companyName mobileNo')
      .populate('verifiedBy', 'username displayName')
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    console.error('Get payment verification requests error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/payment-verification-requests/:id/verify
// @desc    Verify (approve/reject) a payment request
// @access  Protected (Admin only)
router.put('/:id/verify', requireRoles(PORTAL_ROLES.ADMIN), async (req, res) => {
  try {
    const { status, adminRemarks } = req.body;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid verification status.' });
    }

    const request = await PaymentVerificationRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Payment verification request not found.' });
    }

    if (request.status !== 'Pending') {
      return res.status(400).json({ message: 'This request has already been verified.' });
    }

    request.status = status;
    request.adminRemarks = (adminRemarks || '').trim();
    request.verifiedBy = req.user._id;
    request.verifiedAt = new Date();

    await request.save();

    if (status === 'Approved') {
      // 1. Find or create DealerDue
      let due = await DealerDue.findOne({ userId: request.userId });
      if (!due) {
        due = await syncDueForUser(request.userId);
      }

      // 2. Map payment mode
      let mappedMode = 'Bank Transfer';
      if (request.paymentMode === 'Cash') mappedMode = 'Cash';
      if (request.paymentMode === 'UPI') mappedMode = 'UPI';

      const verifiedAtDate = request.paymentDate || new Date();

      // Find all unpaid or partially paid renewal requests for the user
      const unpaidRenewals = await RenewalRequest.find({
        dealerId: request.userId,
        status: { $ne: 'Rejected' },
        paymentStatus: { $ne: 'Paid' },
      }).sort({ renewalDate: 1 }); // Oldest first

      let remainingAmount = request.amount;

      for (const renewal of unpaidRenewals) {
        if (remainingAmount <= 0) break;

        const billAmt = Number(renewal.billAmount) || 0;
        const currentReceived = Number(renewal.receivedAmount) || 0;
        const currentRemaining = Math.max(billAmt - currentReceived, 0);

        if (currentRemaining <= 0) continue;

        const appliedAmount = Math.min(remainingAmount, currentRemaining);
        
        renewal.receivedAmount = currentReceived + appliedAmount;
        renewal.status = 'Approved';
        renewal.paymentDate = verifiedAtDate;
        renewal.transactionId = request.referenceNumber;
        
        if (request.remarks) {
          renewal.remarks = (renewal.remarks ? `${renewal.remarks} | ` : '') + `Verification Ref: ${request.remarks}`;
        } else {
          renewal.remarks = (renewal.remarks ? `${renewal.remarks} | ` : '') + `Verification Ref: ${request.referenceNumber}`;
        }
        
        await renewal.save();
        remainingAmount -= appliedAmount;
      }

      // 3. Create DuePayment (only if there is remainingAmount left)
      if (remainingAmount > 0) {
        await DuePayment.create({
          dealerDueId: due._id,
          userId: request.userId,
          amount: remainingAmount,
          paymentDate: verifiedAtDate,
          paymentMode: mappedMode,
          referenceNumber: request.referenceNumber,
          remarks: request.remarks ? `Reported: ${request.remarks}` : 'Approved payment verification request',
          screenshotUrl: request.screenshotUrl,
          updatedBy: req.user._id,
        });
      }

      // 4. Sync outstanding dues
      await syncDueForUser(request.userId);

      // 5. Log Audit Log
      const dealer = await User.findById(request.userId);
      await AuditLog.create({
        userId: req.user._id,
        action: 'DUE_PAYMENT_VERIFIED_AND_APPROVED',
        ipAddress: req.ip || '',
        details: {
          requestId: request._id,
          targetUserId: request.userId,
          targetName: dealer ? (dealer.displayName || dealer.username) : 'Dealer',
          amount: request.amount,
          paymentMode: request.paymentMode,
          referenceNumber: request.referenceNumber,
          adminRemarks: request.adminRemarks,
        },
      }).catch((err) => console.error('Audit log error:', err.message));
    } else {
      // Log Audit Log for rejection
      const dealer = await User.findById(request.userId);
      await AuditLog.create({
        userId: req.user._id,
        action: 'DUE_PAYMENT_VERIFIED_AND_REJECTED',
        ipAddress: req.ip || '',
        details: {
          requestId: request._id,
          targetUserId: request.userId,
          targetName: dealer ? (dealer.displayName || dealer.username) : 'Dealer',
          amount: request.amount,
          paymentMode: request.paymentMode,
          referenceNumber: request.referenceNumber,
          adminRemarks: request.adminRemarks,
        },
      }).catch((err) => console.error('Audit log error:', err.message));
    }

    res.json({ message: `Payment request ${status.toLowerCase()} successfully.`, request });
  } catch (error) {
    console.error('Verify payment request error:', error.message);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

module.exports = router;
