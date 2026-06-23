const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/smt-portal').then(async () => {
  const Device = require('./models/Device');
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
  
  const docs = await Device.find({ presentDate: { $gte: start, $lte: end }, billAmount: { $gt: 0 } });
  console.log('Year devices > 0:', docs.length);
  
  const docsAll = await Device.find({ presentDate: { $gte: start, $lte: end } });
  console.log('Year devices all:', docsAll.length);
  
  if (docsAll.length > 0) {
    console.log('Sample billAmount:', docsAll[0].billAmount, typeof docsAll[0].billAmount);
  }
  
  process.exit(0);
}).catch(console.error);
