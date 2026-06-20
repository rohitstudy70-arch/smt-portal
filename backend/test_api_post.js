require('dotenv').config();
const mongoose = require('mongoose');
const Device = require('./models/Device');

async function run() {
  try {
    const testImei = '888887777766666';
    await mongoose.connect(process.env.MONGO_URI);
    await Device.deleteOne({ imei: testImei });
    console.log('DB Connected and test device cleaned.');

    // We can simulate calling the route handler logic or login and call.
    // Let's mock a req and res and run the controller logic directly to see what happens.
    const express = require('express');
    const normalizeDeviceInput = (body) => ({
      dealerId: String(body.dealerId || '').trim(),
      dealerName: String(body.dealerName || '').trim(),
      subDealerId: String(body.subDealerId || '').trim(),
      subDealerName: String(body.subDealerName || '').trim(),
      vendor: String(body.vendor || '').trim(),
      imei: String(body.imei || body.imeiNumber || '').trim(),
      iccid: String(body.iccid || body.iccidNumber || '').trim(),
      serialNo: String(body.serialNo || body.serialNumber || '').trim(),
      msisdn1: String(body.msisdn1 || '').trim(),
      msisdn2: String(body.msisdn2 || '').trim(),
      itrNo: String(body.itrNo || '').trim(),
      billAmount: Number(body.billAmount) || 0,
      validity: body.validity === '2 Years' ? '2 Years' : '1 Year',
      status: String(body.status || 'Active').trim() || 'Active',
    });

    const body = {
      dealerId: '658123456789012345678902',
      dealerName: 'Test Dealer',
      vendor: 'iTriangle',
      imei: testImei,
      iccid: '89911025065605722222',
      serialNo: '888887777766666',
      billAmount: 1450,
      validity: '1 Year'
    };

    const input = normalizeDeviceInput(body);
    console.log('Normalized Input:', input);

    const device = await Device.create({
      userId: '658123456789012345678901',
      dealerId: input.dealerId,
      dealerName: input.dealerName,
      vendor: input.vendor,
      imei: input.imei,
      imeiNumber: input.imei,
      iccid: input.iccid,
      iccidNumber: input.iccid,
      serialNo: input.serialNo,
      serialNumber: input.serialNo,
      msisdn1: input.msisdn1,
      msisdn2: input.msisdn2,
      itrNo: input.itrNo,
      billAmount: input.billAmount,
      validity: input.validity,
      presentDate: new Date(),
      expiryDate: new Date(),
      status: input.status,
    });

    console.log('Device Created via Mock Controller logic:');
    console.log('Vendor:', device.vendor);
    console.log('Bill Amount:', device.billAmount);

    const fetched = await Device.findOne({ imei: testImei });
    console.log('Fetched from DB:');
    console.log('Vendor:', fetched.vendor);
    console.log('Bill Amount:', fetched.billAmount);

    await Device.deleteOne({ imei: testImei });
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
