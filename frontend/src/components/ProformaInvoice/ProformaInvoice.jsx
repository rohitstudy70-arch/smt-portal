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
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <img src={INVOICE_LOGO} className="proforma-logo" alt="Arshi Enterprises Logo" />
            <div>
              <div className="proforma-brand-name">{invoiceData.sender.brandName}</div>
              <div className="proforma-brand-sub">
                {invoiceData.senderLines.map((line) => (
                  <span key={line}>
                    {line}
                    <br />
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="proforma-invoice-title-block">
            <div className="proforma-inv-label">Proforma Invoice</div>
            <div className="proforma-inv-meta">
              Date: {invoiceData.piDate}
              <br />
              PI Invoice #: {invoiceData.piNo}
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
                <th style={{ width: '42px', textAlign: 'center' }}>SL</th>
                <th style={{ textAlign: 'left' }}>Description</th>
                <th style={{ width: '52px', textAlign: 'right' }}>QTY</th>
                <th style={{ width: '96px', textAlign: 'right' }}>Unit Price</th>
                <th style={{ width: '54px', textAlign: 'right' }}>GST</th>
                <th style={{ width: '104px', textAlign: 'right' }}>Total (Rs)</th>
              </tr>
            </thead>
            <tbody>
              {invoiceData.items.map((item) => (
                <tr key={`${item.index}-${item.description}`}>
                  <td style={{ textAlign: 'center' }}>{item.index}</td>
                  <td className="proforma-desc">{item.description}</td>
                  <td className="proforma-num">{item.qty}</td>
                  <td className="proforma-num">{formatCurrency(item.unitPrice)}</td>
                  <td className="proforma-num">{formatRate(item.displayGstRate)}%</td>
                  <td className="proforma-num">{formatCurrency(item.taxableValue)}</td>
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
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="proforma-sub-row">
                <td colSpan="5" style={{ textAlign: 'right', paddingRight: '16px' }}>SubTotal</td>
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
              {invoiceData.terms.map((term, index) => (
                <li key={term} data-n={`${index + 1}.`}>{term}</li>
              ))}
            </ul>

            <div className="proforma-section-title">Bank Details</div>
            <div className="proforma-bank-row">
              <span>Account Number</span>
              <input type="text" placeholder="_______________" aria-label="Account Number" />
            </div>
            <div className="proforma-bank-row">
              <span>Bank &amp; Branch</span>
              <input type="text" placeholder="_______________" aria-label="Bank and Branch" />
            </div>
            <div className="proforma-bank-row">
              <span>IFSC Code</span>
              <input type="text" placeholder="_______________" aria-label="IFSC Code" />
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
