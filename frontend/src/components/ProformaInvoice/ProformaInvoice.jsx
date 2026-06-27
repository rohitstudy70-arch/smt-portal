import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { FaDownload, FaPrint, FaSpinner } from 'react-icons/fa';
import api from '../../utils/api';
import { INVOICE_LOGO } from '../../utils/invoiceLogo';
import {
  buildProformaInvoiceData,
  formatCurrency,
  formatRate,
  renderProformaInvoiceHtml,
} from '../../utils/proformaInvoiceTemplate';
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
      } finally {
        setLoading(false);
      }
    };

    if (invoiceId) {
      fetchInvoice();
    }
  }, [invoiceId]);

  const downloadHTML = () => {
    if (!invoice) return;

    const invoiceData = buildProformaInvoiceData(invoice);
    const htmlContent = renderProformaInvoiceHtml(invoice, { logo: INVOICE_LOGO });
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = invoiceData.downloadFileName;
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

  const invoiceData = buildProformaInvoiceData(invoice);

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

      <div className="proforma-page" id="invoice">
        <div className="proforma-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <img src={INVOICE_LOGO} className="proforma-logo" alt="Arshi Enterprises Logo" />
              <div className="proforma-brand-name">{invoiceData.sender.brandName}</div>
            </div>
            <div className="proforma-brand-sub">
              {invoiceData.senderLines.map((line) => (
                <span key={line}>
                  {line}
                  <br />
                </span>
              ))}
            </div>
          </div>
          <div className="proforma-invoice-title-block">
            <div className="proforma-inv-label">Proforma Invoice</div>
            <div className="proforma-inv-meta">
              Date: {invoiceData.piDate}
              <br />
              PI No: {invoiceData.piNo}
            </div>
          </div>
        </div>

        <div className="proforma-accent-bar"></div>

        <div className="proforma-info-grid">
          <div className="proforma-info-box">
            <div className="proforma-info-box-head">{invoiceData.billToLabel}</div>
            <p className="proforma-co-name">{invoiceData.billToName}</p>
            <p>{invoiceData.customerAddress}</p>
            <p>GSTIN: {invoiceData.customerGstin}</p>
          </div>
          <div className="proforma-info-box">
            <div className="proforma-info-box-head">Ship To</div>
            <p className="proforma-co-name">{invoiceData.customerName}</p>
            <p>{invoiceData.customerAddress}</p>
            <p>GSTIN: {invoiceData.customerGstin}</p>
          </div>
          <div className="proforma-info-box">
            <div className="proforma-info-box-head">Shipping Details</div>
            <p className="proforma-co-name">{invoiceData.customerName}</p>
            <p>{invoiceData.customerAddress}</p>
            <p>Mobile: {invoiceData.customerMobile}</p>
            <p>GSTIN: {invoiceData.customerGstin}</p>
          </div>
        </div>

        <div className="proforma-table-wrap">
          <table className="proforma-table">
            <thead>
              <tr>
                <th style={{ width: '42px', textAlign: 'center' }}>Sr. No</th>
                <th style={{ textAlign: 'left' }}>Description</th>
                <th style={{ width: '52px', textAlign: 'right' }}>Qty</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Price Including Tax</th>
                <th style={{ width: '110px', textAlign: 'right' }}>Rate Per Unit</th>
                <th style={{ width: '90px', textAlign: 'right' }}>GST 18%</th>
                <th style={{ width: '110px', textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {invoiceData.items.map((item) => (
                <tr key={`${item.index}-${item.description}`}>
                  <td style={{ textAlign: 'center' }}>{item.index}</td>
                  <td className="proforma-desc">{item.description}</td>
                  <td className="proforma-num">{item.qty}</td>
                  <td className="proforma-num">{formatCurrency(item.priceWithGst)}</td>
                  <td className="proforma-num">{formatCurrency(item.unitPrice)}</td>
                  <td className="proforma-num">{formatCurrency(item.gstAmount)}</td>
                  <td className="proforma-num">{formatCurrency(item.total)}</td>
                </tr>
              ))}
              {Array.from({ length: invoiceData.emptyRows }).map((_, index) => (
                <tr className="proforma-empty-row" key={`empty-${index}`}>
                  <td>-</td>
                  <td>-</td>
                  <td>-</td>
                  <td>-</td>
                  <td>-</td>
                  <td>-</td>
                  <td>-</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="proforma-sub-row">
                <td colSpan="6" style={{ textAlign: 'right', paddingRight: '16px' }}>Sub Total</td>
                <td className="proforma-num">{formatCurrency(invoiceData.totals.subtotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="proforma-bottom">
          <div>
            <div className="proforma-amount-words">
              <strong>Amount in Words:</strong> {invoiceData.amountInWords}
            </div>

            <div className="proforma-section-title">Terms &amp; Conditions</div>
            <ul className="proforma-tc-list">
              {invoiceData.terms.map((term) => (
                <li key={term} className="proforma-tc-item">
                  <svg className="proforma-tc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  <span className="proforma-tc-text">{term}</span>
                </li>
              ))}
            </ul>

            <div className="proforma-section-title">Bank Details</div>
            <div className="proforma-bank-row">
              <span>Account Name</span>
              <span style={{ fontWeight: 700 }}>{invoiceData.bankDetails.accountName}</span>
            </div>
            <div className="proforma-bank-row">
              <span>Account Number</span>
              <span style={{ fontWeight: 700 }}>{invoiceData.bankDetails.accountNo}</span>
            </div>
            <div className="proforma-bank-row">
              <span>Bank &amp; Branch</span>
              <span style={{ fontWeight: 700 }}>{invoiceData.bankDetails.bankBranch}</span>
            </div>
            <div className="proforma-bank-row">
              <span>IFSC Code</span>
              <span style={{ fontWeight: 700 }}>{invoiceData.bankDetails.ifscCode}</span>
            </div>
          </div>

          <div className="proforma-tax-block">
            <div className="proforma-section-title">Tax Summary</div>
            <div className="proforma-tax-row proforma-hl">
              <span>SGST @ 9%</span>
              <span>{invoiceData.isIntraState ? formatCurrency(invoiceData.totals.sgst) : '0.00'}</span>
            </div>
            <div className="proforma-tax-row proforma-hl">
              <span>CGST @ 9%</span>
              <span>{invoiceData.isIntraState ? formatCurrency(invoiceData.totals.cgst) : '0.00'}</span>
            </div>
            <div className="proforma-tax-row">
              <span>IGST @ 18%</span>
              <span>{invoiceData.isIntraState ? '0.00' : formatCurrency(invoiceData.totals.igst)}</span>
            </div>
            <div className="proforma-tax-row proforma-hl">
              <span>Tax Amount</span>
              <span>{formatCurrency(invoiceData.totals.taxAmount)}</span>
            </div>
            <div className="proforma-total-box">
              <div className="proforma-total-label">Total Amount</div>
              <div className="proforma-total-amount">INR {formatCurrency(invoiceData.totals.total)}</div>
            </div>
            <div style={{ marginTop: '20px' }}>
              <div className="proforma-section-title">Features &amp; Benefits (FaB)</div>
              <ul className="proforma-tc-list" style={{ marginBottom: 0 }}>
                {invoiceData.fabList.map((fab) => (
                  <li key={fab} className="proforma-tc-item">
                    <svg className="proforma-tc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    <span className="proforma-tc-text">{fab}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="proforma-footer">
          <p>This document is computer generated and does not require the Registrar's signature or the Company's stamp to be considered valid.</p>
        </div>
      </div>
    </div>
  );
};

export default ProformaInvoice;
