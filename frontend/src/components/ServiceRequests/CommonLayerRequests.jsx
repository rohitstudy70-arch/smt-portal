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

    const formatCurrencyIG = (val) => {
      return new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(val);
    };

    let itemsHtml = '';
    let subtotal = 0;
    let sgstTotal = 0;
    let cgstTotal = 0;
    let totalAmt = 0;
    let itemCount = 0;

    if (req.items && req.items.length > 0) {
      itemCount = req.items.length;
      itemsHtml = req.items.map((item, index) => {
        const unitPrice = parseFloat(item.unitPrice) || 0;
        const cgstRate = parseFloat(item.cgst) || 0;
        const sgstRate = parseFloat(item.sgst) || 0;
        const qty = parseInt(item.qty) || 0;

        const itemSubtotal = unitPrice * qty;
        subtotal += itemSubtotal;
        
        const cgstAmt = (itemSubtotal * cgstRate) / 100;
        const sgstAmt = (itemSubtotal * sgstRate) / 100;
        cgstTotal += cgstAmt;
        sgstTotal += sgstAmt;

        const totalWithGst = Math.round(unitPrice + (unitPrice * cgstRate / 100) + (unitPrice * sgstRate / 100)) * qty;

        return `
          <tr>
            <td style="text-align:center">${index + 1}</td>
            <td class="desc">${item.description.replace(/\n/g, '<br/>')}</td>
            <td class="num">${qty}</td>
            <td class="num">${formatCurrencyIG(unitPrice)}</td>
            <td class="num">${cgstRate + sgstRate}%</td>
            <td class="num">${formatCurrencyIG(totalWithGst)}</td>
          </tr>
        `;
      }).join('');
      
      subtotal = Math.round(subtotal);
      cgstTotal = Math.round(cgstTotal);
      sgstTotal = Math.round(sgstTotal);
      totalAmt = req.piValue || Math.round(subtotal + cgstTotal + sgstTotal);
    } else {
      const is2Years = req.validity === '2 Years' || req.validity === '24 Month';
      const is5Years = req.validity === '5 Years' || req.validity === '60 Month';
      
      let unitPrice = 4300;
      let cgstRate = 9;
      let sgstRate = 9;
      let validityPeriod = '12 Month';
      
      if (is2Years) {
        unitPrice = 5600;
        validityPeriod = '24 Month';
      } else if (is5Years) {
        unitPrice = 10000;
        validityPeriod = '60 Month';
      }
      
      // Item 1
      const qty1 = 1;
      const subtotal1 = unitPrice * qty1;
      const cgstAmt1 = (subtotal1 * cgstRate) / 100;
      const sgstAmt1 = (subtotal1 * sgstRate) / 100;
      const totalWithGst1 = Math.round(unitPrice + (unitPrice * cgstRate / 100) + (unitPrice * sgstRate / 100)) * qty1;

      // Item 2 (Installation)
      const unitPrice2 = 400;
      const qty2 = 1;
      const subtotal2 = unitPrice2 * qty2;
      const cgstAmt2 = (subtotal2 * cgstRate) / 100;
      const sgstAmt2 = (subtotal2 * sgstRate) / 100;
      const totalWithGst2 = Math.round(unitPrice2 + (unitPrice2 * cgstRate / 100) + (unitPrice2 * sgstRate / 100)) * qty2;

      subtotal = Math.round(subtotal1 + subtotal2);
      cgstTotal = Math.round(cgstAmt1 + cgstAmt2);
      sgstTotal = Math.round(sgstAmt1 + sgstAmt2);
      totalAmt = Math.round(totalWithGst1 + totalWithGst2);
      itemCount = 2;

      itemsHtml = `
        <tr>
          <td style="text-align:center">1</td>
          <td class="desc">iTriangle (Bharat101 Plus) Ais140 ${is2Years ? '_2G' : is5Years ? '_5G' : '2G'}<br/><small style="color: #555;">VLTD Device including Dual profile E-sim & Software + 01 Panic Switch (Validity: ${validityPeriod})</small></td>
          <td class="num">${qty1}</td>
          <td class="num">${formatCurrencyIG(unitPrice)}</td>
          <td class="num">${cgstRate + sgstRate}%</td>
          <td class="num">${formatCurrencyIG(totalWithGst1)}</td>
        </tr>
        <tr>
          <td style="text-align:center">2</td>
          <td class="desc">Installation<br/><small style="color: #555;">One Time Installation Charges</small></td>
          <td class="num">${qty2}</td>
          <td class="num">${formatCurrencyIG(unitPrice2)}</td>
          <td class="num">${cgstRate + sgstRate}%</td>
          <td class="num">${formatCurrencyIG(totalWithGst2)}</td>
        </tr>
      `;
    }

    // Add empty rows if needed (minimum 4 rows)
    const minRows = 4;
    if (itemCount < minRows) {
      for (let i = itemCount; i < minRows; i++) {
        itemsHtml += `<tr class="empty-row"><td style="text-align:center">-</td><td class="desc">-</td><td class="num">-</td><td class="num">-</td><td class="num">-</td><td class="num">-</td></tr>`;
      }
    }

    const amountInWords = numberToWords(totalAmt);

    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) {
      alert('Popup blocker enabled. Please allow popups to download/print the invoice.');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
      <meta charset="UTF-8">
      <title>Arshi GPS – Proforma Invoice</title>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Nunito+Sans:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        :root{
          --teal:#007B8A;--teal-dark:#005a66;--teal-light:#E0F4F7;--teal-mid:#b2e4ec;
          --accent:#f0a500;--bg:#eef4f6;--white:#ffffff;--text:#1a2a30;--muted:#5a7a82;--border:#cce4e8
        }
        body{font-family:'Nunito Sans',sans-serif;background:#fff;color:var(--text);padding:20px;min-height:100vh;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}

        /* Page */
        .page{background:var(--white);max-width:794px;margin:0 auto;border-radius:12px;overflow:hidden;border:1px solid var(--border)}

        /* Header */
        .header{background:var(--teal);padding:28px 36px 22px;display:flex;justify-content:space-between;align-items:flex-start;gap:20px}
        .brand-name{font-family:'Nunito',sans-serif;font-size:34px;font-weight:800;color:#fff;letter-spacing:-0.5px}
        .brand-sub{color:rgba(255,255,255,0.75);font-size:13px;margin-top:4px;line-height:1.65}
        .invoice-title-block{text-align:right;flex-shrink:0}
        .inv-label{font-family:'Nunito',sans-serif;font-size:22px;font-weight:800;color:#fff;letter-spacing:1px;text-transform:uppercase}
        .inv-meta{color:rgba(255,255,255,0.80);font-size:12.5px;margin-top:7px;line-height:1.75}

        /* Accent bar */
        .accent-bar{height:5px;background:linear-gradient(90deg,var(--accent) 0%,#f5d26e 50%,var(--teal-mid) 100%)}

        /* Info grid */
        .info-grid{display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1.5px solid var(--border)}
        .info-box{padding:16px 20px;border-right:1px solid var(--border)}
        .info-box:last-child{border-right:none}
        .info-box-head{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--teal);margin-bottom:9px;display:flex;align-items:center;gap:6px}
        .info-box-head::before{content:'';display:inline-block;width:3px;height:12px;background:var(--accent);border-radius:2px}
        .info-box p{font-size:12.5px;color:var(--text);line-height:1.65}
        .co-name{font-weight:700;font-size:13px;color:var(--text);margin-bottom:3px}

        /* Table */
        .table-wrap{padding:0 28px}
        table{width:100%;border-collapse:collapse;margin-top:22px}
        thead tr{background:var(--teal)}
        thead th{color:#fff;font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;padding:11px 12px}
        thead th:first-child{border-radius:6px 0 0 0;padding-left:16px}
        thead th:last-child{border-radius:0 6px 0 0}
        tbody tr{border-bottom:1px solid var(--border)}
        td{padding:12px 12px;font-size:13px;vertical-align:top}
        td:first-child{padding-left:16px}
        td.desc{min-width:180px;word-break:break-word;text-align:left}
        td.num{text-align:right}
        .empty-row td{height:34px;color:transparent;user-select:none}
        .sub-row td{background:var(--teal-light);font-weight:700;font-size:13px;color:var(--teal-dark);border-top:2px solid var(--teal-mid)}

        /* Bottom */
        .bottom{display:grid;grid-template-columns:1fr 1fr;gap:0;margin-top:20px;padding:0 28px 26px;align-items:start}
        .amount-words{font-size:12.5px;color:var(--text);margin-bottom:14px;line-height:1.6}
        .amount-words strong{color:var(--teal-dark)}
        .section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--teal);margin-bottom:10px;display:flex;align-items:center;gap:6px}
        .section-title::before{content:'';display:inline-block;width:3px;height:11px;background:var(--accent);border-radius:2px}
        .tc-list{list-style:none;padding:0;margin-bottom:18px}
        .tc-list li{font-size:11.5px;color:#2a4a52;line-height:1.65;padding:3px 0 3px 20px;position:relative}
        .tc-list li::before{content:attr(data-n);position:absolute;left:0;font-weight:700;color:var(--teal);font-size:11px}
        .bank-row{font-size:12px;color:var(--muted);padding:4px 0;display:flex;gap:8px;align-items:center}
        .bank-row span:first-child{font-weight:600;color:var(--text);min-width:115px}
        .bank-row input{border:none;border-bottom:1.5px dashed var(--border);background:transparent;font-size:12px;color:var(--text);width:160px;outline:none;font-family:inherit;padding:1px 2px}
        .bank-row input:focus{border-color:var(--teal)}

        /* Tax block */
        .tax-block{padding-left:26px;border-left:1.5px solid var(--border)}
        .tax-row{display:flex;justify-content:space-between;font-size:12.5px;padding:4.5px 0;border-bottom:1px solid #eef4f6;color:var(--text)}
        .tax-row:last-child{border-bottom:none}
        .tax-row.hl{color:var(--teal-dark);font-weight:700}
        .total-box{background:var(--teal);border-radius:8px;padding:15px 18px;margin-top:14px;text-align:center}
        .total-label{color:rgba(255,255,255,0.8);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px}
        .total-amount{color:#fff;font-family:'Nunito',sans-serif;font-size:23px;font-weight:800;letter-spacing:-0.5px}

        /* Footer */
        .footer{margin:16px 28px 22px;padding-top:14px;border-top:1.5px solid var(--border);text-align:center}
        .footer p{font-size:11px;color:var(--muted);line-height:1.5;font-style:italic}

        /* Print */
        @media print{
          body{background:#fff;padding:0;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
          .page{box-shadow:none;border:none;border-radius:0;max-width:100%}
          .bank-row input{border-bottom:1px dashed #aaa}
          tbody tr:hover{background:transparent}
        }
      </style>
      </head>
      <body>

      <div class="page" id="invoice">

        <!-- Header -->
        <div class="header">
          <div>
            <div style="display:flex;align-items:center;gap:12px">
              <div class="brand-name">Arshi GPS</div>
            </div>
            <div class="brand-sub">
              Arshi Enterprises<br>
              Near Brajesh Auto Mobile Maranga,<br>
              Purnea, Bihar, 854304<br>
              GST No: 10ATIPK1589P1ZA
            </div>
          </div>
          <div class="invoice-title-block">
            <div class="inv-label">Proforma Invoice</div>
            <div class="inv-meta">
              Date: ${piDate}<br>
              PI Invoice #: ${piInvoiceNo}
            </div>
          </div>
        </div>

        <!-- Accent bar -->
        <div class="accent-bar"></div>

        <!-- Customer / Ship To / Shipping -->
        <div class="info-grid">
          <div class="info-box">
            <div class="info-box-head">Customer</div>
            <p class="co-name">${customerName}</p>
            <p>${customerAddress}</p>
            <p>GSTIN: ${customerGstin}</p>
          </div>
          <div class="info-box">
            <div class="info-box-head">Ship To</div>
            <p class="co-name">${customerName}</p>
            <p>${customerAddress}</p>
            <p>GSTIN: ${customerGstin}</p>
          </div>
          <div class="info-box">
            <div class="info-box-head">Shipping Details</div>
            <p class="co-name">${customerName}</p>
            <p>${customerAddress}</p>
            <p>Mobile: ${customerMob}</p>
            <p>GSTIN: ${customerGstin}</p>
          </div>
        </div>

        <!-- Items Table -->
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:42px;text-align:center">SL</th>
                <th style="text-align:left">Description</th>
                <th style="width:52px;text-align:right">QTY</th>
                <th style="width:96px;text-align:right">Unit Price</th>
                <th style="width:54px;text-align:right">GST</th>
                <th style="width:104px;text-align:right">Total (Rs)</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
            <tfoot>
              <tr class="sub-row">
                <td colspan="5" style="text-align:right;padding-right:16px;font-size:12px;letter-spacing:0.5px">SubTotal</td>
                <td class="num">${formatCurrencyIG(subtotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- Bottom: Terms + Tax -->
        <div class="bottom">
          <div>
            <div class="amount-words">
              <strong>Amount in Words:</strong> ${amountInWords}
            </div>

            <div class="section-title">Terms &amp; Conditions</div>
            <ul class="tc-list">
              <li data-n="1.">100% Advance payment required.</li>
              <li data-n="2.">Goods once sold cannot be taken back.</li>
              <li data-n="3.">Installation Charges (@INR 500) extra per unit. (Negotiable in bulk orders at one location.)</li>
              <li data-n="4.">Courier charges to be paid by customer.</li>
              <li data-n="5.">Warranty — 12 Months from date of Supply; applicable before 15 days of due date.</li>
              <li data-n="6.">Standard Force Majeure will apply. No warranty on burnt/damaged goods.</li>
              <li data-n="7.">Service during warranty year @INR 500 per unit will be applicable.</li>
            </ul>

            <div class="section-title">Bank Details</div>
            <div class="bank-row"><span>Account Number</span><input type="text" placeholder="_______________"></div>
            <div class="bank-row"><span>Bank &amp; Branch</span><input type="text" placeholder="_______________"></div>
            <div class="bank-row"><span>IFSC Code</span><input type="text" placeholder="_______________"></div>
          </div>

          <div class="tax-block">
            <div class="section-title">Tax Summary</div>
            <div class="tax-row hl"><span>SGST @ 9%</span><span>${formatCurrencyIG(sgstTotal)}</span></div>
            <div class="tax-row hl"><span>CGST @ 9%</span><span>${formatCurrencyIG(cgstTotal)}</span></div>
            <div class="tax-row"><span>IGST @ 18%</span><span>0.00</span></div>
            <div class="tax-row hl"><span>Tax Amount</span><span>${formatCurrencyIG(sgstTotal + cgstTotal)}</span></div>
            
            <div class="total-box">
              <div class="total-label">Total Amount</div>
              <div class="total-amount">INR ${formatCurrencyIG(totalAmt)}</div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="footer">
          <p>This document is computer generated and does not require a signature or stamp to be considered valid.</p>
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
