const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/smt-portal').then(async () => {
  const Device = require('./models/Device');
  const d = new Date();
  d.setHours(0,0,0,0);
  const docs = await Device.find({ presentDate: { $gte: d } });
  console.log('Today devices count:', docs.length);
  docs.forEach(doc => console.log(doc.imei, doc.billAmount, typeof doc.billAmount));
  process.exit(0);
}).catch(console.error);
