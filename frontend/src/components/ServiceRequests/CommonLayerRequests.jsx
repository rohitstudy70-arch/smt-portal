import { useState, useEffect } from 'react';
import { FaDownload, FaSpinner } from 'react-icons/fa';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import './CommonLayerRequests.css';

const CommonLayerRequests = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Form State
  const [commonLayer, setCommonLayer] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [validity, setValidity] = useState('');
  const [searchImei, setSearchImei] = useState('');
  const [singleSubmitting, setSingleSubmitting] = useState(false);

  // Bulk Upload State
  const [selectedFile, setSelectedFile] = useState(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

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
    if (!commonLayer) {
      alert('Please select a Common Layer.');
      return;
    }
    if (!vehicleType) {
      alert('Please select a Vehicle Type.');
      return;
    }
    if (!validity) {
      alert('Please select Validity.');
      return;
    }
    if (!searchImei.trim()) {
      alert('Please enter IMEI or ICCID.');
      return;
    }

    setSingleSubmitting(true);
    try {
      await api.post('/common-layer-requests', {
        commonLayer,
        vehicleType,
        validity,
        imei: searchImei,
        iccid: searchImei // Using same value for demo
      });
      setSearchImei('');
      setRefreshTrigger(prev => prev + 1);
      setSingleSubmitting(false);
      alert('Common Layer Request created successfully!');
    } catch (err) {
      console.error('Error submitting CL request:', err);
      setSingleSubmitting(false);
      alert(err.response?.data?.message || 'Failed to submit request.');
    }
  };

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
  };

  const handleBulkUpload = async () => {
    if (!commonLayer) {
      alert('Please select a Common Layer first.');
      return;
    }
    if (!selectedFile) {
      alert('Please select a file to upload.');
      return;
    }

    setBulkSubmitting(true);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('commonLayer', commonLayer);

    try {
      await api.post('/common-layer-requests/bulk', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      setSelectedFile(null);
      document.getElementById('bulk-file-input').value = '';
      setRefreshTrigger(prev => prev + 1);
      setBulkSubmitting(false);
      alert('Bulk requests uploaded successfully!');
    } catch (err) {
      console.error('Error uploading bulk requests:', err);
      setBulkSubmitting(false);
      alert(err.response?.data?.message || 'Failed to upload bulk requests.');
    }
  };

  const handleDownloadFormat = () => {
    const headers = [
      'SR_NO',
      'DEVICE_IMEI*',
      'ENGINE_NO*',
      'CHASSIS_NO*',
      'Vehicle type Old/New*',
      'Vehicle Make/Manufacturer*',
      'Vehicle Model*',
      'End_Customer_NAME*',
      'Registerd Mobile no. (RMN)*',
      'RTO State',
      'RTO No.(In which RTO vehicle go for registration)*',
      'Address*',
      'PROOF OF ADDRESS*',
      'POA No*',
      'PROOF OF IDENTITY',
      'POI No',
      'Vehicle No*'
    ];
    
    const sampleRow = [
      '1',
      '350000000000001',
      'ENG1234567',
      'CHA9876543210',
      'New',
      'Tata Motors',
      'LPT 1613',
      'Rajesh Sharma',
      '9876543210',
      'Rajasthan',
      'RJ14-GA-1234',
      '12, Malviya Nagar, Jaipur',
      'Aadhaar Card',
      '4521-7890-1234',
      'PAN Card',
      'BPKPS1234K',
      'RJ14-GA-1234'
    ];

    // Build CSV content (handling comma in fields correctly by wrapping in quotes)
    const formattedRow = sampleRow.map(field => `"${field.replace(/"/g, '""')}"`);
    const csvContent = [headers.join(','), formattedRow.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'kyc_common_layer_format.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
            color: #b91c1c; /* Crimson Red */
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
            background-color: #0070c0; /* Slate Blue */
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
          <!-- Header Area -->
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

          <!-- Title -->
          <div class="invoice-title">${req.invoiceNo ? 'TAX INVOICE' : 'PERFORMA INVOICE'}</div>

          <!-- Metadata -->
          <table class="meta-table">
            <tr>
              <td style="text-align: left;">
                ${req.invoiceNo ? `Invoice No : ${req.invoiceNo} &nbsp;&nbsp;|&nbsp;&nbsp; ` : ''}PI No : ${piInvoiceNo}
              </td>
              <td style="text-align: right;">Date.- ${piDate}</td>
            </tr>
          </table>

          <!-- Billing Info -->
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

          <!-- Subject -->
          <div class="subject-line">Subject. - Ais140 Vehicle Location Tracking Device (VLTD).</div>
          <div style="font-size: 11.5px; margin-bottom: 10px;">We are pleased to submit you the quotation of <strong>Ais140 Vehicle Location Tracking Device</strong>.</div>

          <!-- Items Table -->
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

          <!-- Terms -->
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

          <!-- Signatory Box -->
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

          <!-- Footer Area -->
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
    <div className="cl-panel">
      {/* Header bar */}
      <div className="cl-header">
        <span className="cl-title">
          {user?.userType === 'End Customer' ? 'My Invoices & Bills' : 'Customer Common Layer Request'}
        </span>
        {user?.userType !== 'End Customer' && (
          <button 
            className="btn-download-format"
            onClick={handleDownloadFormat}
          >
            Download Format <FaDownload />
          </button>
        )}
      </div>

      {/* Main Request Form */}
      {user?.userType !== 'End Customer' && (
        <div className="cl-form-container">
          <div className="cl-select-group">
            <label htmlFor="common-layer-select">Select Common Layer*</label>
            <select 
              id="common-layer-select"
              value={commonLayer}
              onChange={(e) => setCommonLayer(e.target.value)}
            >
              <option value="">--Select--</option>
              <option value="BSNL CL">BSNL CL</option>
              <option value="Jio CL">Jio CL</option>
              <option value="Airtel CL">Airtel CL</option>
            </select>
          </div>

          <div className="cl-methods-grid">
            {/* Single Request Form */}
            <div className="method-box">
              <h4 className="method-title">Single Request</h4>
              <form onSubmit={handleSingleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div className="cl-row-inputs" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div className="form-field">
                    <label>Vehicle Type*</label>
                    <select 
                      value={vehicleType}
                      onChange={(e) => setVehicleType(e.target.value)}
                      required
                      style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px', padding: '6px 10px', border: '1px solid #ccc', borderRadius: '3px' }}
                    >
                      <option value="">--Select--</option>
                      <option value="Car">Car</option>
                      <option value="Truck">Truck</option>
                      <option value="Bike">Bike</option>
                      <option value="Bus">Bus</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label>Validity*</label>
                    <select
                      value={validity}
                      onChange={(e) => setValidity(e.target.value)}
                      required
                      style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px', padding: '6px 10px', border: '1px solid #ccc', borderRadius: '3px' }}
                    >
                      <option value="">--Select--</option>
                      <option value="1 Year">1 Year</option>
                      <option value="2 Years">2 Years</option>
                      <option value="5 Years">5 Years</option>
                    </select>
                  </div>
                </div>

                <div className="form-field">
                  <label>Search IMEI/ICCID*</label>
                  <input 
                    type="text" 
                    value={searchImei}
                    onChange={(e) => setSearchImei(e.target.value)}
                    placeholder="Enter IMEI or ICCID number"
                    required
                    style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px', padding: '6px 10px', border: '1px solid #ccc', borderRadius: '3px' }}
                  />
                </div>

                <button 
                  type="submit" 
                  className="btn-cl-submit"
                  disabled={singleSubmitting}
                  style={{
                    background: 'var(--primary-blue)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    alignSelf: 'flex-start'
                  }}
                >
                  {singleSubmitting ? 'Submitting...' : 'Submit'}
                </button>
              </form>
            </div>

            {/* Bulk Request Form */}
            <div className="method-box">
              <h4 className="method-title">Bulk Request</h4>
              <div className="bulk-upload-box" style={{ display: 'flex', alignItems: 'center', gap: '15px', border: '1px solid #ddd', background: '#fafafa', padding: '15px', borderRadius: '4px' }}>
                <input 
                  type="file" 
                  id="bulk-file-input"
                  onChange={handleFileChange}
                  accept=".csv,.xlsx"
                  style={{ fontSize: '12px' }}
                />
                <button 
                  className="btn-upload"
                  onClick={handleBulkUpload}
                  disabled={bulkSubmitting}
                  style={{
                    background: '#e6e6e6',
                    border: '1px solid #adadad',
                    color: '#333',
                    padding: '6px 15px',
                    fontSize: '12px',
                    borderRadius: '3px',
                    cursor: 'pointer'
                  }}
                >
                  {bulkSubmitting ? 'Uploading...' : 'Upload'}
                </button>
              </div>
              <p className="red-notice" style={{ fontSize: '11px', color: '#d9534f', fontWeight: 'bold', marginTop: '5px' }}>Note: Make sure to select Common Layer before uploading!</p>
            </div>
          </div>
        </div>
      )}

      {/* Blue Instruction notice */}
      {user?.userType !== 'End Customer' && (
        <div className="blue-instruction">
          1) Select Project Name and search the IMEI to create a request.
        </div>
      )}

      {/* Common Layer Request List Table */}
      <div className="cl-table-panel">
        <div className="cl-table-header">
          {user?.userType === 'End Customer' ? 'My Invoices' : 'Common Layer Request'}
        </div>

        <div className="cl-table-filters">
          <div className="show-entries">
            Show 
            <select value={limit} onChange={(e) => { setLimit(parseInt(e.target.value)); setPage(1); }}>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
            </select> 
            entries
          </div>

          <div className="search-entries">
            Search: 
            <input 
              type="text" 
              value={search} 
              onChange={(e) => { setSearch(e.target.value); setPage(1); }} 
              placeholder="Search request table..."
            />
          </div>
        </div>

        <div className="table-responsive">
          {loading ? (
            <div style={{ padding: '30px', textAlign: 'center', fontSize: '13px', color: '#666' }}>
              <FaSpinner className="spin" style={{ marginRight: '8px' }} /> Loading common layer requests...
            </div>
          ) : (
            <table className="cl-table">
              <thead>
                <tr>
                  <th>SI No.</th>
                  <th>DateTime</th>
                  <th>Request ID</th>
                  <th>Is subdealer</th>
                  <th>Sub Dealer Name</th>
                  <th>Common Layer</th>
                  <th>PI No</th>
                  <th>PI Value</th>
                  <th>PI</th>
                  <th>Invoice No</th>
                  <th>Download of Invoice</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {requests.length > 0 ? (
                  requests.map((req, index) => (
                    <tr key={req._id}>
                      <td>{((page - 1) * limit) + index + 1}</td>
                      <td>{new Date(req.dateTime).toLocaleString()}</td>
                      <td style={{ color: '#337ab7', fontWeight: '600' }}>{req.requestId}</td>
                      <td>{req.isSubDealer ? 'Yes' : 'No'}</td>
                      <td>{req.subDealerName || '--'}</td>
                      <td>{req.commonLayer || '--'}</td>
                      <td>{req.piNo || '--'}</td>
                      <td>{req.piValue ? req.piValue.toFixed(2) : '--'}</td>
                      <td>{req.piNo ? 'PI Generated' : '--'}</td>
                      <td>{req.invoiceNo || '--'}</td>
                      <td>
                        {(req.invoiceNo || req.piNo) ? (
                          <span 
                            style={{ color: '#337ab7', cursor: 'pointer', textDecoration: 'underline' }}
                            onClick={() => handleDownloadInvoice(req)}
                          >
                            Download
                          </span>
                        ) : '--'}
                      </td>
                      <td>
                        <span className={`status-badge ${req.status.toLowerCase()}`}>
                          {req.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="12" style={{ textAlign: 'center', padding: '20px', color: '#999', fontStyle: 'italic' }}>
                      No data available in table
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {totalCount > 0 && (
          <div className="requests-footer">
            <div className="records-info">
              Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, totalCount)} of {totalCount} records
            </div>

            <div className="pagination">
              <div 
                className={`pagination-item ${page === 1 ? 'disabled' : ''}`}
                onClick={() => page > 1 && setPage(page - 1)}
              >
                Previous
              </div>

              {getPageNumbers().map((p, idx) => (
                p === '...' ? (
                  <span key={`ell-${idx}`} className="pagination-ellipsis" style={{ padding: '6px 12px', color: '#888', background: 'transparent', display: 'inline-block' }}>
                    ...
                  </span>
                ) : (
                  <div 
                    key={p}
                    className={`pagination-item ${page === p ? 'active' : ''}`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </div>
                )
              ))}

              <div 
                className={`pagination-item ${page === totalPages ? 'disabled' : ''}`}
                onClick={() => page < totalPages && setPage(page + 1)}
              >
                Next
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CommonLayerRequests;
