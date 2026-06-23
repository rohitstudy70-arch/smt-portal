const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/smt-portal').then(async () => {
  const Device = require('./models/Device');
  const d = new Date();
  d.setHours(0,0,0,0);
  
  const end = new Date();
  end.setHours(23,59,59,999);

  const [summary] = await Device.aggregate([
    { $match: { presentDate: { $gte: d, $lte: end } } },
    { $group: { _id: null, total: { $sum: '$billAmount' } } }
  ]);
  
  console.log('Total aggregated:', summary?.total || 0);
  process.exit(0);
}).catch(console.error);
