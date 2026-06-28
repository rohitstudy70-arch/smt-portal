const mongoose = require('mongoose');
const DealerDue = require('../models/DealerDue');
const Device = require('../models/Device');
const DuePayment = require('../models/DuePayment');
const User = require('../models/User');
const RenewalRequest = require('../models/RenewalRequest');
const { PORTAL_ROLES, getPortalRole, labelForUser } = require('../middleware/hierarchy');

const DAY_MS = 24 * 60 * 60 * 1000;

const toObjectId = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (!mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(value);
};

const uniqueObjectIds = (values = []) => {
  const seen = new Set();
  const ids = [];

  values.forEach((value) => {
    const objectId = toObjectId(value?._id || value);
    if (!objectId) return;
    const key = objectId.toString();
    if (seen.has(key)) return;
    seen.add(key);
    ids.push(objectId);
  });

  return ids;
};

const getAccountType = (user) => (
  getPortalRole(user) === PORTAL_ROLES.SUB_DEALER ? 'Sub Dealer' : 'Dealer'
);

const getStatus = ({ totalOutstanding, currentDue, totalPaidAmount }) => {
  if (totalOutstanding <= 0) return 'Clear';
  if (currentDue > 0) {
    return totalPaidAmount > 0 ? 'Partial' : 'Overdue';
  }
  return 'Clear';
};

const buildDeviceDueQuery = (user) => {
  const role = getPortalRole(user);

  if (role === PORTAL_ROLES.SUB_DEALER) {
    return {
      $or: [
        { subDealerId: user._id },
        { userId: user._id },
      ],
    };
  }

  if (role === PORTAL_ROLES.DEALER) {
    return {
      $or: [
        { dealerId: user._id, subDealerId: null },
        { userId: user._id, subDealerId: null },
      ],
    };
  }

  return null;
};

const syncDueForUser = async (userId) => {
  const user = await User.findById(userId).select('-password');
  if (!user) return null;

  const role = getPortalRole(user);
  if (![PORTAL_ROLES.DEALER, PORTAL_ROLES.SUB_DEALER].includes(role)) {
    return null;
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS);

  const dueQuery = buildDeviceDueQuery(user);
  const [deviceSummary] = await Device.aggregate([
    { $match: dueQuery },
    {
      $group: {
        _id: null,
        totalDevicesAssigned: { $sum: 1 },
        totalBillAmount: { $sum: { $ifNull: ['$billAmount', 0] } },
        dueBillAmount: {
          $sum: {
            $cond: [
              { $lte: [{ $ifNull: ['$presentDate', '$createdAt'] }, thirtyDaysAgo] },
              { $ifNull: ['$billAmount', 0] },
              0
            ]
          }
        },
        oldestPendingDate: { $min: { $ifNull: ['$presentDate', '$createdAt'] } },
      },
    },
  ]);

  let dueRecord = await DealerDue.findOne({ userId: user._id });
  if (!dueRecord) {
    dueRecord = new DealerDue({ userId: user._id });
  }

  const [paymentSummary] = await DuePayment.aggregate([
    { $match: { userId: user._id } },
    {
      $group: {
        _id: null,
        totalPaidAmount: { $sum: '$amount' },
        lastPaymentDate: { $max: '$paymentDate' },
      },
    },
  ]);

  const renewals = await RenewalRequest.find({
    dealerId: user._id,
    status: { $ne: 'Rejected' },
    paymentStatus: { $ne: 'Cancelled' },
  }).lean();

  let totalRenewalBill = 0;
  let totalRenewalPaid = 0;
  let totalRenewalOutstanding = 0;
  let overdueRenewalDues = 0;

  renewals.forEach((r) => {
    const bill = Number(r.billAmount) || 0;
    const received = Number(r.receivedAmount) || 0;
    const remaining = Number(r.remainingDue) || 0;

    totalRenewalBill += bill;
    totalRenewalPaid += received;
    totalRenewalOutstanding += remaining;

    const rDate = new Date(r.renewalDate);
    if (r.paymentStatus !== 'Paid' && !Number.isNaN(rDate.getTime()) && rDate < thirtyDaysAgo) {
      overdueRenewalDues += remaining;
    }
  });

  const totalDevicesAssigned = deviceSummary?.totalDevicesAssigned || 0;
  const totalDeviceBillAmount = deviceSummary?.totalBillAmount || 0;
  const dueDeviceBillAmount = deviceSummary?.dueBillAmount || 0;
  const totalDevicePaidAmount = paymentSummary?.totalPaidAmount || 0;

  const deviceOutstanding = Math.max(totalDeviceBillAmount - totalDevicePaidAmount, 0);
  const deviceCurrentDue = Math.max(dueDeviceBillAmount - totalDevicePaidAmount, 0);

  const totalBillAmount = totalDeviceBillAmount + totalRenewalBill;
  const totalPaidAmount = totalDevicePaidAmount + totalRenewalPaid;
  const totalOutstanding = deviceOutstanding + totalRenewalOutstanding;
  const currentDue = deviceCurrentDue + overdueRenewalDues;

  let oldestPendingDate = null;
  const oldestDevicePendingDate = deviceOutstanding > 0 ? deviceSummary?.oldestPendingDate : null;
  let oldestRenewalPendingDate = null;

  if (totalRenewalOutstanding > 0) {
    const pendingRenewals = renewals.filter(r => (Number(r.remainingDue) || 0) > 0 && r.renewalDate);
    if (pendingRenewals.length > 0) {
      const dates = pendingRenewals.map(r => new Date(r.renewalDate)).filter(d => !isNaN(d.getTime()));
      if (dates.length > 0) {
        oldestRenewalPendingDate = new Date(Math.min(...dates));
      }
    }
  }

  if (oldestDevicePendingDate && oldestRenewalPendingDate) {
    oldestPendingDate = new Date(Math.min(oldestDevicePendingDate, oldestRenewalPendingDate));
  } else {
    oldestPendingDate = oldestDevicePendingDate || oldestRenewalPendingDate || null;
  }

  dueRecord.parentDealerId = role === PORTAL_ROLES.SUB_DEALER ? user.parentId || null : null;
  dueRecord.accountType = getAccountType(user);
  dueRecord.dealerName = labelForUser(user);
  dueRecord.dealerCode = user.username || user._id.toString();
  dueRecord.totalDevicesAssigned = totalDevicesAssigned;
  dueRecord.totalBillAmount = totalBillAmount;
  dueRecord.totalPaidAmount = totalPaidAmount;
  dueRecord.totalOutstanding = totalOutstanding;
  dueRecord.currentDue = currentDue;
  dueRecord.lastPaymentDate = paymentSummary?.lastPaymentDate || null;
  dueRecord.oldestPendingDate = oldestPendingDate;
  dueRecord.status = getStatus({ totalOutstanding, currentDue, totalPaidAmount });
  dueRecord.lastSyncedAt = new Date();

  await dueRecord.save();
  return dueRecord;
};

const syncDueForUsers = async (userIds = []) => {
  const synced = [];
  const ids = uniqueObjectIds(userIds);

  for (const id of ids) {
    const record = await syncDueForUser(id);
    if (record) synced.push(record);
  }

  return synced;
};

const getDueOwnerIdsFromDevice = (device) => uniqueObjectIds([
  device?.subDealerId,
  !device?.subDealerId ? device?.dealerId : null,
  !device?.subDealerId && !device?.dealerId ? device?.userId : null,
]);

const getDueUsersForScope = async (scope, currentUser) => {
  if (scope.role === PORTAL_ROLES.ADMIN) {
    return scope.users.filter((user) => (
      [PORTAL_ROLES.DEALER, PORTAL_ROLES.SUB_DEALER].includes(getPortalRole(user))
    ));
  }

  const role = getPortalRole(currentUser);
  if (role === PORTAL_ROLES.DEALER) {
    return scope.users.filter((user) => (
      [PORTAL_ROLES.DEALER, PORTAL_ROLES.SUB_DEALER].includes(getPortalRole(user))
    ));
  }

  if (role === PORTAL_ROLES.SUB_DEALER) {
    return [currentUser];
  }

  return [];
};

const syncDueForScope = async (scope, currentUser) => {
  const users = await getDueUsersForScope(scope, currentUser);
  await syncDueForUsers(users.map((user) => user._id));
  return users;
};

module.exports = {
  buildDeviceDueQuery,
  getDueOwnerIdsFromDevice,
  getDueUsersForScope,
  syncDueForScope,
  syncDueForUser,
  syncDueForUsers,
};
