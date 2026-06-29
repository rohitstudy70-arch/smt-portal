const express = require('express');
const { protect } = require('../middleware/auth');
const { requireRoles, attachHierarchyScope } = require('../middleware/hierarchy');

const router = express.Router();

router.use(protect, attachHierarchyScope);

// Only ADMIN and SUB_DEALER roles are allowed
router.get(
  '/',
  requireRoles('ADMIN', 'SUB_DEALER'),
  (req, res) => {
    res.json({
      success: true,
      certificates: [
        { id: 1, imei: '350000000000001', type: 'BSNL Activation Certificate', approvedDate: '2026-05-15', expiryDate: '2027-05-15', status: 'Approved' },
        { id: 2, imei: '350000000000002', type: 'Airtel M2M Certificate', approvedDate: '2026-04-10', expiryDate: '2028-04-10', status: 'Approved' },
        { id: 3, imei: '350000000000003', type: 'iTriangle ARAI Compliance', approvedDate: '2026-03-22', expiryDate: '2027-03-22', status: 'Approved' },
        { id: 4, imei: '350000000000004', type: 'ARAI Conformity Certificate', approvedDate: '2026-02-18', expiryDate: '2027-02-18', status: 'Approved' },
        { id: 5, imei: '350000000000005', type: 'BSNL BSNL-M2M Cert', approvedDate: '2026-01-05', expiryDate: '2027-01-05', status: 'Approved' }
      ]
    });
  }
);

module.exports = router;
