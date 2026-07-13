const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Device = require('../models/Device');
const AuditLog = require('../models/AuditLog');
const { protect } = require('../middleware/auth');
const { requireRoles, attachHierarchyScope, buildDeviceScopeQuery } = require('../middleware/hierarchy');

const router = express.Router();

// Ensure upload directory exists
const storageDir = path.join(__dirname, '../storage/documents');
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, storageDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${req.params.imei}-${req.body.documentType || 'Other'}-${uniqueSuffix}${ext}`);
  }
});

// Multer File Filter
const fileFilter = (req, file, cb) => {
  const allowedMimetypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
  if (allowedMimetypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, JPEG, PNG, and PDF files are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB limit
});

// Helper to audit log doc actions
const logDocAction = async (req, imei, action, docDetails) => {
  try {
    let vehicleNumber = '';
    let dealerId = null;

    // Find device to extract dealer / vehicle info for logging
    const device = await Device.findOne({ imei });
    if (device) {
      dealerId = device.dealerId;
    }

    await AuditLog.create({
      userId: req.user._id,
      action,
      ipAddress: req.ip || '',
      details: {
        imei,
        vehicleNumber,
        dealerId,
        ...docDetails
      }
    });
  } catch (error) {
    console.error('Audit logging failed for document:', error.message);
  }
};

// Middleware stack for all routes
router.use(protect, attachHierarchyScope);

// Helper to check device access based on role
const getDeviceWithAccess = async (imei, req) => {
  if (req.portalRole === 'ADMIN') {
    return await Device.findOne({ imei });
  }
  const scopeQuery = buildDeviceScopeQuery(req.hierarchyScope);
  return await Device.findOne({ imei, ...scopeQuery });
};

// @route   POST /api/devices/:imei/documents
// @desc    Upload document(s) for a device
// @access  Protected (Admin only)
router.post(
  '/:imei/documents',
  requireRoles('ADMIN'),
  (req, res, next) => {
    upload.array('files', 10)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'File size limit exceeded. Max 10MB per file.' });
        }
        return res.status(400).json({ message: err.message });
      } else if (err) {
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const { imei } = req.params;
      const { documentType } = req.body;

      if (!documentType) {
        return res.status(400).json({ message: 'Document type is required.' });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'Please select at least one file to upload.' });
      }

      let device = await Device.findOne({ imei });
      if (!device) {
        // Create placeholder device if not found
        device = new Device({
          userId: req.user._id,
          imei,
          serialNo: imei,
          status: 'Activated',
          deviceStatus: 'active'
        });
      }

      const newDocs = [];
      for (const file of req.files) {
        const docId = new mongoose.Types.ObjectId();
        const doc = {
          _id: docId,
          documentType,
          fileName: file.filename,
          originalName: file.originalname,
          fileUrl: `/api/devices/${imei}/documents/${docId}/preview`,
          mimeType: file.mimetype,
          fileSize: file.size,
          uploadedBy: req.user._id,
          uploadedAt: new Date()
        };
        device.documents.push(doc);
        newDocs.push(doc);

        await logDocAction(req, imei, 'DOCUMENT_UPLOADED', {
          documentId: docId,
          documentType,
          originalName: file.originalname,
          fileSize: file.size
        });
      }

      await device.save();
      res.status(201).json({ message: 'Document(s) uploaded successfully.', documents: device.documents });
    } catch (error) {
      console.error('Upload document error:', error.message);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// @route   PUT /api/devices/:imei/documents/:docId
// @desc    Replace an existing document
// @access  Protected (Admin only)
router.put(
  '/:imei/documents/:docId',
  requireRoles('ADMIN'),
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'File size limit exceeded. Max 10MB.' });
        }
        return res.status(400).json({ message: err.message });
      } else if (err) {
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const { imei, docId } = req.params;

      if (!req.file) {
        return res.status(400).json({ message: 'Please select a replacement file.' });
      }

      const device = await Device.findOne({ imei });
      if (!device) {
        return res.status(404).json({ message: 'Device not found.' });
      }

      const doc = device.documents.id(docId);
      if (!doc) {
        return res.status(404).json({ message: 'Document not found.' });
      }

      // Delete old physical file if it exists
      const oldPath = path.join(storageDir, doc.fileName);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }

      // Update document properties
      doc.fileName = req.file.filename;
      doc.originalName = req.file.originalname;
      doc.mimeType = req.file.mimetype;
      doc.fileSize = req.file.size;
      doc.uploadedBy = req.user._id;
      doc.uploadedAt = new Date();

      await device.save();

      await logDocAction(req, imei, 'DOCUMENT_REPLACED', {
        documentId: docId,
        documentType: doc.documentType,
        originalName: req.file.originalname,
        fileSize: req.file.size
      });

      res.json({ message: 'Document replaced successfully.', documents: device.documents });
    } catch (error) {
      console.error('Replace document error:', error.message);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// @route   DELETE /api/devices/:imei/documents/:docId
// @desc    Delete a document
// @access  Protected (Admin only)
router.delete(
  '/:imei/documents/:docId',
  requireRoles('ADMIN'),
  async (req, res) => {
    try {
      const { imei, docId } = req.params;

      const device = await Device.findOne({ imei });
      if (!device) {
        return res.status(404).json({ message: 'Device not found.' });
      }

      const doc = device.documents.id(docId);
      if (!doc) {
        return res.status(404).json({ message: 'Document not found.' });
      }

      // Delete physical file
      const filePath = path.join(storageDir, doc.fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      const originalName = doc.originalName;
      const documentType = doc.documentType;

      // Remove subdocument
      device.documents.pull(docId);
      await device.save();

      await logDocAction(req, imei, 'DOCUMENT_DELETED', {
        documentId: docId,
        documentType,
        originalName
      });

      res.json({ message: 'Document deleted successfully.', documents: device.documents });
    } catch (error) {
      console.error('Delete document error:', error.message);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// @route   GET /api/devices/:imei/documents/:docId/download
// @desc    Securely download a document
// @access  Protected (Admin, Dealer, Sub-Dealer)
router.get(
  '/:imei/documents/:docId/download',
  async (req, res) => {
    try {
      const { imei, docId } = req.params;

      const device = await getDeviceWithAccess(imei, req);
      if (!device) {
        return res.status(403).json({ message: 'Forbidden: You do not have access to this device.' });
      }

      const doc = device.documents.id(docId);
      if (!doc) {
        return res.status(404).json({ message: 'Document not found.' });
      }

      const filePath = path.join(storageDir, doc.fileName);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: 'Physical file not found on server.' });
      }

      res.download(filePath, doc.originalName);
    } catch (error) {
      console.error('Download document error:', error.message);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// @route   GET /api/devices/:imei/documents/:docId/preview
// @desc    Securely preview/stream a document inline
// @access  Protected (Admin, Dealer, Sub-Dealer)
router.get(
  '/:imei/documents/:docId/preview',
  async (req, res) => {
    try {
      const { imei, docId } = req.params;

      const device = await getDeviceWithAccess(imei, req);
      if (!device) {
        return res.status(403).json({ message: 'Forbidden: You do not have access to this device.' });
      }

      const doc = device.documents.id(docId);
      if (!doc) {
        return res.status(404).json({ message: 'Document not found.' });
      }

      const filePath = path.join(storageDir, doc.fileName);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: 'Physical file not found on server.' });
      }

      // Serve inline with proper content-type
      res.setHeader('Content-Type', doc.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.originalName)}"`);
      res.sendFile(filePath);
    } catch (error) {
      console.error('Preview document error:', error.message);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

module.exports = router;
