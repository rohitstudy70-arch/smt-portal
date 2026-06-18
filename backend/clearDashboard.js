const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const Device = require('./models/Device');
const ActivationRequest = require('./models/ActivationRequest');
const Invoice = require('./models/Invoice');
const Transaction = require('./models/Transaction');
const RenewalRequest = require('./models/RenewalRequest');
const AuditLog = require('./models/AuditLog');

dotenv.config();

const clearDashboardData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected for clearing dashboard...');

    // Delete all records from the collections that populate the dashboard
    const deleteDevices = await Device.deleteMany({});
    const deleteActivationRequests = await ActivationRequest.deleteMany({});
    const deleteInvoices = await Invoice.deleteMany({});
    const deleteTransactions = await Transaction.deleteMany({});
    const deleteRenewalRequests = await RenewalRequest.deleteMany({});
    const deleteAuditLogs = await AuditLog.deleteMany({});
    
    // Delete all users except admin (role 'partner')
    const deleteUsers = await User.deleteMany({ role: { $ne: 'partner' } });

    console.log(`Deleted ${deleteDevices.deletedCount} devices.`);
    console.log(`Deleted ${deleteActivationRequests.deletedCount} activation requests.`);
    console.log(`Deleted ${deleteInvoices.deletedCount} invoices.`);
    console.log(`Deleted ${deleteTransactions.deletedCount} transactions.`);
    console.log(`Deleted ${deleteRenewalRequests.deletedCount} renewal requests.`);
    console.log(`Deleted ${deleteAuditLogs.deletedCount} audit logs.`);
    console.log(`Deleted ${deleteUsers.deletedCount} users (dealers, sub-dealers, customers).`);

    // Reset remaining admin user balances/overdraws to 0
    const updateAdmins = await User.updateMany({}, {
      $set: {
        availableBalance: 0,
        overDrawnAmount: 0
      }
    });
    console.log(`Reset balances for ${updateAdmins.modifiedCount} admin users to 0.`);

    console.log('Dashboard records have been successfully set to zero!');
    process.exit(0);
  } catch (error) {
    console.error('Error clearing dashboard data:', error);
    process.exit(1);
  }
};

clearDashboardData();
