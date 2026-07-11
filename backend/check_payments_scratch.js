require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://rohitstudy70_db_user:UkTQ7NsQChvV6b2q@cluster0.egh9cim.mongodb.net/?appName=Cluster0';

async function main() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const requests = await db.collection('paymentverificationrequests').find({}).toArray();

    console.log(`Total payment verification requests found: ${requests.length}`);
    requests.forEach((r, idx) => {
      console.log(`[Request ${idx + 1}]`);
      console.log(`  ID: ${r._id}`);
      console.log(`  User/userId: ${r.userId}`);
      console.log(`  Amount: ₹${r.amount}`);
      console.log(`  Status: ${r.status}`);
      console.log(`  Payment Date: ${r.paymentDate}`);
      console.log(`  Created At: ${r.createdAt}`);
      console.log(`  Reference: ${r.referenceNumber}`);
      console.log(`  Remarks: ${r.remarks}`);
      console.log('--------------------------------------------');
    });

    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main();
