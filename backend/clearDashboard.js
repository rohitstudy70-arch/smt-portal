const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const Device = require('./models/Device');
const ActivationRequest = require('./models/ActivationRequest');
const Invoice = require('./models/Invoice');
const Transaction = require('./models/Transaction');

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

    console.log(`Deleted ${deleteDevices.deletedCount} devices.`);
    console.log(`Deleted ${deleteActivationRequests.deletedCount} activation requests.`);
    console.log(`Deleted ${deleteInvoices.deletedCount} invoices.`);
    console.log(`Deleted ${deleteTransactions.deletedCount} transactions.`);

    // Reset user balances/overdraws to 0
    const updateUsers = await User.updateMany({}, {
      $set: {
        availableBalance: 0,
        overDrawnAmount: 0
      }
    });
    console.log(`Reset balances for ${updateUsers.modifiedCount} users to 0.`);

    console.log('Dashboard records have been successfully set to zero!');
    process.exit(0);
  } catch (error) {
    console.error('Error clearing dashboard data:', error);
    process.exit(1);
  }
};

clearDashboardData();
