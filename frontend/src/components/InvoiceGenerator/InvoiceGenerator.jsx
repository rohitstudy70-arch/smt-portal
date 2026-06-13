import { useState, useEffect } from 'react';
import { FaDownload, FaSpinner, FaFileInvoiceDollar, FaPlus, FaTrash } from 'react-icons/fa';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import './InvoiceGenerator.css';

const InvoiceGenerator = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Form State
  const [piNo, setPiNo] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [endCustomerName, setEndCustomerName] = useState('');
  const [rmn, setRmn] = useState('');
  const [address, setAddress] = useState('');
  const [poaNo, setPoaNo] = useState(''); // GSTIN/PAN/Aadhaar
  const [commonLayer, setCommonLayer] = useState('BSNL CL');
  const [vehicleType, setVehicleType] = useState('Truck');
  const [validity, setValidity] = useState('1 Year');
  const [searchImei, setSearchImei] = useState('');
  
  // Vehicle Details
  const [vehicleNo, setVehicleNo] = useState('');
  const [engineNo, setEngineNo] = useState('');
  const [chassisNo, setChassisNo] = useState('');
  const [vehicleTypeOldNew, setVehicleTypeOldNew] = useState('New');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [rtoState, setRtoState] = useState('');
  const [rtoNo, setRtoNo] = useState('');

  // KYC
  const [proofOfAddress, setProofOfAddress] = useState('GST Certificate');
  const [proofOfIdentity, setProofOfIdentity] = useState('PAN Card');
  const [poiNo, setPoiNo] = useState('');

  const [singleSubmitting, setSingleSubmitting] = useState(false);
  const [credentialsToShow, setCredentialsToShow] = useState(null);

  // Dynamic invoice items state (preloaded with default rows shown in the screenshot)
  const [items, setItems] = useState([
    {
      description: 'iTriangle (Bharat101 Plus) Ais140 2G\nVLTD Device with including Dual profile E-sim & Software + 01 Panic Switch',
      validity: '12 Month',
      unitPrice: 4300,
      cgst: 9,
      sgst: 9,
      qty: 1
    },
    {
      description: 'iTriangle (Bharat101 Plus) Ais140 _2G',
      validity: '24 Month',
      unitPrice: 5600,
      cgst: 9,
      sgst: 9,
      qty: 1
    },
    {
      description: 'Installation',
      validity: 'One Time',
      unitPrice: 400,
      cgst: 9,
      sgst: 9,
      qty: 1
    }
  ]);

  // Helper to calculate details for one item
  const calculateItemDetails = (item) => {
    const unitPrice = parseFloat(item.unitPrice) || 0;
    const cgstRate = parseFloat(item.cgst) || 0;
    const sgstRate = parseFloat(item.sgst) || 0;
    const qty = parseInt(item.qty) || 0;

    const cgstAmt = Math.round((unitPrice * cgstRate) / 100);
    const sgstAmt = Math.round((unitPrice * sgstRate) / 100);
    const priceWithGst = unitPrice + cgstAmt + sgstAmt;
    const grossAmt = priceWithGst * qty;

    return {
      ...item,
      cgstAmt,
      sgstAmt,
      priceWithGst,
      grossAmt
    };
  };

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        description: '',
        validity: '12 Month',
        unitPrice: 0,
        cgst: 9,
        sgst: 9,
        qty: 1
      }
    ]);
  };

  const handleRemoveItem = (index) => {
    if (items.length === 1) {
      alert('At least one item is required in the invoice.');
      return;
    }
    setItems(items.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;
    setItems(updated);
  };

  const totalInvoiceValue = items.reduce((sum, item) => {
    const detailed = calculateItemDetails(item);
    return sum + detailed.grossAmt;
  }, 0);

  const fetchNextPiNo = async () => {
    try {
      const response = await api.get('/common-layer-requests/next-pi-no');
      setPiNo(response.data.nextPiNo);
      if (response.data.nextInvoiceNo) {
        setInvoiceNo(response.data.nextInvoiceNo);
      }
    } catch (err) {
      console.error('Error fetching next PI number:', err);
    }
  };

  useEffect(() => {
    fetchNextPiNo();
  }, []);

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        setLoading(true);
        const response = await api.get('/common-layer-requests', {
          params: { page, limit, search }
        });
        setRequests(response.data.requests);
        setTotalCount(response.data.total);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching CL requests:', err);
        setLoading(false);
      }
    };

    fetchRequests();
  }, [page, limit, search, refreshTrigger]);

  const handleSingleSubmit = async (e) => {
    e.preventDefault();
    if (!endCustomerName.trim()) {
      alert('Please enter Customer Name.');
      return;
    }
    if (!address.trim()) {
      alert('Please enter Customer Address.');
      return;
    }
    if (!rmn.trim()) {
      alert('Please enter Customer Mobile (RMN).');
      return;
    }
    if (!poaNo.trim()) {
      alert('Please enter GSTIN / POA Number.');
      return;
    }

    const detailedItems = items.map(item => {
      const det = calculateItemDetails(item);
      return {
        description: det.description,
        validity: det.validity,
        unitPrice: parseFloat(det.unitPrice) || 0,
        cgst: parseFloat(det.cgst) || 0,
        sgst: parseFloat(det.sgst) || 0,
        priceWithGst: det.priceWithGst,
        qty: parseInt(det.qty) || 1,
        grossAmt: det.grossAmt
      };
    });

    const totalVal = detailedItems.reduce((sum, item) => sum + item.grossAmt, 0);

    setSingleSubmitting(true);
    try {
      const response = await api.post('/common-layer-requests', {
        commonLayer,
        vehicleType,
        validity,
        imei: searchImei || 'N/A',
        iccid: searchImei || 'N/A',
        isSubDealer: false,
        subDealerName: '',
        piNo: piNo || 'AE-01',
        piValue: totalVal,
        invoiceNo,
        engineNo,
        chassisNo,
        vehicleTypeOldNew,
        vehicleMake,
        vehicleModel,
        endCustomerName,
        rmn,
        rtoState,
        rtoNo,
        address,
        proofOfAddress,
        poaNo,
        proofOfIdentity,
        poiNo,
        vehicleNo,
        items: detailedItems
      });

      const { customerCredentials } = response.data;
      if (customerCredentials && customerCredentials.isNew) {
        setCredentialsToShow(customerCredentials);
      }

      // Clear/Reset form
      setPiNo('');
      setInvoiceNo('');
      setEndCustomerName('');
      setRmn('');
      setAddress('');
      setPoaNo('');
      setSearchImei('');
      setVehicleNo('');
      setEngineNo('');
      setChassisNo('');
      setVehicleMake('');
      setVehicleModel('');
      setRtoState('');
      setRtoNo('');
      setPoiNo('');
      setItems([
        {
          description: 'iTriangle (Bharat101 Plus) Ais140 2G\nVLTD Device with including Dual profile E-sim & Software + 01 Panic Switch',
          validity: '12 Month',
          unitPrice: 4300,
          cgst: 9,
          sgst: 9,
          qty: 1
        },
        {
          description: 'iTriangle (Bharat101 Plus) Ais140 _2G',
          validity: '24 Month',
          unitPrice: 5600,
          cgst: 9,
          sgst: 9,
          qty: 1
        },
        {
          description: 'Installation',
          validity: 'One Time',
          unitPrice: 400,
          cgst: 9,
          sgst: 9,
          qty: 1
        }
      ]);

      setRefreshTrigger(prev => prev + 1);
      setSingleSubmitting(false);
      alert('Invoice Generated & Saved Successfully!');
      fetchNextPiNo();
    } catch (err) {
      console.error('Error submitting invoice:', err);
      setSingleSubmitting(false);
      alert(err.response?.data?.message || 'Failed to generate invoice.');
    }
  };

  const numberToWords = (price) => {
    const s = Math.round(price);
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    const convert = (num) => {
      if (num < 20) return a[num];
      if (num < 100) return b[Math.floor(num / 10)] + (num % 10 ? ' ' + a[num % 10] : '');
      if (num < 1000) return a[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' and ' + convert(num % 100) : '');
      if (num < 100000) return convert(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + convert(num % 1000) : '');
      if (num < 10000000) return convert(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + convert(num % 100000) : '');
      return convert(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + convert(num % 10000000) : '');
    };
    
    if (s === 0) return 'Zero Rupees Only';
    return convert(s) + ' Rupees Only';
  };

  const handleDownloadInvoice = (req) => {
    const isAe01 = req.requestId === 'CL-REQ-AE-01';
    
    const customerName = isAe01 ? 'JYOTI CONSTRUCTION AND ENGINEERING Pvt. Ltd' : (req.endCustomerName || 'JYOTI CONSTRUCTION AND ENGINEERING Pvt. Ltd');
    const customerAddress = isAe01 ? 'PAPRAUR, Begusarai, Bihar, 851210' : (req.address || 'PAPRAUR, Begusarai, Bihar, 851210');
    const customerMob = isAe01 ? '9031622921' : (req.rmn || '9031622921');
    const customerGstin = isAe01 ? '10AAECJ5132H1Z3' : (req.poaNo || '10AAECJ5132H1Z3');
    
    const piDate = isAe01 ? '09.04.2026' : new Date(req.dateTime).toLocaleDateString('en-GB').replace(/\//g, '.');
    const piInvoiceNo = req.piNo || 'AE-01';
    
    let itemsHtml = '';
    let totalAmt = 0;

    if (req.items && req.items.length > 0) {
      itemsHtml = req.items.map((item, index) => {
        const unitPrice = parseFloat(item.unitPrice) || 0;
        const cgstRate = parseFloat(item.cgst) || 0;
        const sgstRate = parseFloat(item.sgst) || 0;
        const qty = parseInt(item.qty) || 0;

        const cgstAmt = Math.round((unitPrice * cgstRate) / 100);
        const sgstAmt = Math.round((unitPrice * sgstRate) / 100);
        const priceWithGst = unitPrice + cgstAmt + sgstAmt;
        const grossAmt = priceWithGst * qty;

        return `
          <tr>
            <td>${index + 1}</td>
            <td class="text-left">${item.description.replace(/\n/g, '<br/>')}</td>
            <td>${item.validity || '--'}</td>
            <td>${unitPrice}</td>
            <td>${cgstAmt}</td>
            <td>${sgstAmt}</td>
            <td>${priceWithGst}</td>
            <td>${qty}</td>
            <td>${grossAmt.toFixed(2)}</td>
          </tr>
        `;
      }).join('');
      totalAmt = req.piValue || req.items.reduce((sum, item) => {
        const unitPrice = parseFloat(item.unitPrice) || 0;
        const cgstRate = parseFloat(item.cgst) || 0;
        const sgstRate = parseFloat(item.sgst) || 0;
        const qty = parseInt(item.qty) || 0;
        const priceWithGst = unitPrice + Math.round((unitPrice * cgstRate) / 100) + Math.round((unitPrice * sgstRate) / 100);
        return sum + (priceWithGst * qty);
      }, 0);
    } else {
      const is2Years = req.validity === '2 Years' || req.validity === '24 Month';
      const is5Years = req.validity === '5 Years' || req.validity === '60 Month';
      
      let unitPrice = 4300;
      let cgst = 387;
      let sgst = 387;
      let priceWithGst = 5074;
      let validityPeriod = '12 Month';
      
      if (is2Years) {
        unitPrice = 5600;
        cgst = 504;
        sgst = 504;
        priceWithGst = 6608;
        validityPeriod = '24 Month';
      } else if (is5Years) {
        unitPrice = 10000;
        cgst = 900;
        sgst = 900;
        priceWithGst = 11800;
        validityPeriod = '60 Month';
      }
      
      itemsHtml = `
        <tr>
          <td>1</td>
          <td class="text-left">iTriangle (Bharat101 Plus) Ais140 ${is2Years ? '_2G' : is5Years ? '_5G' : '2G'}<br/><small style="color: #555;">VLTD Device with including Dual profile E-sim & Software + 01 Panic Switch</small></td>
          <td>${validityPeriod}</td>
          <td>${unitPrice}</td>
          <td>${cgst}</td>
          <td>${sgst}</td>
          <td>${priceWithGst}</td>
          <td>1</td>
          <td>${priceWithGst.toFixed(2)}</td>
        </tr>
        <tr>
          <td>2</td>
          <td class="text-left">Installation</td>
          <td>One Time</td>
          <td>400</td>
          <td>36</td>
          <td>36</td>
          <td>472</td>
          <td>1</td>
          <td>472.00</td>
        </tr>
      `;
      totalAmt = priceWithGst + 472;
    }

    const amountInWords = numberToWords(totalAmt);
    
    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) {
      alert('Popup blocker enabled. Please allow popups to download/print the invoice.');
      return;
    }
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Proforma Invoice - ${piInvoiceNo}</title>
        <style>
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            margin: 10px;
            color: #000;
            font-size: 11px;
            line-height: 1.35;
          }
          .invoice-box {
            max-width: 820px;
            margin: auto;
            border: 1.5px solid #000;
            padding: 15px;
            background: #fff;
          }
          .invoice-header-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 5px;
          }
          .header-logo-cell {
            width: 15%;
            vertical-align: middle;
            text-align: left;
          }
          .header-text-cell {
            width: 70%;
            text-align: center;
            vertical-align: middle;
          }
          .header-logo-right-cell {
            width: 15%;
            vertical-align: middle;
            text-align: right;
          }
          .brand-title {
            font-family: 'Georgia', 'Times New Roman', serif;
            font-size: 26px;
            color: #b91c1c;
            font-weight: 800;
            margin: 0;
            letter-spacing: 0.5px;
          }
          .brand-subtitle {
            font-size: 13px;
            font-weight: 700;
            color: #000;
            margin: 4px 0 2px 0;
          }
          .brand-contact {
            font-size: 11px;
            color: #00f;
            text-decoration: underline;
            margin: 0;
            font-weight: 600;
          }
          .logo-circle-ae {
            width: 55px;
            height: 55px;
            border: 2px solid #002060;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            position: relative;
          }
          .logo-circle-ae::after {
            content: 'AE';
            font-family: 'Georgia', serif;
            font-size: 22px;
            color: #002060;
            font-weight: 800;
            font-style: italic;
          }
          .gps-logo-img {
            width: 55px;
            height: 55px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
            box-shadow: 0 4px 8px rgba(245, 158, 11, 0.2);
            color: #fff;
            font-weight: 800;
            font-size: 10px;
            text-align: center;
            line-height: 1.1;
          }
          .invoice-title {
            text-align: center;
            color: #ef4444;
            font-size: 15px;
            font-weight: 800;
            margin: 15px 0 10px 0;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .meta-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 10px;
          }
          .meta-table td {
            font-size: 12px;
            font-weight: bold;
          }
          .to-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 15px;
          }
          .to-table td {
            border: 1px solid #000;
            padding: 6px 10px;
            font-size: 11.5px;
          }
          .to-label {
            width: 120px;
            font-weight: bold;
            text-align: right;
            padding-right: 15px;
          }
          .subject-line {
            font-size: 11.5px;
            font-weight: bold;
            margin: 8px 0;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 12px;
          }
          .items-table th {
            background-color: #0070c0;
            color: #fff;
            border: 1px solid #000;
            padding: 8px;
            font-size: 11px;
            font-weight: bold;
            text-align: center;
            text-transform: uppercase;
          }
          .items-table td {
            border: 1px solid #000;
            padding: 10px 8px;
            text-align: center;
            font-size: 11px;
            vertical-align: middle;
          }
          .items-table .text-left {
            text-align: left;
            font-weight: 500;
          }
          .items-table tr.total-row td {
            font-weight: bold;
            font-size: 11.5px;
          }
          .terms-section {
            font-size: 10px;
            margin-top: 15px;
            line-height: 1.35;
          }
          .terms-title {
            font-weight: bold;
            margin-bottom: 4px;
          }
          .terms-list {
            margin: 0;
            padding-left: 15px;
          }
          .signatory-box {
            float: right;
            text-align: center;
            width: 180px;
            margin-top: 20px;
            position: relative;
            font-size: 11px;
          }
          .stamp-container {
            position: absolute;
            top: -45px;
            left: 50px;
            opacity: 0.65;
            pointer-events: none;
          }
          .stamp-circle {
            width: 80px;
            height: 80px;
            border: 2px dashed #1e3a8a;
            border-radius: 50%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: #1e3a8a;
            font-size: 8px;
            font-weight: bold;
            transform: rotate(-10deg);
          }
          .stamp-inner {
            font-size: 8.5px;
            border-top: 1px solid #1e3a8a;
            border-bottom: 1px solid #1e3a8a;
            padding: 1px 0;
            margin: 2px 0;
          }
          .signature-txt {
            font-family: 'Brush Script MT', cursive, sans-serif;
            font-size: 26px;
            color: #0b131f;
            transform: rotate(-5deg);
            display: inline-block;
            margin-bottom: -5px;
            position: absolute;
            top: -25px;
            left: 60px;
          }
          .footer-line {
            margin-top: 140px;
            border-top: 2px solid #b91c1c;
            padding-top: 8px;
            text-align: center;
            font-size: 10px;
            line-height: 1.4;
            clear: both;
          }
          .footer-line .company-name {
            font-weight: bold;
            font-size: 11.5px;
          }
        </style>
      </head>
      <body>
        <div class="invoice-box">
          <table class="invoice-header-table">
            <tr>
              <td class="header-logo-cell">
                <div class="gps-logo-img">
                  GPS<br/>TRACKER
                </div>
              </td>
              <td class="header-text-cell">
                <h1 class="brand-title">Arshi Enterprises</h1>
                <div class="brand-subtitle">A Complete Security Solution Division</div>
                <div class="brand-contact">Tel.-7782808063, e-mail:- arshiranjeet133@gmail.com</div>
              </td>
              <td class="header-logo-right-cell">
                <div class="logo-circle-ae"></div>
              </td>
            </tr>
          </table>

          <div class="invoice-title">${req.invoiceNo ? 'TAX INVOICE' : 'PERFORMA INVOICE'}</div>

          <table class="meta-table">
            <tr>
              <td style="text-align: left;">
                ${req.invoiceNo ? `Invoice No : ${req.invoiceNo} &nbsp;&nbsp;|&nbsp;&nbsp; ` : ''}PI No : ${piInvoiceNo}
              </td>
              <td style="text-align: right;">Date.- ${piDate}</td>
            </tr>
          </table>

          <table class="to-table">
            <tr>
              <td class="to-label">Name.-</td>
              <td><strong>${customerName}</strong></td>
            </tr>
            <tr>
              <td class="to-label">Address.-</td>
              <td>${customerAddress}</td>
            </tr>
            <tr>
              <td class="to-label">Mob.-</td>
              <td>${customerMob}</td>
            </tr>
            <tr>
              <td class="to-label">GSTIN NO.-</td>
              <td>${customerGstin}</td>
            </tr>
          </table>

          <div class="subject-line">Subject. - Ais140 Vehicle Location Tracking Device (VLTD).</div>
          <div style="font-size: 11.5px; margin-bottom: 10px;">We are pleased to submit you the quotation of <strong>Ais140 Vehicle Location Tracking Device</strong>.</div>

          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 5%;">Sr. No:</th>
                <th style="width: 45%;">Item Description:</th>
                <th style="width: 10%;">Validity</th>
                <th style="width: 8%;">Unit Price</th>
                <th style="width: 8%;">CGST 9%</th>
                <th style="width: 8%;">SGST 9%</th>
                <th style="width: 8%;">Price with GST</th>
                <th style="width: 5%;">Qty</th>
                <th style="width: 10%;">Gross Amt.</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
              <tr class="total-row">
                <td colspan="2" class="text-left" style="border-bottom: none; font-size: 11.5px; font-weight: bold;">Rupees.- <span style="font-weight: 500; font-style: italic;">${amountInWords}</span></td>
                <td colspan="5" style="border-right: none; border-bottom: none;"></td>
                <td style="border-left: none; border-bottom: none; text-align: right; font-weight: bold; border-right: 1px solid #000;">Total Rs.</td>
                <td style="font-weight: bold; border-bottom: none;">${totalAmt.toFixed(2)}</td>
              </tr>
              <tr>
                <td colspan="9" class="text-left" style="font-size: 8.5px; padding: 4px 8px; border-top: 1px solid #000; line-height: 1.35; font-weight: normal; color: #000;">
                  <strong>T&C.-</strong> (1) Multiple Mobile Accs (2) Real time Track your Vehicle Anywhere via your mob. & pc. (3) Direction /Speed & Ignition On/Off Detection. (4) Ignition Cut off Alarm (5) Multiple Geo Fence setup & alarm. (6) Back-up data from 45days to last 90days (7) Moving overview km Per day, Stoy Detail +/-3- Speed Detail's & Alarm Detail's and etc.
                </td>
              </tr>
            </tbody>
          </table>

          <div class="terms-section">
            <div class="terms-title">Terms and Conditions:</div>
            <ul class="terms-list">
              <li>Payment 100% in Advance.</li>
              <li>Goods once sold cannot be taken back.</li>
              <li>Installation Charges (@INR500) is extra applicable per unit. (Installation Price are further negotiable if quantity increases and vehicles are received in Bulk at one location)</li>
              <li>Warranty. - 12 Months from the date of Supply, Warranty applicable before 15days of due date.</li>
              <li>Courier if any to be paid by customer.</li>
              <li>Standard Force Majeure will apply. (No warranty of burnt damaged goods)</li>
              <li>If any service is required during the year, then it's charges @INR500 per unit will be applicable.</li>
            </ul>
          </div>

          <div class="signatory-box">
            Thanking You
            <div style="height: 35px; position: relative; margin-top: 10px;">
              <span class="signature-txt">Sona</span>
              <div class="stamp-container">
                <div class="stamp-circle">
                  <span>Arshi Ent.</span>
                  <div class="stamp-inner">GPS Tracker</div>
                  <span>7782808063</span>
                </div>
              </div>
            </div>
            <strong>Arshi Enterprises</strong><br/>
            <span style="font-size: 9.5px; opacity: 0.85;">(Authorized Signatory)</span>
          </div>

          <div class="footer-line">
            <div class="company-name">M/s Arshi Enterprises</div>
            A Channel Partner of "Arshi" GPS Tracker.<br/>
            Supplier & Retailer of GPS Vehicle Tracker, CCTV Surveillance Systems, Mobile / Electronics & IT Equipments.<br/>
            Office:- Shop No.-4, Near- Brajesh Automobiles, N. H.- 231, Maranga, Purnia 854 301. (BIHAR)
          </div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `);
    
    printWindow.document.close();
  };

  const totalPages = Math.ceil(totalCount / limit) || 1;

  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      let start = Math.max(2, page - 2);
      let end = Math.min(totalPages - 1, page + 2);
      
      if (page <= 4) {
        end = 5;
      } else if (page >= totalPages - 3) {
        start = totalPages - 4;
      }
      
      if (start > 2) {
        pages.push('...');
      }
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (end < totalPages - 1) {
        pages.push('...');
      }
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="invoice-generator-panel">
      {/* Header bar */}
      <div className="ig-header">
        <span className="ig-title">
          <FaFileInvoiceDollar style={{ marginRight: '8px', color: 'var(--accent-color)' }} />
          Invoice & Billing Generator
        </span>
      </div>

      {/* Main Form */}
      <div className="ig-form-container">
        <form onSubmit={handleSingleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Section 1: Customer & Billing Info */}
          <div className="form-section-title">1. Customer & Billing Info</div>
          <div className="ig-grid-inputs">
            <div className="form-field">
              <label>Customer Name*</label>
              <input 
                type="text" 
                value={endCustomerName}
                onChange={(e) => setEndCustomerName(e.target.value)}
                placeholder="Enter Customer Name"
                required
              />
            </div>

            <div className="form-field">
              <label>Registered Mobile (RMN)*</label>
              <input 
                type="text" 
                value={rmn}
                onChange={(e) => setRmn(e.target.value)}
                placeholder="Enter Mobile No."
                required
              />
            </div>

            <div className="form-field" style={{ gridColumn: 'span 2' }}>
              <label>Address*</label>
              <input 
                type="text" 
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Enter Billing Address"
                required
              />
            </div>

            <div className="form-field">
              <label>GSTIN / POA Number*</label>
              <input 
                type="text" 
                value={poaNo}
                onChange={(e) => setPoaNo(e.target.value)}
                placeholder="Enter GSTIN or Aadhaar No."
                required
              />
            </div>

            <div className="form-field">
              <label>Address Proof Type</label>
              <select 
                value={proofOfAddress}
                onChange={(e) => setProofOfAddress(e.target.value)}
              >
                <option value="GST Certificate">GST Certificate</option>
                <option value="Aadhaar Card">Aadhaar Card</option>
                <option value="Voter ID">Voter ID</option>
                <option value="Driving License">Driving License</option>
              </select>
            </div>

            <div className="form-field">
              <label>PI Number</label>
              <input 
                type="text" 
                value={piNo}
                readOnly
                placeholder="Generating..."
                style={{ backgroundColor: '#f1f5f9', cursor: 'not-allowed' }}
              />
            </div>

            <div className="form-field">
              <label>Invoice Number</label>
              <input 
                type="text" 
                value={invoiceNo}
                readOnly
                placeholder="Generating..."
                style={{ backgroundColor: '#f1f5f9', cursor: 'not-allowed' }}
              />
            </div>
          </div>

          {/* Section 2: Items Builder */}
          <div className="form-section-title">2. Invoice Items & Charges Details</div>
          <div className="items-builder-container" style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '15px', background: '#fafafa' }}>
            <table className="items-builder-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #ddd', background: '#f1f5f9' }}>
                  <th style={{ width: '45%', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Item Description*</th>
                  <th style={{ width: '15%', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Validity*</th>
                  <th style={{ width: '12%', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Unit Price*</th>
                  <th style={{ width: '10%', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>CGST%</th>
                  <th style={{ width: '10%', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>SGST%</th>
                  <th style={{ width: '8%', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Qty*</th>
                  <th style={{ width: '5%', padding: '8px', textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '6px' }}>
                      <textarea 
                        value={item.description}
                        onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                        placeholder="e.g. iTriangle (Bharat101 Plus) Ais140 2G..."
                        rows="2"
                        required
                        style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontSize: '12px', padding: '5px', border: '1px solid #ccc', borderRadius: '3px' }}
                      />
                    </td>
                    <td style={{ padding: '6px' }}>
                      <input 
                        type="text" 
                        value={item.validity}
                        onChange={(e) => handleItemChange(idx, 'validity', e.target.value)}
                        placeholder="e.g. 12 Month"
                        required
                        style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px', padding: '5px', border: '1px solid #ccc', borderRadius: '3px' }}
                      />
                    </td>
                    <td style={{ padding: '6px' }}>
                      <input 
                        type="number" 
                        value={item.unitPrice}
                        onChange={(e) => handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                        placeholder="4300"
                        required
                        style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px', padding: '5px', border: '1px solid #ccc', borderRadius: '3px' }}
                      />
                    </td>
                    <td style={{ padding: '6px' }}>
                      <input 
                        type="number" 
                        value={item.cgst}
                        onChange={(e) => handleItemChange(idx, 'cgst', parseFloat(e.target.value) || 0)}
                        placeholder="9"
                        required
                        style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px', padding: '5px', border: '1px solid #ccc', borderRadius: '3px' }}
                      />
                    </td>
                    <td style={{ padding: '6px' }}>
                      <input 
                        type="number" 
                        value={item.sgst}
                        onChange={(e) => handleItemChange(idx, 'sgst', parseFloat(e.target.value) || 0)}
                        placeholder="9"
                        required
                        style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px', padding: '5px', border: '1px solid #ccc', borderRadius: '3px' }}
                      />
                    </td>
                    <td style={{ padding: '6px' }}>
                      <input 
                        type="number" 
                        value={item.qty}
                        onChange={(e) => handleItemChange(idx, 'qty', parseInt(e.target.value) || 1)}
                        placeholder="1"
                        required
                        style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px', padding: '5px', border: '1px solid #ccc', borderRadius: '3px' }}
                      />
                    </td>
                    <td style={{ padding: '6px', textAlign: 'center' }}>
                      <button 
                        type="button" 
                        className="btn-remove-item"
                        onClick={() => handleRemoveItem(idx)}
                        title="Delete Item"
                        style={{
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          width: '24px',
                          height: '24px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold',
                          fontSize: '14px'
                        }}
                      >
                        &times;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button 
              type="button" 
              className="btn-add-item" 
              onClick={handleAddItem}
              style={{
                marginTop: '10px',
                background: 'var(--primary-blue)',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                padding: '6px 12px',
                fontSize: '11.5px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              + Add Item Row
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '15px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontWeight: '800', color: 'var(--primary-blue)', fontSize: '13px' }}>
              Total Invoice Amount: ₹{totalInvoiceValue.toFixed(2)}
            </span>
          </div>

          {/* Section 3: Vehicle & Device Info (Optional/Subdealer) */}
          <div className="form-section-title">3. Vehicle & KYC details (Optional)</div>
          <div className="ig-grid-inputs">
            <div className="form-field">
              <label>Vehicle Number</label>
              <input 
                type="text" 
                value={vehicleNo}
                onChange={(e) => setVehicleNo(e.target.value)}
                placeholder="e.g. RJ14-GA-1234"
              />
            </div>

            <div className="form-field">
              <label>Engine Number</label>
              <input 
                type="text" 
                value={engineNo}
                onChange={(e) => setEngineNo(e.target.value)}
                placeholder="Enter Engine No."
              />
            </div>

            <div className="form-field">
              <label>Chassis Number</label>
              <input 
                type="text" 
                value={chassisNo}
                onChange={(e) => setChassisNo(e.target.value)}
                placeholder="Enter Chassis No."
              />
            </div>

            <div className="form-field">
              <label>Search IMEI/ICCID</label>
              <input 
                type="text" 
                value={searchImei}
                onChange={(e) => setSearchImei(e.target.value)}
                placeholder="Enter Device IMEI"
              />
            </div>

            <div className="form-field">
              <label>Vehicle Condition</label>
              <select 
                value={vehicleTypeOldNew}
                onChange={(e) => setVehicleTypeOldNew(e.target.value)}
              >
                <option value="New">New</option>
                <option value="Old">Old</option>
              </select>
            </div>

            <div className="form-field">
              <label>Vehicle Make</label>
              <input 
                type="text" 
                value={vehicleMake}
                onChange={(e) => setVehicleMake(e.target.value)}
                placeholder="e.g. Tata Motors"
              />
            </div>

            <div className="form-field">
              <label>Vehicle Model</label>
              <input 
                type="text" 
                value={vehicleModel}
                onChange={(e) => setVehicleModel(e.target.value)}
                placeholder="e.g. LPT 1613"
              />
            </div>

            <div className="form-field">
              <label>RTO State</label>
              <input 
                type="text" 
                value={rtoState}
                onChange={(e) => setRtoState(e.target.value)}
                placeholder="e.g. Rajasthan"
              />
            </div>
          </div>

          <button 
            type="submit" 
            className="btn-ig-submit"
            disabled={singleSubmitting}
            style={{
              background: 'var(--accent-color)',
              color: 'var(--sidebar-bg)',
              border: 'none',
              padding: '12px 25px',
              fontSize: '13px',
              fontWeight: '800',
              borderRadius: '4px',
              cursor: 'pointer',
              alignSelf: 'flex-start',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              boxShadow: '0 4px 6px rgba(245, 158, 11, 0.25)'
            }}
          >
            {singleSubmitting ? 'Generating...' : 'Save & Generate Invoice'}
          </button>
        </form>
      </div>

      {/* Generated Invoices Table */}
      <div className="ig-table-panel" style={{ marginTop: '30px' }}>
        <div className="ig-table-header" style={{ background: 'var(--sidebar-bg)', color: 'white', padding: '12px 20px', fontSize: '13px', fontWeight: '800', borderBottom: '2px solid var(--accent-color)', borderTopLeftRadius: '4px', borderTopRightRadius: '4px' }}>
          Saved Invoices List
        </div>

        <div className="ig-table-filters" style={{ padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white' }}>
          <div className="show-entries" style={{ fontSize: '12px', color: '#676a6c' }}>
            Show 
            <select value={limit} onChange={(e) => { setLimit(parseInt(e.target.value)); setPage(1); }} style={{ margin: '0 8px', padding: '4px', border: '1px solid #ccc', borderRadius: '3px' }}>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
            </select> 
            entries
          </div>

          <div className="search-entries" style={{ fontSize: '12px', color: '#676a6c' }}>
            Search: 
            <input 
              type="text" 
              value={search} 
              onChange={(e) => { setSearch(e.target.value); setPage(1); }} 
              placeholder="Search invoices..."
              style={{ marginLeft: '8px', padding: '5px 10px', border: '1px solid #ccc', borderRadius: '3px' }}
            />
          </div>
        </div>

        <div className="table-responsive" style={{ background: 'white' }}>
          {loading ? (
            <div style={{ padding: '30px', textAlign: 'center', fontSize: '13px', color: '#666' }}>
              <FaSpinner className="spin" style={{ marginRight: '8px' }} /> Loading invoices...
            </div>
          ) : (
            <table className="ig-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #ddd', background: '#f8fafc' }}>
                  <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: '700' }}>SI No.</th>
                  <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: '700' }}>Date</th>
                  <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: '700' }}>PI/Invoice ID</th>
                  <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: '700' }}>Customer Name</th>
                  <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: '700' }}>RMN</th>
                  <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: '700' }}>GSTIN/POA</th>
                  <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: '700' }}>Total Value</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', fontWeight: '700' }}>Download</th>
                </tr>
              </thead>
              <tbody>
                {requests.length > 0 ? (
                  requests.map((req, index) => (
                    <tr key={req._id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '10px' }}>{((page - 1) * limit) + index + 1}</td>
                      <td style={{ padding: '10px' }}>{new Date(req.dateTime).toLocaleDateString()}</td>
                      <td style={{ padding: '10px', color: 'var(--primary-blue)', fontWeight: 'bold' }}>{req.piNo || 'AE-01'}</td>
                      <td style={{ padding: '10px', fontWeight: '600' }}>{req.endCustomerName || 'JYOTI CONSTRUCTION'}</td>
                      <td style={{ padding: '10px' }}>{req.rmn || '--'}</td>
                      <td style={{ padding: '10px' }}>{req.poaNo || '--'}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold' }}>₹{req.piValue ? req.piValue.toFixed(2) : '0.00'}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <button 
                          className="btn-download-pdf"
                          onClick={() => handleDownloadInvoice(req)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#337ab7',
                            textDecoration: 'underline',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          Print / PDF
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '20px', color: '#999', fontStyle: 'italic' }}>
                      No invoices available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {totalCount > 0 && (
          <div className="requests-footer" style={{ padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', borderBottomLeftRadius: '4px', borderBottomRightRadius: '4px', borderTop: '1px solid #eee' }}>
            <div className="records-info" style={{ fontSize: '11.5px', color: '#666' }}>
              Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, totalCount)} of {totalCount} records
            </div>

            <div className="pagination" style={{ display: 'flex', gap: '5px' }}>
              <div 
                className={`pagination-item ${page === 1 ? 'disabled' : ''}`}
                onClick={() => page > 1 && setPage(page - 1)}
                style={{ padding: '5px 10px', border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', background: page === 1 ? '#f5f5f5' : 'white', opacity: page === 1 ? 0.6 : 1 }}
              >
                Previous
              </div>

              {getPageNumbers().map((p, idx) => (
                p === '...' ? (
                  <span key={`ell-${idx}`} style={{ padding: '5px 10px', color: '#888' }}>...</span>
                ) : (
                  <div 
                    key={p}
                    className={`pagination-item ${page === p ? 'active' : ''}`}
                    onClick={() => setPage(p)}
                    style={{
                      padding: '5px 10px',
                      border: '1px solid #ccc',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      background: page === p ? 'var(--primary-blue)' : 'white',
                      color: page === p ? 'white' : 'black',
                      fontWeight: page === p ? 'bold' : 'normal'
                    }}
                  >
                    {p}
                  </div>
                )
              ))}

              <div 
                className={`pagination-item ${page === totalPages ? 'disabled' : ''}`}
                onClick={() => page < totalPages && setPage(page + 1)}
                style={{ padding: '5px 10px', border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', background: page === totalPages ? '#f5f5f5' : 'white', opacity: page === totalPages ? 0.6 : 1 }}
              >
                Next
              </div>
            </div>
          </div>
        )}
      </div>

      {credentialsToShow && (
        <div className="credentials-modal-overlay">
          <div className="credentials-modal">
            <div className="credentials-modal-header">
              <h3>Customer Login Created</h3>
              <button 
                className="credentials-modal-close" 
                onClick={() => setCredentialsToShow(null)}
              >
                &times;
              </button>
            </div>
            <div className="credentials-modal-body">
              <p>A login ID has been successfully generated for the customer:</p>
              <div className="credentials-info-box">
                <div className="credentials-row">
                  <span className="credentials-label">Login ID (RMN):</span>
                  <span className="credentials-value">{credentialsToShow.username}</span>
                </div>
                <div className="credentials-row">
                  <span className="credentials-label">Password:</span>
                  <span className="credentials-value">{credentialsToShow.password}</span>
                </div>
              </div>
              <p style={{ fontSize: '11px', color: '#64748b', marginTop: '10px' }}>
                Note: The customer can use these credentials to log in, access their dashboard, and download their bills.
              </p>
              <div className="credentials-btn-row">
                <button 
                  className="credentials-btn copy"
                  onClick={() => {
                    navigator.clipboard.writeText(`Customer Login Details:\nLogin ID: ${credentialsToShow.username}\nPassword: ${credentialsToShow.password}`);
                    alert('Copied to clipboard!');
                  }}
                >
                  Copy Details
                </button>
                <button 
                  className="credentials-btn close"
                  onClick={() => setCredentialsToShow(null)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceGenerator;
