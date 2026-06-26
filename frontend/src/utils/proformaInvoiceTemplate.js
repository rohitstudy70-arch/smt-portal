const COMPANY_SENDER = {
  brandName: 'Arshi Enterprises',
  companyName: 'Arshi Enterprises',
  address: 'Near Brajesh Automobiles (Mahindra Showroom), NH-31, Maranga',
  cityStatePin: 'Purnea, Bihar - 854303',
  phone: 'Ph: +91 7782808063, +91 9905959287',
  gstNo: '10ATIPK1589P1ZA',
};

const BANK_DETAILS = {
  accountName: 'ARSHI ENTERPRISES',
  accountNo: '071205500764',
  bankBranch: 'ICICI, Purnea',
  ifscCode: 'ICIC0000712',
};

const DEFAULT_CUSTOMER = {
  name: 'JYOTI CONSTRUCTION AND ENGINEERING Pvt. Ltd',
  address: 'PAPRAPUR, Begusarai, Bihar, 851210',
  mobile: '9031622921',
  gstin: '10AAECJ5132H1Z3',
};

const TERMS = [
  'Payment 100% in Advance.',
  'Price are further negotiable if quantity increases.',
  'Goods once sold cannot be taken back.',
  'Installation Charges (@INR500) is extra applicable per unit. (Installation charges are further negotiable if quantity increases and vehicles are received in Bulk at one location)',
  'Warranty – 12 Months from the date of Supply, Warranty applicable before 15days of due date.',
  'Courier if any to be paid by customer.',
  'Standard Force Majeure will apply. (No warranty of burnt damaged goods)',
  "If any service is required during the year, then it's charges @INR500 per unit will be applicable.",
  'Software & Platform charges will be applicable from 2nd year onwards @INR1550+GST per unit / per year.',
];

const FAB_LIST = [
  'Multiple Mobile Axes.',
  'Real time Track your Vehicle Anywhere via your mob. & pc.',
  'Direction /Speed & Ignition On/Off Detection.',
  'Ignition Cut off Alarm.',
  'Multiple Geo-Fence setup & alarm.',
  'Back-up data from 01hrs to last 30days.',
  "Moving overview km/Per day, Stay Detail's & Alarm Detail's etc.",
];

export const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const roundCurrency = (value) => Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

export const parseQty = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

export const formatCurrency = (value) => new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(toNumber(value));

export const formatRate = (value) => {
  const rate = toNumber(value);
  return Number.isInteger(rate) ? String(rate) : rate.toFixed(2);
};

export const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const formatMultilineHtml = (value) => escapeHtml(value).replace(/\n/g, '<br/>');

export const sanitizeFilenamePart = (value) => String(value || 'AE_PI_001')
  .replace(/[^a-zA-Z0-9_-]+/g, '_')
  .replace(/^_+|_+$/g, '') || 'AE_PI_001';

export const getSenderDetails = (userObj) => {
  const isAdmin = !userObj || userObj.role === 'partner' || userObj.userType === 'Administration';

  if (isAdmin) {
    return COMPANY_SENDER;
  }

  return {
    brandName: userObj.companyName || userObj.displayName || userObj.username || 'Arshi Enterprises',
    companyName: userObj.companyName || userObj.displayName || '',
    address: userObj.address || '',
    cityStatePin: `${userObj.city || ''}${userObj.city && userObj.state ? ', ' : ''}${userObj.state || ''}${userObj.pincode ? ', ' : ''}${userObj.pincode || ''}`,
    phone: userObj.mobileNo || userObj.phone || '',
    gstNo: userObj.gstNo || '',
  };
};

export const numberToWords = (price) => {
  const amount = Math.round(toNumber(price));
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convert = (num) => {
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ` ${ones[num % 10]}` : '');
    if (num < 1000) return `${ones[Math.floor(num / 100)]} Hundred${num % 100 ? ` and ${convert(num % 100)}` : ''}`;
    if (num < 100000) return `${convert(Math.floor(num / 1000))} Thousand${num % 1000 ? ` ${convert(num % 1000)}` : ''}`;
    if (num < 10000000) return `${convert(Math.floor(num / 100000))} Lakh${num % 100000 ? ` ${convert(num % 100000)}` : ''}`;
    return `${convert(Math.floor(num / 10000000))} Crore${num % 10000000 ? ` ${convert(num % 10000000)}` : ''}`;
  };

  if (amount === 0) return 'Zero Rupees Only';
  return `${convert(amount)} Rupees Only`;
};

const getItemGstRate = (item, fallback = 18) => {
  if (item.gstRate !== undefined && item.gstRate !== '') {
    return toNumber(item.gstRate);
  }

  const cgst = toNumber(item.cgst);
  const sgst = toNumber(item.sgst);
  const igst = toNumber(item.igst);
  return igst || (cgst + sgst) || fallback;
};

const formatInvoiceDate = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleDateString('en-GB');
  }
  return date.toLocaleDateString('en-GB');
};

const getFallbackItems = (invoice = {}) => {
  const validity = invoice.validity || '12 Month';
  const is2Years = validity === '2 Years' || validity === '24 Month';
  const is5Years = validity === '5 Years' || validity === '60 Month';

  if (is2Years) {
    return [{
      description: 'TS-A-Commercial Plan-2 Years-A/B',
      unitPrice: 2000,
      gstRate: 18,
      qty: 1,
    }];
  }

  if (is5Years) {
    return [{
      description: 'TS-A-Commercial Plan-5 Years-A/B',
      unitPrice: 10000,
      gstRate: 18,
      qty: 1,
    }];
  }

  return [{
    description: 'TS-A-Commercial Plan-1 Year-A/B',
    unitPrice: 4300,
    gstRate: 18,
    qty: 1,
  }];
};

export const buildProformaInvoiceData = (invoice = {}) => {
  const sender = getSenderDetails(invoice.userId);
  const senderLines = [
    sender.address,
    sender.cityStatePin,
    sender.phone ? sender.phone : '',
    sender.gstNo ? `GST No: ${sender.gstNo}` : '',
  ].filter(Boolean);

  const customerName = invoice.endCustomerName || DEFAULT_CUSTOMER.name;
  const billToName = invoice.isSubDealer && invoice.subDealerName ? invoice.subDealerName : customerName;
  const customerAddress = invoice.address || DEFAULT_CUSTOMER.address;
  const customerMobile = invoice.rmn || DEFAULT_CUSTOMER.mobile;
  const customerGstin = invoice.poaNo || DEFAULT_CUSTOMER.gstin;
  const targetState = invoice.isSubDealer ? (invoice.dealerState || 'Bihar') : (invoice.customerState || 'Bihar');
  const isIntraState = targetState && targetState.toLowerCase() === 'bihar';
  const sourceItems = Array.isArray(invoice.items) && invoice.items.length > 0 ? invoice.items : getFallbackItems(invoice);

  let subtotal = 0;
  let sgst = 0;
  let cgst = 0;
  let igst = 0;

  const items = sourceItems.map((item, index) => {
    const unitPrice = roundCurrency(item.unitPrice);
    const qty = parseQty(item.qty);
    const gstRate = getItemGstRate(item);
    let cgstRate = 0;
    let sgstRate = 0;
    let igstRate = 0;

    if (isIntraState) {
      cgstRate = toNumber(item.cgst) || (toNumber(item.igst) / 2) || (gstRate / 2);
      sgstRate = toNumber(item.sgst) || (toNumber(item.igst) / 2) || (gstRate / 2);
    } else {
      igstRate = toNumber(item.igst) || (toNumber(item.cgst) + toNumber(item.sgst)) || gstRate;
    }

    const taxableValue = roundCurrency(unitPrice * qty);
    const cgstAmount = roundCurrency((taxableValue * cgstRate) / 100);
    const sgstAmount = roundCurrency((taxableValue * sgstRate) / 100);
    const igstAmount = roundCurrency((taxableValue * igstRate) / 100);
    const displayGstRate = isIntraState ? roundCurrency(cgstRate + sgstRate) : roundCurrency(igstRate);

    subtotal = roundCurrency(subtotal + taxableValue);
    cgst = roundCurrency(cgst + cgstAmount);
    sgst = roundCurrency(sgst + sgstAmount);
    igst = roundCurrency(igst + igstAmount);

    return {
      index: index + 1,
      description: item.description || '',
      qty,
      unitPrice,
      taxableValue,
      displayGstRate,
    };
  });

  const taxAmount = roundCurrency(sgst + cgst + igst);
  const total = roundCurrency(subtotal + taxAmount);
  const piNo = invoice.piNo || invoice.invoiceNo || 'AE_PI_001';

  return {
    sender,
    senderLines,
    piNo,
    piDate: formatInvoiceDate(invoice.dateTime),
    billToLabel: invoice.isSubDealer ? 'Dealer / Sub-Dealer' : 'Customer',
    billToName,
    customerName,
    customerAddress,
    customerMobile,
    customerGstin,
    isIntraState,
    items,
    emptyRows: Math.max(0, 2 - items.length),
    terms: TERMS,
    bankDetails: BANK_DETAILS,
    fabList: FAB_LIST,
    totals: {
      subtotal,
      sgst,
      cgst,
      igst,
      taxAmount,
      total,
    },
    amountInWords: numberToWords(total),
    downloadFileName: `Arshi_Enterprises_Proforma_Invoice_${sanitizeFilenamePart(piNo)}.html`,
  };
};

const renderActionBar = () => `
  <div class="action-bar">
    <button class="btn btn-secondary" onclick="window.print()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
      Print
    </button>
    <button class="btn btn-primary" onclick="downloadHTML()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
      Download Invoice
    </button>
  </div>
`;

const renderTermsHtml = (terms) => terms
  .map((term, index) => `<li data-n="${index + 1}.">${escapeHtml(term)}</li>`)
  .join('');

const renderEmptyRowsHtml = (count) => Array.from({ length: count })
  .map(() => '<tr class="empty-row"><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>')
  .join('');

export const renderProformaInvoiceHtml = (invoice, { logo, includeActions = true, autoPrint = false } = {}) => {
  const data = buildProformaInvoiceData(invoice);
  const senderAddressHtml = data.senderLines.map(escapeHtml).join('<br>');
  const itemsHtml = data.items.map((item) => `
        <tr>
          <td style="text-align:center">${item.index}</td>
          <td class="desc">${formatMultilineHtml(item.description)}</td>
          <td class="num">${item.qty}</td>
          <td class="num">${formatCurrency(item.unitPrice)}</td>
          <td class="num">${formatRate(item.displayGstRate)}%</td>
          <td class="num">${formatCurrency(item.taxableValue)}</td>
        </tr>
  `).join('');

  const autoPrintScript = autoPrint ? `
  window.addEventListener('load', function() {
    setTimeout(function() { window.print(); }, 150);
  });
` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Arshi Enterprises - Proforma Invoice</title>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Nunito+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  :root{
    --teal:#007B8A;--teal-dark:#005a66;--teal-light:#E0F4F7;--teal-mid:#b2e4ec;
    --accent:#f0a500;--bg:#eef4f6;--white:#ffffff;--text:#1a2a30;--muted:#5a7a82;--border:#cce4e8
  }
  body{font-family:'Nunito Sans',sans-serif;background:var(--bg);color:var(--text);padding:32px 16px;min-height:100vh}
  .action-bar{max-width:794px;margin:0 auto 14px;display:flex;gap:10px;justify-content:flex-end}
  .btn{display:inline-flex;align-items:center;gap:7px;padding:10px 22px;border-radius:8px;border:none;font-family:'Nunito',sans-serif;font-size:13.5px;font-weight:700;cursor:pointer;text-decoration:none;transition:all 0.2s;letter-spacing:0.3px}
  .btn-primary{background:var(--teal);color:#fff}
  .btn-primary:hover{background:var(--teal-dark)}
  .btn-secondary{background:#fff;color:var(--teal);border:1.5px solid var(--teal)}
  .btn-secondary:hover{background:var(--teal-light)}
  .btn svg{width:16px;height:16px;flex-shrink:0}
  .page{background:var(--white);max-width:794px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 6px 30px rgba(0,80,100,0.12);border:1px solid var(--border)}
  .header{background:var(--teal);padding:28px 28px 22px;display:flex;justify-content:space-between;align-items:flex-start;gap:20px}
  .brand-name{font-family:'Nunito',sans-serif;font-size:34px;font-weight:800;color:#fff;letter-spacing:0}
  .brand-sub{color:rgba(255,255,255,0.85);font-size:11.5px;margin-top:2px;line-height:1.55}
  .invoice-title-block{text-align:right;flex-shrink:0}
  .inv-label{font-family:'Nunito',sans-serif;font-size:22px;font-weight:800;color:#fff;letter-spacing:1px;text-transform:uppercase}
  .inv-meta{color:rgba(255,255,255,0.80);font-size:12.5px;margin-top:7px;line-height:1.75}
  .accent-bar{height:5px;background:linear-gradient(90deg,var(--accent) 0%,#f5d26e 50%,var(--teal-mid) 100%)}
  .info-grid{display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1.5px solid var(--border)}
  .info-box{padding:16px 20px;border-right:1px solid var(--border)}
  .info-box:first-child{padding-left:28px}
  .info-box:last-child{border-right:none;padding-right:28px}
  .info-box-head{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--teal);margin-bottom:9px;display:flex;align-items:center;gap:6px}
  .info-box-head::before{content:'';display:inline-block;width:3px;height:12px;background:var(--accent);border-radius:2px}
  .info-box p{font-size:12.5px;color:var(--text);line-height:1.65}
  .co-name{font-weight:700;font-size:13px;color:var(--text);margin-bottom:3px}
  .table-wrap{padding:0 28px}
  table{width:100%;border-collapse:collapse;margin-top:22px}
  thead tr{background:var(--teal)}
  thead th{color:#fff;font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;padding:11px 12px}
  thead th:first-child{border-radius:6px 0 0 0;padding-left:16px}
  thead th:last-child{border-radius:0 6px 0 0}
  tbody tr{border-bottom:1px solid var(--border)}
  tbody tr:hover{background:var(--teal-light)}
  td{padding:12px 12px;font-size:13px;vertical-align:top}
  td:first-child{padding-left:16px}
  td.desc{min-width:180px;word-break:break-word}
  td.num{text-align:right}
  .empty-row td{height:34px;color:transparent;user-select:none}
  .sub-row td{background:var(--teal-light);font-weight:700;font-size:13px;color:var(--teal-dark);border-top:2px solid var(--teal-mid)}
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
  .bank-row span:last-child{font-weight:700;color:var(--text)}
  .tax-block{padding-left:26px;border-left:1.5px solid var(--border)}
  .tax-row{display:flex;justify-content:space-between;font-size:12.5px;padding:4.5px 0;border-bottom:1px solid #eef4f6;color:var(--text)}
  .tax-row:last-child{border-bottom:none}
  .tax-row.hl{color:var(--teal-dark);font-weight:700}
  .total-box{background:var(--teal);border-radius:8px;padding:15px 18px;margin-top:14px;text-align:center}
  .total-label{color:rgba(255,255,255,0.8);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px}
  .total-amount{color:#fff;font-family:'Nunito',sans-serif;font-size:23px;font-weight:800;letter-spacing:0}
  .footer{margin:16px 28px 22px;padding-top:14px;border-top:1.5px solid var(--border);text-align:center}
  .footer p{font-size:11px;color:var(--muted);line-height:1.5;font-style:italic}
  @media print{
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    @page {
      size: A4 portrait;
      margin: 4mm 6mm;
    }
    body{background:#fff;padding:0;margin:0}
    .action-bar{display:none}
    .page{box-shadow:none;border:none;border-radius:0;max-width:100%;margin:0;padding:0;page-break-inside:avoid}
    .header{padding:10px 16px 8px}
    .brand-name{font-size:26px}
    .brand-sub{font-size:10px;line-height:1.4}
    .inv-label{font-size:18px}
    .inv-meta{font-size:11px;margin-top:4px}
    .info-box{padding:6px 12px}
    .info-box:first-child{padding-left:16px}
    .info-box:last-child{padding-right:16px}
    .info-box-head{margin-bottom:4px;font-size:9.5px}
    .info-box p{font-size:11px;line-height:1.4}
    .co-name{font-size:11.5px;margin-bottom:1px}
    table{margin-top:8px}
    thead th{padding:6px 8px;font-size:10.5px}
    td{padding:6px 8px;font-size:11px}
    .empty-row td{height:16px}
    .bottom{margin-top:6px;padding:0 16px 8px}
    .amount-words{font-size:11px;margin-bottom:8px}
    .section-title{font-size:10px;margin-bottom:6px}
    .tc-list{margin-bottom:6px}
    .tc-list li{padding:1px 0 1px 12px;font-size:9px;line-height:1.25}
    .bank-row{padding:1px 0;font-size:9.5px}
    .bank-row span:first-child{min-width:90px}
    .tax-block{padding-left:12px;padding-top:0}
    .tax-row{padding:2px 0;font-size:10.5px}
    .total-box{padding:6px 10px;margin-top:4px}
    .total-label{font-size:9.5px}
    .total-amount{font-size:16px}
    .fab-container{margin-top:6px !important}
    .footer{margin:6px 16px 6px;padding-top:4px}
    .footer p{font-size:8.5px}
    tbody tr:hover{background:transparent}
  }
  @media screen and (max-width: 768px){
    body{padding:20px 10px}
    .action-bar{justify-content:center;flex-wrap:wrap}
    .header{padding:22px 20px;flex-direction:column}
    .invoice-title-block{text-align:left}
    .info-grid{grid-template-columns:1fr}
    .info-box{border-right:none;border-bottom:1px solid var(--border)}
    .info-box:last-child{border-bottom:none}
    .table-wrap{overflow-x:auto;padding:0 14px}
    table{min-width:620px}
    .bottom{grid-template-columns:1fr;padding:0 18px 22px}
    .tax-block{border-left:none;border-top:1.5px solid var(--border);padding-left:0;padding-top:16px}
  }
</style>
</head>
<body>
${includeActions ? renderActionBar() : ''}
<div class="page" id="invoice">
  <div class="header">
    <div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <img src="${escapeHtml(logo || '')}" style="height:48px;width:auto;object-fit:contain;border-radius:6px" alt="Arshi Enterprises Logo">
        <div class="brand-name">${escapeHtml(data.sender.brandName)}</div>
      </div>
      <div class="brand-sub">${senderAddressHtml}</div>
    </div>
    <div class="invoice-title-block">
      <div class="inv-label">Proforma Invoice</div>
      <div class="inv-meta">
        Date: ${escapeHtml(data.piDate)}<br>
        PI No: ${escapeHtml(data.piNo)}
      </div>
    </div>
  </div>
  <div class="accent-bar"></div>

  <div class="info-grid">
    <div class="info-box">
      <div class="info-box-head">${escapeHtml(data.billToLabel)}</div>
      <p class="co-name">${escapeHtml(data.billToName)}</p>
      <p>${escapeHtml(data.customerAddress)}</p>
      <p>GSTIN: ${escapeHtml(data.customerGstin)}</p>
    </div>
    <div class="info-box">
      <div class="info-box-head">Ship To</div>
      <p class="co-name">${escapeHtml(data.customerName)}</p>
      <p>${escapeHtml(data.customerAddress)}</p>
      <p>GSTIN: ${escapeHtml(data.customerGstin)}</p>
    </div>
    <div class="info-box">
      <div class="info-box-head">Shipping Details</div>
      <p class="co-name">${escapeHtml(data.customerName)}</p>
      <p>${escapeHtml(data.customerAddress)}</p>
      <p>Mobile: ${escapeHtml(data.customerMobile)}</p>
      <p>GSTIN: ${escapeHtml(data.customerGstin)}</p>
    </div>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th style="width:42px;text-align:center">SL</th>
          <th style="text-align:left">Description</th>
          <th style="width:52px;text-align:right">QTY</th>
          <th style="width:96px;text-align:right">Unit Price</th>
          <th style="width:54px;text-align:right">GST</th>
          <th style="width:104px;text-align:right">Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
${itemsHtml}${renderEmptyRowsHtml(data.emptyRows)}
      </tbody>
      <tfoot>
        <tr class="sub-row">
          <td colspan="5" style="text-align:right;padding-right:16px;font-size:12px;letter-spacing:0.5px">Sub Total</td>
          <td class="num">${formatCurrency(data.totals.subtotal)}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <div class="bottom">
    <div>
      <div class="amount-words">
        <strong>Amount in Words:</strong> ${escapeHtml(data.amountInWords)}
      </div>

      <div class="section-title">Terms &amp; Conditions</div>
      <ul class="tc-list">
        ${renderTermsHtml(data.terms)}
      </ul>

      <div class="section-title">Bank Details</div>
      <div class="bank-row"><span>Account Name</span><span style="font-weight:700;color:var(--text)">${escapeHtml(data.bankDetails.accountName)}</span></div>
      <div class="bank-row"><span>Account Number</span><span style="font-weight:700;color:var(--text)">${escapeHtml(data.bankDetails.accountNo)}</span></div>
      <div class="bank-row"><span>Bank &amp; Branch</span><span style="font-weight:700;color:var(--text)">${escapeHtml(data.bankDetails.bankBranch)}</span></div>
      <div class="bank-row"><span>IFSC Code</span><span style="font-weight:700;color:var(--text)">${escapeHtml(data.bankDetails.ifscCode)}</span></div>
    </div>

    <div class="tax-block">
      <div class="section-title">Tax Summary</div>
      <div class="tax-row hl"><span>SGST @ 9%</span><span>${data.isIntraState ? formatCurrency(data.totals.sgst) : '0.00'}</span></div>
      <div class="tax-row hl"><span>CGST @ 9%</span><span>${data.isIntraState ? formatCurrency(data.totals.cgst) : '0.00'}</span></div>
      <div class="tax-row"><span>IGST @ 18%</span><span>${data.isIntraState ? '0.00' : formatCurrency(data.totals.igst)}</span></div>
      <div class="tax-row hl"><span>Tax Amount</span><span>${formatCurrency(data.totals.taxAmount)}</span></div>
      <div class="total-box">
        <div class="total-label">Total Amount</div>
        <div class="total-amount">INR ${formatCurrency(data.totals.total)}</div>
      </div>
      <div class="fab-container" style="margin-top:20px">
        <div class="section-title">Features &amp; Benefits (FaB)</div>
        <ul class="tc-list" style="margin-bottom:0">
          ${data.fabList.map((fab, index) => `<li data-n="${index + 1}.">${escapeHtml(fab)}</li>`).join('')}
        </ul>
      </div>
    </div>
  </div>

  <div class="footer">
    <p>This document is computer generated and does not require the Registrar's signature or the Company's stamp to be considered valid.</p>
  </div>
</div>

<script>
function downloadHTML() {
  var html = document.documentElement.outerHTML;
  var blob = new Blob([html], {type: 'text/html'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '${escapeHtml(data.downloadFileName)}';
  a.click();
}
${autoPrintScript}
</script>
</body>
</html>`;
};
