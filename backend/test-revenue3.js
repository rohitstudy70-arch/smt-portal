const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/smt-portal').then(async () => {
  const Device = require('./models/Device');
  
  // Create a device with a string billAmount
  const d1 = new Device({
    userId: new mongoose.Types.ObjectId(),
    imei: 'TEST1234',
    serialNo: 'TEST1234',
    billAmount: "56321", // string!
  });
  
  await d1.save();
  
  const [summary] = await Device.aggregate([
    { $match: { imei: 'TEST1234' } },
    { $group: { _id: null, total: { $sum: '$billAmount' } } }
  ]);
  
  console.log('Aggregated total:', summary?.total);
  
  const foundGt0 = await Device.find({ imei: 'TEST1234', billAmount: { $gt: 0 } });
  console.log('Found with $gt 0:', foundGt0.length);

  await Device.deleteOne({ imei: 'TEST1234' });
  
  process.exit(0);
}).catch(console.error);
