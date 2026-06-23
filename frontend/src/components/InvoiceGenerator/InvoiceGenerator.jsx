import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaDownload, FaSpinner, FaFileInvoiceDollar, FaPlus, FaTrash, FaEye } from 'react-icons/fa';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { INVOICE_LOGO } from '../../utils/invoiceLogo';
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
  const [isSubDealer, setIsSubDealer] = useState(false);
  const [subDealerName, setSubDealerName] = useState('');
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
      const response = await api.get('/invoices/next-pi-no');
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

  // Auto-fetch customer details by RMN
  useEffect(() => {
    if (rmn && rmn.length === 10) {
      const fetchCustomerInfo = async () => {
        try {
          const res = await api.get(`/activation-requests/customer/${rmn}`);
          if (res.data) {
            setEndCustomerName(prev => prev || res.data.customerName || '');
            setAddress(prev => prev || res.data.address || '');
            setPoaNo(prev => prev || res.data.aadharNo || '');
          }
        } catch (error) {
          // Ignore if not found
        }
      };
      fetchCustomerInfo();
    }
  }, [rmn]);

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        setLoading(true);
        const response = await api.get('/invoices', {
          params: { page, limit, search }
        });
        setRequests(response.data.requests);
        setTotalCount(response.data.total);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching invoices:', err);
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
      const response = await api.post('/invoices', {
        vehicleType,
        validity,
        imei: searchImei || 'N/A',
        iccid: searchImei || 'N/A',
        isSubDealer: isSubDealer,
        subDealerName: subDealerName,
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
      setIsSubDealer(false);
      setSubDealerName('');
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
    const customerName = (req.isSubDealer && req.subDealerName ? req.subDealerName : req.endCustomerName) || 'JYOTI CONSTRUCTION AND ENGINEERING Pvt. Ltd';
    const customerAddress = req.address || 'PAPRAUR, Begusarai, Bihar, 851210';
    const customerMob = req.rmn || '9031622921';
    const customerGstin = req.poaNo || '10AAECJ5132H1Z3';
    
    const piDate = new Date(req.dateTime).toLocaleDateString('en-GB').replace(/\//g, '.');
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
          @page { size: A4 portrait; margin: 3mm 5mm; }
          body{background:#fff;padding:0;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;zoom:0.80;}
          .page{box-shadow:none;border:none;border-radius:0;max-width:100%;overflow:visible;display:block;}
          .header{padding:12px 16px 8px}
          .info-box{padding:8px 16px}
          .table-wrap{padding:0 16px}
          .bottom{padding:0 16px 12px;margin-top:8px;page-break-inside:avoid;}
          .footer{margin:8px 16px 12px;padding-top:8px;page-break-inside:avoid;}
          table{margin-top:12px}
          td, th { padding: 6px 10px; font-size: 12px; }
          tr { page-break-inside: avoid; }
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
              <img src="${INVOICE_LOGO}" style="height: 48px; border-radius: 8px;" alt="Arshi Enterprises Logo" />
              <div class="brand-name">Arshi Enterprises</div>
            </div>
            <div class="brand-sub">
              Near-Brajesh Automobiles(Mahindra Showroom) NH-31,Maranga,<br>
              Pin Code-854303 Purnia(BIHAR)<br>
              Ph:-7782808063,919905959287<br>
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
            <div class="info-box-head">${req.isSubDealer ? 'Dealer / Sub-Dealer' : 'Customer'}</div>
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
              <li data-n="1.">Payment 100% in Advance.</li>
              <li data-n="2.">Price are further negotiable if quantity increases.</li>
              <li data-n="3.">Goods once sold cannot be taken back.</li>
              <li data-n="4.">Installation Charges (@INR500) is extra applicable on per unit. (Installation charges are further negotiable if quantity increases and vehicles are received in Bulk at one location)</li>
              <li data-n="5.">Warranty - 12 Months from the date of Supply, Warranty applicable before 15days of due date.</li>
              <li data-n="6.">Courier if any to be paid by customer.</li>
              <li data-n="7.">Standard Force Majeure will apply. (No warranty of burnt damaged goods)</li>
              <li data-n="8.">If any service is required during the year, then it’s charges @INR500 per unit will be applicable.</li>
              <li data-n="9.">Software &amp; Platform charges will be applicable from 2nd year onwards @INR1550+GST per unit / per year.</li>
            </ul>

            <div class="section-title">Bank Details</div>
            <div class="bank-row"><span>Account Name</span><span style="font-weight:700;color:var(--text)">ARSHI ENTERPRISES</span></div>
            <div class="bank-row"><span>Account Number</span><span style="font-weight:700;color:var(--text)">071205500764</span></div>
            <div class="bank-row"><span>Bank &amp; Branch</span><span style="font-weight:700;color:var(--text)">ICICI, Purnea</span></div>
            <div class="bank-row"><span>IFSC Code</span><span style="font-weight:700;color:var(--text)">ICIC0000712</span></div>
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

            <div style="margin-top:20px;">
              <div class="section-title">Features &amp; Benefits (FaB)</div>
              <ul class="tc-list" style="margin-bottom:0;">
                <li data-n="1.">Multiple Mobile Axes.</li>
                <li data-n="2.">Real time Track your Vehicle Anywhere via your mob. &amp; pc.</li>
                <li data-n="3.">Direction /Speed &amp; Ignition On/Off Detection.</li>
                <li data-n="4.">Ignition Cut off Alarm.</li>
                <li data-n="5.">Multiple Geo-Fence setup &amp; alarm.</li>
                <li data-n="6.">Back-up data from 01hrs to last 30days.</li>
                <li data-n="7.">Moving overview km/Per day, Stay Detail’s &amp; Alarm Detail’s etc.</li>
              </ul>
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
            
            <div className="form-field" style={{ gridColumn: '1 / -1', flexDirection: 'row', alignItems: 'center', gap: '8px', background: '#f0fdfa', padding: '12px 15px', borderRadius: '6px', border: '1px solid #ccfbf1' }}>
              <input 
                type="checkbox" 
                id="isDealerCheck"
                checked={isSubDealer}
                onChange={(e) => setIsSubDealer(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="isDealerCheck" style={{ margin: 0, cursor: 'pointer', fontWeight: 'bold', color: '#0f766e' }}>
                Generate Bill for a Dealer / Sub-Dealer
              </label>
            </div>

            {isSubDealer && (
              <div className="form-field" style={{ gridColumn: 'span 2' }}>
                <label>Dealer / Sub-Dealer Name*</label>
                <input 
                  type="text" 
                  value={subDealerName}
                  onChange={(e) => setSubDealerName(e.target.value)}
                  placeholder="Enter Dealer Name"
                  required={isSubDealer}
                />
              </div>
            )}

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
