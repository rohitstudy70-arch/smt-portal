import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { FaDownload, FaPrint, FaSpinner } from 'react-icons/fa';
import api from '../../utils/api';
import { INVOICE_LOGO } from '../../utils/invoiceLogo';
import './ProformaInvoice.css';

const ProformaInvoice = () => {
  const { invoiceId } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        setLoading(true);
        const response = await api.get(`/invoices/${invoiceId}`);
        setInvoice(response.data);
        setError(null);
      } catch (err) {
        console.error('Error fetching invoice:', err);
        setError('Failed to load invoice. Please try again.');
        setLoading(false);
      } finally {
        setLoading(false);
      }
    };

    if (invoiceId) {
      fetchInvoice();
    }
  }, [invoiceId]);

  const getSenderDetails = (userObj) => {
    const isAdmin = !userObj || userObj.role === 'partner' || userObj.userType === 'Administration';
    if (isAdmin) {
      return {
        brandName: 'Arshi Enterprises',
        companyName: '',
        address: 'Near Brajesh Auto Mobile Maranga',
        cityStatePin: 'Purnea, Bihar, 854304',
        gstNo: '10ATIPK1589P1ZA'
      };
    }
    return {
      brandName: userObj.companyName || userObj.displayName || userObj.username || 'Arshi GPS',
      companyName: userObj.companyName || userObj.displayName || '',
      address: userObj.address || '',
      cityStatePin: `${userObj.city || ''}${userObj.city && userObj.state ? ', ' : ''}${userObj.state || ''}${userObj.pincode ? ' - ' : ''}${userObj.pincode || ''}`,
      gstNo: userObj.gstNo || ''
    };
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

  const calculateTotals = () => {
    if (!invoice || !invoice.items) return { subtotal: 0, sgst: 0, cgst: 0, total: 0 };

    let subtotal = 0;
    let sgst = 0;
    let cgst = 0;

    invoice.items.forEach(item => {
      const unitPrice = parseFloat(item.unitPrice) || 0;
      const qty = parseInt(item.qty) || 1;
      const cgstRate = parseFloat(item.cgst) || 0;
      const sgstRate = parseFloat(item.sgst) || 0;

      const itemSubtotal = unitPrice * qty;
      subtotal += itemSubtotal;
      cgst += (itemSubtotal * cgstRate) / 100;
      sgst += (itemSubtotal * sgstRate) / 100;
    });

    return {
      subtotal: Math.round(subtotal),
      sgst: Math.round(sgst),
      cgst: Math.round(cgst),
      total: Math.round(subtotal + sgst + cgst)
    };
  };

  const downloadHTML = () => {
    if (!invoice) return;

    const totals = calculateTotals();
    const amountInWords = numberToWords(totals.total);
    const piDate = new Date(invoice.dateTime).toLocaleDateString('en-GB').replace(/\//g, '.');
    const customerName = invoice.endCustomerName || 'JYOTI CONSTRUCTION AND ENGINEERING Pvt. Ltd';
    const customerAddress = invoice.address || 'PAPRAPUR, Begusarai, Bihar, 851210';
    const customerMob = invoice.rmn || '9031622921';
    const customerGstin = invoice.poaNo || '10AAECJ5132H1Z3';
    const sender = getSenderDetails(invoice.userId);

    let itemsHtml = '';
    invoice.items.forEach((item, index) => {
      const unitPrice = parseFloat(item.unitPrice) || 0;
      const qty = parseInt(item.qty) || 1;
      const cgstRate = parseFloat(item.cgst) || 0;
      const sgstRate = parseFloat(item.sgst) || 0;

      const cgstAmt = Math.round((unitPrice * cgstRate) / 100);
      const sgstAmt = Math.round((unitPrice * sgstRate) / 100);
      const priceWithGst = unitPrice + cgstAmt + sgstAmt;
      const grossAmt = priceWithGst * qty;

      itemsHtml += `
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
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Proforma Invoice - ${invoice.piNo}</title>
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Nunito+Sans:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          *{box-sizing:border-box;margin:0;padding:0}
          :root{
            --teal:#007B8A;--teal-dark:#005a66;--teal-light:#E0F4F7;--teal-mid:#b2e4ec;
            --accent:#f0a500;--bg:#eef4f6;--white:#ffffff;--text:#1a2a30;--muted:#5a7a82;--border:#cce4e8
          }
          body{font-family:'Nunito Sans',sans-serif;background:var(--bg);color:var(--text);padding:32px 16px;min-height:100vh}
          .page{background:var(--white);max-width:794px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 6px 30px rgba(0,80,100,0.12);border:1px solid var(--border);padding:36px}
          .header{margin-bottom:22px;display:flex;justify-content:space-between;align-items:flex-start;gap:20px}
          .brand-name{font-family:'Nunito',sans-serif;font-size:34px;font-weight:800;color:#007B8A;letter-spacing:-0.5px}
          .brand-sub{color:#5a7a82;font-size:13px;margin-top:4px;line-height:1.65}
          .invoice-title-block{text-align:right;flex-shrink:0}
          .inv-label{font-family:'Nunito',sans-serif;font-size:22px;font-weight:800;color:#007B8A;letter-spacing:1px;text-transform:uppercase}
          .inv-meta{color:#5a7a82;font-size:12.5px;margin-top:7px;line-height:1.75}
          .accent-bar{height:5px;background:linear-gradient(90deg,#f0a500 0%,#f5d26e 50%,#b2e4ec 100%);margin-bottom:22px}
          .info-grid{display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1.5px solid var(--border);margin-bottom:22px}
          .info-box{padding:16px 20px;border-right:1px solid var(--border)}
          .info-box:last-child{border-right:none}
          .info-box-head{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#007B8A;margin-bottom:9px}
          .info-box p{font-size:12.5px;color:var(--text);line-height:1.65}
          .co-name{font-weight:700;font-size:13px;color:var(--text);margin-bottom:3px}
          table{width:100%;border-collapse:collapse;margin-bottom:20px}
          thead tr{background:#007B8A}
          thead th{color:#fff;font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;padding:11px 12px;text-align:center}
          thead th:first-child{border-radius:6px 0 0 0;padding-left:16px;text-align:center}
          thead th:last-child{border-radius:0 6px 0 0}
          tbody tr{border-bottom:1px solid var(--border)}
          tbody tr:hover{background:#E0F4F7}
          td{padding:12px 12px;font-size:13px;vertical-align:top;text-align:center}
          td:first-child{text-align:center;padding-left:16px}
          td.desc,.text-left{text-align:left}
          td.num{text-align:right}
          .sub-row td{background:#E0F4F7;font-weight:700;font-size:13px;color:#005a66;border-top:2px solid #b2e4ec;text-align:right}
          .bottom{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:20px 0;align-items:start}
          .amount-words{font-size:12.5px;color:var(--text);margin-bottom:14px;line-height:1.6}
          .amount-words strong{color:#005a66}
          .section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#007B8A;margin-bottom:10px;display:flex;align-items:center;gap:6px}
          .section-title::before{content:'';display:inline-block;width:3px;height:11px;background:var(--accent);border-radius:2px}
          .tc-list{list-style:none;padding:0;margin-bottom:18px}
          .tc-list li{font-size:11.5px;color:#2a4a52;line-height:1.65;padding:3px 0 3px 20px;position:relative}
          .tc-list li::before{content:attr(data-n);position:absolute;left:0;font-weight:700;color:var(--teal);font-size:11px}
          .bank-row{font-size:12px;color:var(--muted);padding:4px 0;display:flex;gap:8px;align-items:center}
          .bank-row span:first-child{font-weight:600;color:var(--text);min-width:115px}
          .bank-row input{border:none;border-bottom:1.5px dashed var(--border);background:transparent;font-size:12px;color:var(--text);width:160px;outline:none;font-family:inherit;padding:1px 2px}
          .bank-row input:focus{border-color:var(--teal)}
          .tax-row{display:flex;justify-content:space-between;font-size:12.5px;padding:4.5px 0;border-bottom:1px solid #eef4f6;color:var(--text)}
          .tax-row:last-child{border-bottom:none}
          .tax-row.hl{color:#005a66;font-weight:700}
          .total-box{background:#007B8A;border-radius:8px;padding:15px 18px;margin-top:14px;text-align:center;color:#fff}
          .total-label{color:rgba(255,255,255,0.8);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px}
          .total-amount{font-family:'Nunito',sans-serif;font-size:23px;font-weight:800;letter-spacing:-0.5px}
          .footer{margin-top:22px;padding-top:14px;border-top:1.5px solid var(--border);text-align:center;font-size:11px;color:#5a7a82;font-style:italic}
          @media print{
            body{background:#fff;padding:0}
            .page{box-shadow:none;border:none;border-radius:0}
            tbody tr:hover{background:transparent}
          }
        </style>
      </head>
      <body>
        <div class="page" id="invoice">
          <div class="header">
            <div>
              <div style="display:flex;align-items:center;gap:12px">
                <img src="${INVOICE_LOGO}" style="height: 48px; border-radius: 8px;" alt="Arshi Enterprises Logo" />
                <div class="brand-name">${sender.brandName}</div>
              </div>
              <div class="brand-sub">
                ${sender.companyName ? `${sender.companyName}<br>` : ''}
                ${sender.address ? `${sender.address}<br>` : ''}
                ${sender.cityStatePin ? `${sender.cityStatePin}<br>` : ''}
                ${sender.gstNo ? `GST No: ${sender.gstNo}` : ''}
              </div>
            </div>
            <div class="invoice-title-block">
              <div class="inv-label">Proforma Invoice</div>
              <div class="inv-meta">
                Date: ${piDate}<br>
                PI Invoice #: ${invoice.piNo || 'AE_PI_001'}
              </div>
            </div>
          </div>
          <div class="accent-bar"></div>

          <div class="info-grid">
            <div class="info-box">
              <div class="info-box-head">${invoice.isSubDealer ? 'Dealer / Sub-Dealer' : 'Customer'}</div>
              <p class="co-name">${invoice.isSubDealer && invoice.subDealerName ? invoice.subDealerName : (invoice.endCustomerName || 'Customer Name')}</p>
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

          <table>
            <thead>
              <tr>
                <th style="width:42px">SL</th>
                <th style="text-align:left">Description</th>
                <th style="width:52px">QTY</th>
                <th style="width:96px">Unit Price</th>
                <th style="width:54px">GST%</th>
                <th style="width:104px">Total (Rs)</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
              <tr class="sub-row">
                <td colspan="5" style="text-align:right;padding-right:16px;font-size:12px;letter-spacing:0.5px">SubTotal</td>
                <td class="num">${totals.subtotal.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

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
            <div>
              <div class="section-title">Tax Summary</div>
              <div class="tax-row hl"><span>SGST @ 9%</span><span>${totals.sgst.toFixed(2)}</span></div>
              <div class="tax-row hl"><span>CGST @ 9%</span><span>${totals.cgst.toFixed(2)}</span></div>
              <div class="tax-row hl"><span>Total Tax</span><span>${(totals.sgst + totals.cgst).toFixed(2)}</span></div>
              <div class="total-box">
                <div class="total-label">Total Amount</div>
                <div class="total-amount">INR ${totals.total.toFixed(2)}</div>
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
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Invoice_${invoice.piNo}_${new Date().getTime()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="proforma-loading">
        <FaSpinner className="spin" />
        <p>Loading Invoice...</p>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="proforma-error">
        <h2>Error</h2>
        <p>{error || 'Invoice not found'}</p>
      </div>
    );
  }

  const totals = calculateTotals();
  const amountInWords = numberToWords(totals.total);
  const piDate = new Date(invoice.dateTime).toLocaleDateString('en-GB').replace(/\//g, '.');
  const customerName = invoice.endCustomerName || 'JYOTI CONSTRUCTION AND ENGINEERING Pvt. Ltd';
  const customerAddress = invoice.address || 'PAPRAPUR, Begusarai, Bihar, 851210';
  const customerMob = invoice.rmn || '9031622921';
  const customerGstin = invoice.poaNo || '10AAECJ5132H1Z3';
  const sender = getSenderDetails(invoice.userId);

  return (
    <div className="proforma-invoice-wrapper">
      <div className="proforma-action-bar">
        <button className="proforma-btn proforma-btn-secondary" onClick={handlePrint}>
          <FaPrint /> Print
        </button>
        <button className="proforma-btn proforma-btn-primary" onClick={downloadHTML}>
          <FaDownload /> Download Invoice
        </button>
      </div>

      <div className="proforma-page">
        <div className="proforma-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <img src={INVOICE_LOGO} style={{ height: '48px', borderRadius: '8px' }} alt="Arshi Enterprises Logo" />
              <div className="proforma-brand-name">{sender.brandName}</div>
            </div>
            <div className="proforma-brand-sub">
              {sender.companyName && <>{sender.companyName}<br /></>}
              {sender.address && <>{sender.address}<br /></>}
              {sender.cityStatePin && <>{sender.cityStatePin}<br /></>}
              {sender.gstNo && <>GST No: {sender.gstNo}</>}
            </div>
          </div>
          <div className="proforma-invoice-title-block">
            <div className="proforma-inv-label">Proforma Invoice</div>
            <div className="proforma-inv-meta">
              Date: {piDate}<br />
              PI Invoice #: {invoice.piNo || 'AE_PI_001'}
            </div>
          </div>
        </div>

        <div className="proforma-accent-bar"></div>

        <div className="proforma-info-grid">
          <div className="proforma-info-box">
            <div className="proforma-info-box-head">{invoice.isSubDealer ? 'Dealer / Sub-Dealer' : 'Customer'}</div>
            <p className="proforma-co-name">{invoice.isSubDealer && invoice.subDealerName ? invoice.subDealerName : (invoice.endCustomerName || 'Customer Name')}</p>
            <p>{customerAddress}</p>
            <p>GSTIN: {customerGstin}</p>
          </div>
          <div className="proforma-info-box">
            <div className="proforma-info-box-head">Ship To</div>
            <p className="proforma-co-name">{customerName}</p>
            <p>{customerAddress}</p>
            <p>GSTIN: {customerGstin}</p>
          </div>
          <div className="proforma-info-box">
            <div className="proforma-info-box-head">Shipping Details</div>
            <p className="proforma-co-name">{customerName}</p>
            <p>{customerAddress}</p>
            <p>Mobile: {customerMob}</p>
            <p>GSTIN: {customerGstin}</p>
          </div>
        </div>

        <table className="proforma-table">
          <thead>
            <tr>
              <th style={{ width: '42px', textAlign: 'center' }}>SL</th>
              <th style={{ textAlign: 'left' }}>Description</th>
              <th style={{ width: '52px', textAlign: 'center' }}>QTY</th>
              <th style={{ width: '96px', textAlign: 'right' }}>Unit Price</th>
              <th style={{ width: '54px', textAlign: 'center' }}>GST%</th>
              <th style={{ width: '104px', textAlign: 'right' }}>Total (Rs)</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items && invoice.items.map((item, index) => {
              const unitPrice = parseFloat(item.unitPrice) || 0;
              const qty = parseInt(item.qty) || 1;
              const cgstRate = parseFloat(item.cgst) || 0;
              const sgstRate = parseFloat(item.sgst) || 0;
              const cgstAmt = Math.round((unitPrice * cgstRate) / 100);
              const sgstAmt = Math.round((unitPrice * sgstRate) / 100);
              const priceWithGst = unitPrice + cgstAmt + sgstAmt;
              const grossAmt = priceWithGst * qty;

              return (
                <tr key={index}>
                  <td style={{ textAlign: 'center' }}>{index + 1}</td>
                  <td style={{ textAlign: 'left' }}>{item.description}</td>
                  <td style={{ textAlign: 'center' }}>{qty}</td>
                  <td style={{ textAlign: 'right' }}>₹{unitPrice.toFixed(2)}</td>
                  <td style={{ textAlign: 'center' }}>{item.cgst || item.sgst || 9}%</td>
                  <td style={{ textAlign: 'right' }}>₹{grossAmt.toFixed(2)}</td>
                </tr>
              );
            })}
            <tr className="proforma-sub-row">
              <td colSpan="5" style={{ textAlign: 'right', paddingRight: '16px' }}>SubTotal</td>
              <td style={{ textAlign: 'right' }}>₹{totals.subtotal.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div className="proforma-bottom">
          <div>
            <div className="proforma-amount-words">
              <strong>Amount in Words:</strong> {amountInWords}
            </div>

            <div className="proforma-section-title">Terms &amp; Conditions</div>
            <ul className="proforma-tc-list">
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

            <div className="proforma-section-title">Bank Details</div>
            <div className="proforma-bank-row"><span>Account Name</span><span style={{fontWeight: 700, color: '#1a2a30'}}>ARSHI ENTERPRISES</span></div>
            <div className="proforma-bank-row"><span>Account Number</span><span style={{fontWeight: 700, color: '#1a2a30'}}>071205500764</span></div>
            <div className="proforma-bank-row"><span>Bank &amp; Branch</span><span style={{fontWeight: 700, color: '#1a2a30'}}>ICICI, Purnea</span></div>
            <div className="proforma-bank-row"><span>IFSC Code</span><span style={{fontWeight: 700, color: '#1a2a30'}}>ICIC0000712</span></div>
          </div>
          <div className="proforma-tax-block">
            <div className="proforma-section-title">Tax Summary</div>
            <div className="proforma-tax-row proforma-hl">
              <span>SGST @ 9%</span>
              <span>₹{totals.sgst.toFixed(2)}</span>
            </div>
            <div className="proforma-tax-row proforma-hl">
              <span>CGST @ 9%</span>
              <span>₹{totals.cgst.toFixed(2)}</span>
            </div>
            <div className="proforma-tax-row proforma-hl">
              <span>Total Tax</span>
              <span>₹{(totals.sgst + totals.cgst).toFixed(2)}</span>
            </div>
            <div className="proforma-total-box">
              <div className="proforma-total-label">Total Amount</div>
              <div className="proforma-total-amount">INR {totals.total.toFixed(2)}</div>
            </div>

            <div style={{ marginTop: '20px' }}>
              <div className="proforma-section-title">Features &amp; Benefits (FaB)</div>
              <ul className="proforma-tc-list" style={{ marginBottom: 0 }}>
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

        <div className="proforma-footer">
          <p>This document is computer generated and does not require a signature or stamp to be considered valid.</p>
        </div>
      </div>
    </div>
  );
};

export default ProformaInvoice;
