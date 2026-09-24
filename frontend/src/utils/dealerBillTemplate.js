import { INVOICE_LOGO } from './invoiceLogo';
import { STAMP_IMAGE } from './stampLogo';

const COMPANY_SENDER = {
  brandName: 'Arshi Enterprises',
  companyName: 'Arshi Enterprises',
  address: 'Near Brajesh Automobiles (Mahindra Showroom), NH-31, Maranga',
  cityStatePin: 'Purnea, Bihar - 854303',
  phone: 'Ph: +91 7782808063, +91 9905959287',
  email: 'info@arshienterprises.com',
  gstNo: '10ATIPK1589P1ZA',
};

const BANK_DETAILS = {
  accountName: 'ARSHI ENTERPRISES',
  accountNo: '071205500764',
  bankBranch: 'ICICI, Purnea',
  ifscCode: 'ICIC0000712',
};

export const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const roundCurrency = (value) => Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

export const formatCurrency = (value) => new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(toNumber(value));

export const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

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

const formatDate = (dateValue) => {
  const d = dateValue ? new Date(dateValue) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toLocaleDateString('en-GB');
  return d.toLocaleDateString('en-GB');
};

export const renderDealerBillHtml = ({
  invoice = {},
  dealer = {},
  items = [],
  fromDate = '',
  toDate = '',
}) => {
  const sender = COMPANY_SENDER;
  const targetState = dealer.state || invoice.dealerState || 'Bihar';
  const isIntraState = targetState.toLowerCase() === 'bihar';

  let totalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalGross = 0;
  let totalQty = 0;

  const itemRows = items.map((item, index) => {
    const qty = parseInt(item.qty, 10) || 0;
    const unitPrice = toNumber(item.unitPrice);
    const taxableVal = roundCurrency(unitPrice * qty);
    
    const cgstRate = isIntraState ? (toNumber(item.cgst) || 9) : 0;
    const sgstRate = isIntraState ? (toNumber(item.sgst) || 9) : 0;
    const igstRate = isIntraState ? 0 : (toNumber(item.igst) || 18);

    const cgstAmt = roundCurrency((taxableVal * cgstRate) / 100);
    const sgstAmt = roundCurrency((taxableVal * sgstRate) / 100);
    const igstAmt = roundCurrency((taxableVal * igstRate) / 100);
    const gross = roundCurrency(taxableVal + cgstAmt + sgstAmt + igstAmt);

    totalQty += qty;
    totalTaxable += taxableVal;
    totalCgst += cgstAmt;
    totalSgst += sgstAmt;
    totalIgst += igstAmt;
    totalGross += gross;

    return `
      <tr>
        <td style="text-align: center;">${index + 1}</td>
        <td>
          <strong>${escapeHtml(item.description)}</strong>
          ${item.validity ? `<div style="font-size: 11px; color: #555;">Validity: ${escapeHtml(item.validity)}</div>` : ''}
          ${item.category ? `<div style="font-size: 10px; color: #0284c7; font-weight: 600;">Category: ${escapeHtml(item.category)}</div>` : ''}
        </td>
        <td style="text-align: center; font-weight: 600;">${qty}</td>
        <td style="text-align: right;">₹${formatCurrency(unitPrice)}</td>
        <td style="text-align: right; font-weight: 600;">₹${formatCurrency(taxableVal)}</td>
        ${isIntraState ? `
          <td style="text-align: right;">${cgstRate}%<br/><small>₹${formatCurrency(cgstAmt)}</small></td>
          <td style="text-align: right;">${sgstRate}%<br/><small>₹${formatCurrency(sgstAmt)}</small></td>
        ` : `
          <td style="text-align: right;">${igstRate}%<br/><small>₹${formatCurrency(igstAmt)}</small></td>
        `}
        <td style="text-align: right; font-weight: bold; color: #0f172a;">₹${formatCurrency(gross)}</td>
      </tr>
    `;
  }).join('');

  // Annexure rows of IMEIs
  let allImeisList = [];
  items.forEach(item => {
    if (Array.isArray(item.imeis) && item.imeis.length > 0) {
      item.imeis.forEach(im => {
        allImeisList.push({
          category: item.category || item.description,
          imei: typeof im === 'string' ? im : (im.imei || im.serialNo || 'N/A'),
          details: typeof im === 'object' ? im : {},
        });
      });
    }
  });

  const annexureRows = allImeisList.map((entry, idx) => {
    const imei = escapeHtml(entry.imei);
    const cat = escapeHtml(entry.category);
    const veh = escapeHtml(entry.details.vehicleNo || '-');
    const cust = escapeHtml(entry.details.customerName || '-');
    const date = entry.details.date ? formatDate(entry.details.date) : '-';

    return `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td style="font-family: monospace; font-weight: 600; color: #1e293b;">${imei}</td>
        <td><span class="badge-cat">${cat}</span></td>
        <td>${veh}</td>
        <td>${cust}</td>
        <td style="text-align: center;">${date}</td>
      </tr>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Dealer Consolidated Bill - ${escapeHtml(invoice.invoiceNo || invoice.piNo || 'Bill')}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 12px;
      color: #1e293b;
      background: #fff;
      padding: 15px;
      line-height: 1.4;
    }
    .invoice-container {
      max-width: 800px;
      margin: 0 auto;
      border: 1px solid #cbd5e1;
      padding: 24px;
      background: #ffffff;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    .header-table {
      width: 100%;
      border-bottom: 2px solid #0f766e;
      padding-bottom: 14px;
      margin-bottom: 16px;
    }
    .logo-img {
      max-height: 60px;
      max-width: 170px;
      object-fit: contain;
    }
    .company-title {
      font-size: 20px;
      font-weight: 800;
      color: #0f766e;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .bill-heading {
      font-size: 16px;
      font-weight: 800;
      color: #047857;
      text-transform: uppercase;
      text-align: right;
      letter-spacing: 1px;
    }
    .meta-box {
      width: 100%;
      border: 1px solid #e2e8f0;
      background: #f8fafc;
      border-radius: 6px;
      margin-bottom: 16px;
      border-collapse: collapse;
    }
    .meta-box td {
      padding: 8px 12px;
      vertical-align: top;
      font-size: 12px;
    }
    .meta-title {
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .meta-val {
      font-weight: 600;
      color: #0f172a;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 11.5px;
    }
    .items-table th {
      background: #0f766e;
      color: #ffffff;
      padding: 8px 10px;
      font-weight: 700;
      text-align: left;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .items-table td {
      padding: 8px 10px;
      border-bottom: 1px solid #e2e8f0;
    }
    .items-table tr:nth-child(even) td {
      background-color: #f8fafc;
    }
    .totals-area {
      width: 100%;
      margin-bottom: 20px;
      border-collapse: collapse;
    }
    .totals-area td {
      vertical-align: top;
    }
    .bank-card {
      border: 1px dashed #0f766e;
      background: #f0fdf4;
      padding: 10px 14px;
      border-radius: 6px;
      font-size: 11px;
    }
    .calc-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .calc-table td {
      padding: 5px 8px;
    }
    .grand-total-row {
      background: #0f766e;
      color: #ffffff;
      font-weight: 800;
      font-size: 13px;
    }
    .grand-total-row td {
      padding: 8px 10px;
    }
    .words-box {
      border-top: 1px solid #cbd5e1;
      border-bottom: 1px solid #cbd5e1;
      padding: 8px 0;
      margin-bottom: 16px;
      font-size: 12px;
    }
    .annexure-section {
      margin-top: 24px;
      page-break-before: auto;
    }
    .annexure-title {
      font-size: 14px;
      font-weight: 800;
      color: #0f766e;
      border-bottom: 2px solid #0f766e;
      padding-bottom: 4px;
      margin-bottom: 10px;
      text-transform: uppercase;
    }
    .badge-cat {
      background: #e0f2fe;
      color: #0369a1;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      display: inline-block;
    }
    .footer-signatures {
      width: 100%;
      margin-top: 30px;
      border-collapse: collapse;
    }
    .footer-signatures td {
      width: 50%;
      vertical-align: bottom;
      padding: 0 10px;
    }
    @media print {
      body {
        padding: 0;
      }
      .invoice-container {
        border: none;
        box-shadow: none;
        padding: 0;
        width: 100%;
        max-width: 100%;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <!-- Header -->
    <table class="header-table">
      <tr>
        <td style="width: 25%; vertical-align: middle;">
          <img src="${INVOICE_LOGO}" alt="Company Logo" class="logo-img" />
        </td>
        <td style="width: 45%; vertical-align: middle; padding-left: 10px;">
          <div class="company-title">${escapeHtml(sender.brandName)}</div>
          <div style="font-size: 11px; color: #475569; margin-top: 2px;">
            ${escapeHtml(sender.address)}<br/>
            ${escapeHtml(sender.cityStatePin)}<br/>
            ${escapeHtml(sender.phone)} | <strong>GSTIN:</strong> ${escapeHtml(sender.gstNo)}
          </div>
        </td>
        <td style="width: 30%; vertical-align: middle;">
          <div class="bill-heading">PROFORMA INVOICE</div>
          <div style="font-size: 11px; text-align: right; color: #334155; margin-top: 4px;">
            <strong>Bill / Inv No:</strong> ${escapeHtml(invoice.invoiceNo || 'DRAFT-INV')}<br/>
            <strong>PI Ref:</strong> ${escapeHtml(invoice.piNo || 'AE-PI')}<br/>
            <strong>Date:</strong> ${formatDate(invoice.dateTime || new Date())}
            ${fromDate || toDate ? `<br/><strong>Period:</strong> ${fromDate || 'Start'} to ${toDate || 'End'}` : ''}
          </div>
        </td>
      </tr>
    </table>

    <!-- Billed To & Summary Meta -->
    <table class="meta-box">
      <tr>
        <td style="width: 55%; border-right: 1px solid #e2e8f0;">
          <div class="meta-title">Billed To (Dealer / Sub-Dealer):</div>
          <div class="meta-val" style="font-size: 14px; color: #0f766e;">
            ${escapeHtml(dealer.displayName || dealer.companyName || invoice.endCustomerName || 'Valued Dealer')}
          </div>
          ${dealer.companyName && dealer.displayName !== dealer.companyName ? `<div style="font-size: 11px; color: #475569;">${escapeHtml(dealer.companyName)}</div>` : ''}
          <div style="margin-top: 4px; color: #334155;">
            ${dealer.address ? `${escapeHtml(dealer.address)}<br/>` : ''}
            ${dealer.city || dealer.state ? `${escapeHtml(dealer.city || '')}${dealer.city && dealer.state ? ', ' : ''}${escapeHtml(dealer.state || '')} ${escapeHtml(dealer.pincode || '')}<br/>` : ''}
            <strong>Phone:</strong> ${escapeHtml(dealer.mobileNo || invoice.rmn || 'N/A')}
            ${dealer.email ? ` | <strong>Email:</strong> ${escapeHtml(dealer.email)}` : ''}<br/>
            ${dealer.gstNo ? `<strong>GSTIN:</strong> ${escapeHtml(dealer.gstNo)} ` : ''}${dealer.panNo ? `| <strong>PAN:</strong> ${escapeHtml(dealer.panNo)}` : (!dealer.gstNo ? `<strong>GSTIN / PAN:</strong> ${escapeHtml(invoice.poaNo || 'Unregistered')}` : '')}
          </div>
        </td>
        <td style="width: 45%;">
          <div class="meta-title">Billing Summary:</div>
          <table style="width: 100%; font-size: 11.5px;">
            <tr>
              <td style="padding: 2px 0; color: #475569;">Place of Supply:</td>
              <td style="padding: 2px 0; font-weight: 600; text-align: right;">${escapeHtml(targetState)}</td>
            </tr>
            <tr>
              <td style="padding: 2px 0; color: #475569;">Total Units / Items:</td>
              <td style="padding: 2px 0; font-weight: 700; text-align: right; color: #0284c7;">${totalQty} Units</td>
            </tr>
            <tr>
              <td style="padding: 2px 0; color: #475569;">Tax Type:</td>
              <td style="padding: 2px 0; font-weight: 600; text-align: right;">${isIntraState ? 'Intra-State (CGST + SGST)' : 'Inter-State (IGST)'}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Categorized Line Items -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 5%; text-align: center;">#</th>
          <th style="width: 38%;">Description of Service / Plan</th>
          <th style="width: 8%; text-align: center;">Qty</th>
          <th style="width: 14%; text-align: right;">Unit Rate</th>
          <th style="width: 14%; text-align: right;">Taxable Val</th>
          ${isIntraState ? `
            <th style="width: 8%; text-align: right;">CGST</th>
            <th style="width: 8%; text-align: right;">SGST</th>
          ` : `
            <th style="width: 16%; text-align: right;">IGST (18%)</th>
          `}
          <th style="width: 13%; text-align: right;">Total (INR)</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <!-- Totals and Bank Section -->
    <table class="totals-area">
      <tr>
        <td style="width: 48%; padding-right: 15px;">
          <div class="bank-card">
            <strong style="color: #0f766e; text-transform: uppercase; font-size: 11.5px;">Bank Details for Payment (NEFT/RTGS/IMPS):</strong>
            <div style="margin-top: 6px; line-height: 1.5;">
              <strong>Account Name:</strong> ${BANK_DETAILS.accountName}<br/>
              <strong>Account No:</strong> <span style="font-family: monospace; font-size: 12px; font-weight: bold;">${BANK_DETAILS.accountNo}</span><br/>
              <strong>Bank & Branch:</strong> ${BANK_DETAILS.bankBranch}<br/>
              <strong>IFSC Code:</strong> <span style="font-family: monospace; font-weight: bold;">${BANK_DETAILS.ifscCode}</span>
            </div>
          </div>
        </td>
        <td style="width: 52%;">
          <table class="calc-table">
            <tr>
              <td style="color: #475569;">Total Taxable Amount:</td>
              <td style="text-align: right; font-weight: 600;">₹${formatCurrency(totalTaxable)}</td>
            </tr>
            ${isIntraState ? `
              <tr>
                <td style="color: #475569;">CGST (9%):</td>
                <td style="text-align: right; font-weight: 600;">₹${formatCurrency(totalCgst)}</td>
              </tr>
              <tr>
                <td style="color: #475569;">SGST (9%):</td>
                <td style="text-align: right; font-weight: 600;">₹${formatCurrency(totalSgst)}</td>
              </tr>
            ` : `
              <tr>
                <td style="color: #475569;">IGST (18%):</td>
                <td style="text-align: right; font-weight: 600;">₹${formatCurrency(totalIgst)}</td>
              </tr>
            `}
            <tr class="grand-total-row">
              <td><strong>Grand Total (Incl. GST):</strong></td>
              <td style="text-align: right;">₹${formatCurrency(totalGross)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- In Words -->
    <div class="words-box">
      <strong>Amount Chargeable in Words:</strong> <span style="font-style: italic; color: #0f766e; font-weight: 700;">${numberToWords(totalGross)}</span>
    </div>

    <!-- Terms & Signatures -->
    <table class="footer-signatures">
      <tr>
        <td style="font-size: 10.5px; color: #64748b;">
          <strong>Terms & Conditions:</strong>
          <ul style="margin-left: 14px; margin-top: 4px; line-height: 1.3;">
            <li>Payment should be credited within the agreed credit cycle.</li>
            <li>Subject to Purnea jurisdiction only.</li>
            <li>This is a computer-generated consolidated bill.</li>
          </ul>
        </td>
        <td style="text-align: right; vertical-align: bottom;">
          <div style="font-size: 11px; font-weight: 700; color: #0f766e; margin-bottom: 2px;">
            For ${escapeHtml(sender.brandName)}
          </div>
          <div style="margin-bottom: -16px; margin-top: -6px; text-align: center; display: inline-block;">
            <img src="${STAMP_IMAGE}" alt="Arshi Enterprises Official Seal & Stamp" style="max-height: 85px; max-width: 85px; object-fit: contain;" /><br/>
            <div style="font-size: 11px; border-top: 1px solid #cbd5e1; display: inline-block; padding-top: 3px; min-width: 140px; text-align: center;">
              Authorized Signatory
            </div>
          </div>
        </td>
      </tr>
    </table>

    ${allImeisList.length > 0 ? `
      <!-- Detailed IMEI Annexure -->
      <div class="annexure-section">
        <div class="annexure-title">Annexure - A: Detailed IMEI Breakdown (${allImeisList.length} Units)</div>
        <table class="items-table" style="font-size: 11px;">
          <thead>
            <tr>
              <th style="width: 5%; text-align: center;">#</th>
              <th style="width: 25%;">IMEI Number</th>
              <th style="width: 25%;">Category / Plan</th>
              <th style="width: 18%;">Vehicle No</th>
              <th style="width: 17%;">Customer Name</th>
              <th style="width: 10%; text-align: center;">Date</th>
            </tr>
          </thead>
          <tbody>
            ${annexureRows}
          </tbody>
        </table>
      </div>
    ` : ''}
  </div>
</body>
</html>
  `;
};

export const printDealerBill = (billData) => {
  const html = renderDealerBillHtml(billData);
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to print/download the invoice.');
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 350);
};
