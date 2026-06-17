const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const Device = require('./models/Device');
const ActivationRequest = require('./models/ActivationRequest');
const Invoice = require('./models/Invoice');
const Transaction = require('./models/Transaction');

dotenv.config();

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected for seeding...');

    // Clear all collections
    await User.deleteMany({});
    await Device.deleteMany({});
    await ActivationRequest.deleteMany({});
    await Invoice.deleteMany({});
    await Transaction.deleteMany({});
    console.log('All collections cleared.');

    // Create users
    const arshiUser = await User.create({
      username: 'ArshiEnterprises',
      password: 'admin123',
      role: 'partner',
      companyName: 'Arshi Enterprises',
      availableBalance: 43195,
      overDrawnAmount: 0,
    });

    const adminUser = await User.create({
      username: 'admin',
      password: 'admin123',
      role: 'partner',
      companyName: 'iTriangle Admin',
      availableBalance: 100000,
      overDrawnAmount: 0,
    });

    const subUser = await User.create({
      username: 'linkbirds',
      password: 'password123',
      role: 'customer',
      parentId: arshiUser._id,
      userType: 'Sub Dealer',
      displayName: 'Link Birds',
      mobileNo: '9761334377',
      email: 'arshiranjeet133@gmail.com',
      status: 'Active'
    });

    console.log('Users created:', arshiUser.username, adminUser.username, subUser.username);

    // Create 903 devices for ArshiEnterprises
    const devices = [];
    const now = new Date();

    for (let i = 1; i <= 903; i++) {
      const imei = `35${String(i).padStart(13, '0')}`;
      const serialNo = `SN${String(i).padStart(8, '0')}`;
      const iccid = `8991${String(i).padStart(16, '0')}`;

      // 900 devices have SIM, last 3 don't
      const hasSim = i <= 900;

      // 900 devices are Taisys, last 3 aren't
      const isTaisys = i <= 900;

      // Set SIM expiry dates - some expiring soon, some later
      let simExpiryDate = null;
      if (hasSim) {
        const expiryDate = new Date(now);
        if (i <= 50) {
          // 50 devices expiring in the next 2 months
          expiryDate.setDate(expiryDate.getDate() + Math.floor(Math.random() * 60));
        } else {
          // Rest expiring 3-24 months from now
          expiryDate.setMonth(expiryDate.getMonth() + 3 + Math.floor(Math.random() * 21));
        }
        simExpiryDate = expiryDate;
      }

      const msisdnIndex = i;
      devices.push({
        userId: arshiUser._id,
        imei,
        serialNo,
        iccid: `${iccid}F`,
        hasSim,
        isTaisys,
        simExpiryDate,
        msisdn1: `575421${String(msisdnIndex).padStart(7, '0')}`,
        tsp1: 'Airtel',
        msisdn2: `575205${String(msisdnIndex).padStart(7, '0')}`,
        tsp2: 'BSNL',
        assignedTo: null,
      });
    }

    // Add the specific device from the user screenshot
    devices.push({
      userId: arshiUser._id,
      imei: '860103064892921',
      serialNo: '231106374',
      iccid: '8991030648929212345F',
      hasSim: true,
      isTaisys: true,
      simExpiryDate: new Date('2028-02-27'),
      msisdn1: '9876543210',
      tsp1: 'Airtel',
      msisdn2: '9876543211',
      tsp2: 'BSNL',
      assignedTo: subUser._id, // Assign to subUser (Link Birds)
      vendor: 'Taisys',
      deviceType: 'Esim',
      deviceName: 'iTriangle Aquila Bharat 101',
      status: 'Activated'
    });

    await Device.insertMany(devices);
    console.log(`${devices.length} devices created for ArshiEnterprises.`);

    // Create activation requests matching the screenshot data
    const activationRequests = [
      {
        requestId: 'REQUEST36613',
        userId: arshiUser._id,
        isSubDealer: false,
        subDealerName: '',
        dateTime: new Date('2024-11-08T15:35:00'),
        quantity: 100,
        requestType: 'Commercial Plan',
        plan: '1 Year',
        piNo: 'iTR_PI_0626_43460',
        amount: 49120,
        remarks: '',
        status: 'Completed',
      },
      {
        requestId: 'REQUEST36601',
        userId: arshiUser._id,
        isSubDealer: false,
        subDealerName: '',
        dateTime: new Date('2024-11-07T12:20:00'),
        quantity: 10,
        requestType: 'Commercial Plan',
        plan: '1 Year',
        piNo: 'iTR_PI_0625_43448',
        amount: 4720,
        remarks: '',
        status: 'Completed',
      },
      {
        requestId: 'REQUEST36590',
        userId: arshiUser._id,
        isSubDealer: false,
        subDealerName: '',
        dateTime: new Date('2024-11-06T10:15:00'),
        quantity: 50,
        requestType: 'Top-up',
        plan: '1 Month',
        piNo: 'iTR_PI_0624_43437',
        amount: 3540,
        remarks: '',
        status: 'Completed',
      },
      {
        requestId: 'REQUEST36585',
        userId: arshiUser._id,
        isSubDealer: false,
        subDealerName: '',
        dateTime: new Date('2024-11-05T09:45:00'),
        quantity: 20,
        requestType: 'Commercial Plan',
        plan: '2 Years',
        piNo: 'iTR_PI_0623_43432',
        amount: 7880,
        remarks: '',
        status: 'Completed',
      },
      {
        requestId: 'REQUEST36570',
        userId: arshiUser._id,
        isSubDealer: false,
        subDealerName: '',
        dateTime: new Date('2024-11-04T14:30:00'),
        quantity: 5,
        requestType: 'Top-up',
        plan: '1 Month',
        piNo: 'iTR_PI_0622_43417',
        amount: 488.20,
        remarks: 'Urgent request',
        status: 'Completed',
      },
      {
        requestId: 'REQUEST36555',
        userId: arshiUser._id,
        isSubDealer: true,
        subDealerName: 'SubDealer Alpha',
        dateTime: new Date('2024-11-03T11:00:00'),
        quantity: 200,
        requestType: 'Commercial Plan',
        plan: '1 Year',
        piNo: 'iTR_PI_0621_43402',
        amount: 94400,
        remarks: '',
        status: 'Completed',
      },
      {
        requestId: 'REQUEST36540',
        userId: arshiUser._id,
        isSubDealer: false,
        subDealerName: '',
        dateTime: new Date('2024-11-02T16:20:00'),
        quantity: 30,
        requestType: 'Commercial Plan',
        plan: '1 Year',
        piNo: 'iTR_PI_0620_43387',
        amount: 14160,
        remarks: '',
        status: 'Processing',
      },
      {
        requestId: 'REQUEST36530',
        userId: arshiUser._id,
        isSubDealer: false,
        subDealerName: '',
        dateTime: new Date('2024-11-01T08:45:00'),
        quantity: 15,
        requestType: 'Top-up',
        plan: '1 Month',
        piNo: 'iTR_PI_0619_43377',
        amount: 1062,
        remarks: '',
        status: 'Processing',
      },
      {
        requestId: 'REQUEST36520',
        userId: arshiUser._id,
        isSubDealer: false,
        subDealerName: '',
        dateTime: new Date('2024-10-31T13:10:00'),
        quantity: 25,
        requestType: 'Commercial Plan',
        plan: '2 Years',
        piNo: 'iTR_PI_0618_43367',
        amount: 9850,
        remarks: 'Rejected due to insufficient balance',
        status: 'Rejected',
      },
      {
        requestId: 'REQUEST36510',
        userId: arshiUser._id,
        isSubDealer: true,
        subDealerName: 'SubDealer Beta',
        dateTime: new Date('2024-10-30T10:30:00'),
        quantity: 10,
        requestType: 'Top-up',
        plan: '1 Month',
        piNo: 'iTR_PI_0617_43357',
        amount: 708,
        remarks: 'Invalid PI number',
        status: 'Rejected',
      },
      {
        requestId: 'REQUEST36500',
        userId: arshiUser._id,
        isSubDealer: false,
        subDealerName: '',
        dateTime: new Date('2024-10-29T09:00:00'),
        quantity: 8,
        requestType: 'Commercial Plan',
        plan: '1 Year',
        piNo: 'iTR_PI_0616_43347',
        amount: 3776,
        remarks: 'Duplicate request',
        status: 'Rejected',
      },
    ];

    await ActivationRequest.insertMany(activationRequests);
    console.log(
      `${activationRequests.length} activation requests created.`
    );

    // Seed sample invoices with full vehicle details
    const mockInvoices = [
      {
        requestId: 'INV-REQ10001',
        userId: arshiUser._id,
        vehicleType: 'Truck',
        validity: '1 Year',
        imei: '350000000000001',
        iccid: '89910000000000000001F',
        isSubDealer: false,
        subDealerName: '',
        piNo: 'AE-01',
        piValue: 120,
        invoiceNo: 'INV-01',
        status: 'Completed',
        dateTime: new Date('2026-05-15T10:00:00'),
        engineNo: 'ENG1234567',
        chassisNo: 'CHA9876543210',
        vehicleTypeOldNew: 'New',
        vehicleMake: 'Tata Motors',
        vehicleModel: 'LPT 1613',
        endCustomerName: 'Rajesh Sharma',
        rmn: '9876543210',
        rtoState: 'Rajasthan',
        rtoNo: 'RJ14-GA-1234',
        address: '12, Malviya Nagar, Jaipur',
        proofOfAddress: 'Aadhaar Card',
        poaNo: '4521-7890-1234',
        proofOfIdentity: 'PAN Card',
        poiNo: 'BPKPS1234K',
        vehicleNo: 'RJ14-GA-1234'
      },
      {
        requestId: 'INV-REQ10002',
        userId: arshiUser._id,
        vehicleType: 'Car',
        validity: '2 Years',
        imei: '350000000000002',
        iccid: '89910000000000000002F',
        isSubDealer: true,
        subDealerName: 'Link Birds',
        piNo: 'AE-02',
        piValue: 240,
        invoiceNo: 'INV-02',
        status: 'Completed',
        dateTime: new Date('2026-05-20T14:30:00'),
        engineNo: 'ENG4455667',
        chassisNo: 'CHA2233445566',
        vehicleTypeOldNew: 'Old',
        vehicleMake: 'Mahindra',
        vehicleModel: 'Bolero',
        endCustomerName: 'Sanjay Singh',
        rmn: '9123456789',
        rtoState: 'Uttar Pradesh',
        rtoNo: 'UP32-FN-8888',
        address: 'Sec-5, Vikas Nagar, Lucknow',
        proofOfAddress: 'Voter ID',
        poaNo: 'VOTER998877',
        proofOfIdentity: 'Aadhaar Card',
        poiNo: '1122-3344-5566',
        vehicleNo: 'UP32-FN-8888'
      },
      {
        requestId: 'INV-REQ10003',
        userId: arshiUser._id,
        vehicleType: 'Bus',
        validity: '1 Year',
        imei: '350000000000003',
        iccid: '89910000000000000003F',
        isSubDealer: false,
        subDealerName: '',
        piNo: 'AE-03',
        piValue: 120,
        invoiceNo: '',
        status: 'Processing',
        dateTime: new Date('2026-05-28T11:15:00'),
        engineNo: 'ENG8899001',
        chassisNo: 'CHA5566778899',
        vehicleTypeOldNew: 'New',
        vehicleMake: 'Ashok Leyland',
        vehicleModel: 'Viking',
        endCustomerName: 'Amit Verma',
        rmn: '9345678901',
        rtoState: 'Delhi',
        rtoNo: 'DL1C-AB-9999',
        address: 'Plot 45, Rohini, New Delhi',
        proofOfAddress: 'Aadhaar Card',
        poaNo: '9988-7766-5544',
        proofOfIdentity: 'PAN Card',
        poiNo: 'AXDPK9988C',
        vehicleNo: 'DL1C-AB-9999'
      },
      {
        requestId: 'INV-REQ10004',
        userId: arshiUser._id,
        vehicleType: 'Bike',
        validity: '5 Years',
        imei: '350000000000004',
        iccid: '89910000000000000004F',
        isSubDealer: true,
        subDealerName: 'Link Birds',
        piNo: 'AE-04',
        piValue: 600,
        invoiceNo: 'INV-04',
        status: 'Completed',
        dateTime: new Date('2026-06-01T09:00:00'),
        engineNo: 'ENG3322110',
        chassisNo: 'CHA7766554433',
        vehicleTypeOldNew: 'New',
        vehicleMake: 'Honda',
        vehicleModel: 'Splendor',
        endCustomerName: 'Rahul Joshi',
        rmn: '8877665544',
        rtoState: 'Gujarat',
        rtoNo: 'GJ01-ZZ-5555',
        address: '501, Satellite Area, Ahmedabad',
        proofOfAddress: 'Electricity Bill',
        poaNo: 'ELEC-44332211',
        proofOfIdentity: 'Driving License',
        poiNo: 'GJ01-2015-0099',
        vehicleNo: 'GJ01-ZZ-5555'
      }
    ];

    await Invoice.insertMany(mockInvoices);
    console.log(`${mockInvoices.length} invoices seeded with vehicle details.`);

    // Create wallet transactions
    const transactions = [
      {
        userId: arshiUser._id,
        date: new Date('2026-06-02T06:48:53'),
        transactionId: 'ITR_06_26_53367',
        paymentId: 'ITR_PI_0626_43496',
        paymentFor: 'Sim Activation',
        referenceNo: 'REQUEST36636',
        payMode: 'Itwallet',
        transactionType: 'Debit',
        status: 'Success',
        remarks: '-',
        maxDays: '-',
        requestedAmt: '-',
        transactedAmt: 16520.00
      },
      {
        userId: arshiUser._id,
        date: new Date('2026-06-02T06:39:21'),
        transactionId: 'ITR_06_26_53364',
        paymentId: 'ITR_PI_0625_43484',
        paymentFor: 'Sim Activation',
        referenceNo: 'REQUEST36634',
        payMode: 'Itwallet',
        transactionType: 'Debit',
        status: 'Success',
        remarks: '-',
        maxDays: '-',
        requestedAmt: '-',
        transactedAmt: 3540.00
      },
      {
        userId: arshiUser._id,
        date: new Date('2026-06-02T11:15:34'),
        transactionId: 'ITR_06_26_53362',
        paymentId: 'ITR_06_26_53362',
        paymentFor: '-',
        referenceNo: '-',
        payMode: 'Manualentry',
        transactionType: 'Credit',
        status: 'Success',
        remarks: 'NEFT Cr-IN42615350215237-ICIC0SF0002-ARSHI ENTERPRISES--TopUp',
        maxDays: '-',
        requestedAmt: '-',
        transactedAmt: 32000.00
      },
      {
        userId: arshiUser._id,
        date: new Date('2026-06-02T04:52:41'),
        transactionId: 'ITR_06_26_53353',
        paymentId: 'ITR_PI_0626_43460',
        paymentFor: 'Sim Activation',
        referenceNo: 'REQUEST36613',
        payMode: 'Itwallet',
        transactionType: 'Debit',
        status: 'Success',
        remarks: '-',
        maxDays: '-',
        requestedAmt: '-',
        transactedAmt: 40120.00
      },
      {
        userId: arshiUser._id,
        date: new Date('2026-06-01T13:46:09'),
        transactionId: 'ITR_06_26_53344',
        paymentId: 'ITR_PI_0626_43460',
        paymentFor: 'Sim Activation',
        referenceNo: 'REQUEST36601',
        payMode: 'Itwallet',
        transactionType: 'Debit',
        status: 'Success',
        remarks: '-',
        maxDays: '-',
        requestedAmt: '-',
        transactedAmt: 4720.00
      }
    ];

    await Transaction.insertMany(transactions);
    console.log(`${transactions.length} wallet transactions created.`);

    console.log('\n--- Seed Summary ---');
    console.log(`Users: 2`);
    console.log(`Devices: ${devices.length}`);
    console.log(`  - With SIM: 900`);
    console.log(`  - Taisys: 900`);
    console.log(`Activation Requests: ${activationRequests.length}`);
    console.log(
      `  - Completed: ${activationRequests.filter((r) => r.status === 'Completed').length}`
    );
    console.log(
      `  - Processing: ${activationRequests.filter((r) => r.status === 'Processing').length}`
    );
    console.log(
      `  - Rejected: ${activationRequests.filter((r) => r.status === 'Rejected').length}`
    );
    console.log(`Invoices: ${mockInvoices.length}`);
    console.log('\nSeed data inserted successfully!');

    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

seedData();
