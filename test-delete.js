require('dotenv').config({ path: './backend/.env' });
const mongoose = require('mongoose');
const ActivationRequest = require('./backend/models/ActivationRequest');
const Device = require('./backend/models/Device');
const Transaction = require('./backend/models/Transaction');
const User = require('./backend/models/User');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to DB');

  const request = await ActivationRequest.findOne({}).sort({ dateTime: -1 });
  if (!request) {
    console.log('No requests found');
    process.exit(0);
  }
  console.log('Found request:', request._id, request.status, request.amount);

  try {
    if (request.imei) {
      const device = await Device.findOne({ imei: request.imei });
      console.log('Found device?', !!device);
      if (device) {
        device.activationRequestStatus = 'none';
        await device.validate();
        console.log('Device validate ok');
      }
    }

    if (request.amount > 0 && request.status !== 'Completed') {
      const transaction = await Transaction.findOne({ paymentId: request.requestId });
      console.log('Found transaction?', !!transaction);
      if (transaction && transaction.status === 'Success') {
        const targetUser = await User.findById(transaction.userId);
        if (targetUser) {
          targetUser.availableBalance = (targetUser.availableBalance || 0) + request.amount;
        }
        transaction.status = 'Refunded';
        transaction.remarks = 'Refunded due to deleted activation request';
        await transaction.validate();
        console.log('Transaction validated successfully');
      }
    }
  } catch (error) {
    console.error('Error during simulation:', error);
  }
  process.exit(0);
};
run();
