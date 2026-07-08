require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://rohitstudy70_db_user:UkTQ7NsQChvV6b2q@cluster0.egh9cim.mongodb.net/?appName=Cluster0';

async function main() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    for (const collInfo of collections) {
      const name = collInfo.name;
      const coll = db.collection(name);
      const docs = await coll.find({}).toArray();
      let matchCount = 0;

      for (const doc of docs) {
        const docStr = JSON.stringify(doc);
        if (docStr.includes('137')) {
          matchCount++;
          console.log(`Match in collection '${name}':`);
          console.log(JSON.stringify(doc, null, 2));
          console.log('---');
        }
      }
      console.log(`Collection '${name}': scanned ${docs.length} documents, found ${matchCount} matches.`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error running script:', error);
    process.exit(1);
  }
}

main();
