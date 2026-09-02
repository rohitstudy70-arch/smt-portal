const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const ActivationRequest = require('./models/ActivationRequest');

async function cleanupBlankRequests() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB Atlas...');

    // Find all blank / dummy requests
    const blankRequests = await ActivationRequest.find({
      $or: [
        { customerName: 'Customer', regMobNo: '' },
        { customerName: '', regMobNo: '', vehicleNo: '' },
        { customerName: 'Customer', vehicleNo: '' },
        { regMobNo: '', vehicleNo: '', chassisNo: '' }
      ]
    });

    console.log(`Found ${blankRequests.length} blank/placeholder activation requests.`);

    if (blankRequests.length > 0) {
      console.log('Blank requests found:');
      blankRequests.forEach(r => {
        console.log(`- ID: ${r._id}, IMEI: ${r.imei}, CustomerName: "${r.customerName}", RegMobNo: "${r.regMobNo}", VehicleNo: "${r.vehicleNo}"`);
      });

      const deleteRes = await ActivationRequest.deleteMany({
        $or: [
          { customerName: 'Customer', regMobNo: '' },
          { customerName: '', regMobNo: '', vehicleNo: '' },
          { customerName: 'Customer', vehicleNo: '' },
          { regMobNo: '', vehicleNo: '', chassisNo: '' }
        ]
      });

      console.log(`✅ Successfully deleted ${deleteRes.deletedCount} blank activation requests!`);
    } else {
      console.log('✅ No blank activation requests found in database.');
    }

    process.exit(0);
  } catch (err) {
    console.error('Error during cleanup:', err.message);
    process.exit(1);
  }
}

cleanupBlankRequests();
