import { useEffect, useState } from 'react';
import { FaFileInvoiceDollar, FaSearch, FaTimes, FaCoins, FaDownload, FaPrint, FaEdit } from 'react-icons/fa';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';

const RenewalDueManagement = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  
  // Data State
  const [dealersDue, setDealersDue] = useState([]);
  const [dealersList, setDealersList] = useState([]);
  
  // Filters State
  const [filters, setFilters] = useState({
    dealerId: '',
    paymentStatus: '',
    fromDate: '',
    toDate: '',
    requestId: '',
    imei: '',
    vehicleNumber: '',
  });

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDealerRow, setSelectedDealerRow] = useState(null);
  const [dealerRequests, setDealerRequests] = useState([]);
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [selectedRequest, setSelectedRequest] = useState(null);

  // Form State
  const [paymentForm, setPaymentForm] = useState({
    receivedAmount: '',
    paymentMode: 'Cash',
    transactionId: '',
    paymentDate: new Date().toISOString().split('T')[0],
    remarks: '',
  });

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError('');
      const [dueDashboardRes, dealersRes] = await Promise.all([
        api.get('/portal/renewals/admin-due-dashboard', { params: filters }),
        api.get('/portal/users', { params: { type: 'dealer' } }),
      ]);
      setDealersDue(dueDashboardRes.data || []);
      setDealersList(dealersRes.data || []);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to load Renewal Due dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [filters]);

  const handleResetFilters = () => {
    setFilters({
      dealerId: '',
      paymentStatus: '',
      fromDate: '',
      toDate: '',
      requestId: '',
      imei: '',
      vehicleNumber: '',
    });
  };

  const handleOpenPaymentModal = async (dealerRow) => {
    setSelectedDealerRow(dealerRow);
    setPaymentForm({
      receivedAmount: '',
      paymentMode: 'Cash',
      transactionId: '',
      paymentDate: new Date().toISOString().split('T')[0],
      remarks: '',
    });
    setSelectedRequestId('');
    setSelectedRequest(null);
    setIsModalOpen(true);

    try {
      // Find all unpaid or partially paid requests for this dealer
      if (dealerRow.rawRequests) {
        // Filter out fully paid or rejected
        const activeRequests = dealerRow.rawRequests.filter(
          r => r.paymentStatus !== 'Paid' && r.status !== 'Rejected'
        );
        setDealerRequests(activeRequests);
      }
    } catch (err) {
      console.error('Error fetching dealer requests:', err);
    }
  };

  const handleRequestChange = (reqId) => {
    setSelectedRequestId(reqId);
    const foundReq = dealerRequests.find(r => r._id === reqId);
    setSelectedRequest(foundReq || null);
    if (foundReq) {
      setPaymentForm(current => ({
        ...current,
        receivedAmount: foundReq.receivedAmount || '',
        transactionId: foundReq.transactionId || '',
        paymentMode: foundReq.paymentMode || 'Cash',
        paymentDate: foundReq.paymentDate ? new Date(foundReq.paymentDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        remarks: foundReq.remarks || '',
      }));
    }
  };

  const handleSavePayment = async (e) => {
    e.preventDefault();
    if (!selectedRequestId) {
      alert('Please select a Request ID.');
      return;
    }
    if (paymentForm.receivedAmount === '' || Number(paymentForm.receivedAmount) < 0) {
      alert('Please enter a valid Received Amount.');
      return;
    }
    if (Number(paymentForm.receivedAmount) > (selectedRequest.billAmount || 0)) {
      alert(`Received Amount cannot be greater than Bill Amount (₹${selectedRequest.billAmount}).`);
      return;
    }

    try {
      await api.put(`/portal/renewals/${selectedRequestId}`, {
        receivedAmount: Number(paymentForm.receivedAmount),
        paymentMode: paymentForm.paymentMode,
        transactionId: paymentForm.transactionId,
        paymentDate: paymentForm.paymentDate,
        remarks: paymentForm.remarks,
      });

      setNotice('Payment updated successfully.');
      setIsModalOpen(false);
      loadDashboardData();
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to update payment.');
    }
  };

  // Export functions
  const handleExportCSV = () => {
    const headers = [
      'Dealer Name',
      'Dealer Code',
      'Pending Requests',
      'Total Amount (INR)',
      'Received Amount (INR)',
      'Remaining Due (INR)',
      'Last Payment Date',
      'Payment Status',
    ];
    const rows = dealersDue.map(d => [
      d.dealerName,
      d.dealerCode,
      d.pendingRequestsCount,
      d.totalRenewalAmount,
      d.receivedAmount,
      d.remainingDue,
      d.lastPaymentDate ? new Date(d.lastPaymentDate).toLocaleDateString() : '-',
      d.paymentStatus,
    ]);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Renewal_Due_Report_${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    const rowsHtml = dealersDue.map(d => `
      <tr>
        <td>${d.dealerName}</td>
        <td>${d.dealerCode}</td>
        <td style="text-align: center;">${d.pendingRequestsCount}</td>
        <td style="text-align: right;">₹${d.totalRenewalAmount}</td>
        <td style="text-align: right;">₹${d.receivedAmount}</td>
        <td style="text-align: right; font-weight: bold; color: ${d.remainingDue > 0 ? '#ef4444' : '#10b981'};">₹${d.remainingDue}</td>
        <td style="text-align: center;">${d.lastPaymentDate ? new Date(d.lastPaymentDate).toLocaleDateString() : '-'}</td>
        <td style="text-align: center; font-weight: bold;">${d.paymentStatus}</td>
      </tr>
    `).join('');

    const htmlContent = `
      <html>
      <head>
        <title>Renewal Due Management Report</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; margin: 30px; }
          h2 { color: #1e3a8a; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background: #f1f5f9; color: #475569; padding: 12px 10px; font-weight: 600; border-bottom: 2px solid #cbd5e1; font-size: 13px; text-align: left; }
          td { padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
          .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 40px; }
          @media print {
            body { margin: 0; }
          }
        </style>
      </head>
      <body>
        <h2>Renewal Due Management Report</h2>
        <p><strong>Generated Date:</strong> ${new Date().toLocaleString()}</p>
        <table>
          <thead>
            <tr>
              <th>Dealer Name</th>
              <th>Dealer Code</th>
              <th style="text-align: center;">Pending Requests</th>
              <th style="text-align: right;">Total Amount</th>
              <th style="text-align: right;">Received Amount</th>
              <th style="text-align: right;">Remaining Due</th>
              <th style="text-align: center;">Last Payment Date</th>
              <th style="text-align: center;">Payment Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div class="footer">
          <p>ARSHI ENTERPRISES - Confidential Report</p>
        </div>
        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  };

  return (
    <div className="portal-page">
      <div className="portal-titlebar">
        <div>
          <span className="portal-kicker">Administration</span>
          <h1>Renewal Due Management</h1>
        </div>
        <div className="portal-title-actions">
          <button onClick={handleExportCSV} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }} className="portal-link-button">
            <FaDownload /> Export CSV
          </button>
          <button onClick={handlePrint} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }} className="portal-link-button">
            <FaPrint /> Print Report
          </button>
        </div>
      </div>

      {notice && (
        <div style={{ background: '#d1fae5', color: '#065f46', padding: '12px 18px', borderRadius: '8px', border: '1px solid #a7f3d0', fontSize: '13px', fontWeight: '600' }}>
          {notice}
        </div>
      )}

      {/* Filters Section */}
      <section className="portal-panel" style={{ borderTop: '4px solid #3b82f6', background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05), 0 4px 6px -2px rgba(0,0,0,0.02)', borderRadius: '12px', marginBottom: '20px' }}>
        <div className="portal-panel-header" style={{ background: 'transparent', borderBottom: '1px solid #e2e8f0', padding: '18px 24px' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px' }}>Filters & Search</h2>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>Filter ledger records</span>
          </div>
          <FaSearch style={{ width: '18px', height: '18px', color: '#3b82f6' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', padding: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#475569', letterSpacing: '0.05em', marginBottom: '8px' }}>Dealer</span>
            <select 
              value={filters.dealerId}
              onChange={(e) => setFilters(current => ({ ...current, dealerId: e.target.value }))}
              className="fancy-filter-input"
            >
              <option value="">All Dealers</option>
              {dealersList.map(d => (
                <option key={d._id} value={d._id}>{d.displayName || d.companyName || d.username}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#475569', letterSpacing: '0.05em', marginBottom: '8px' }}>Payment Status</span>
            <select 
              value={filters.paymentStatus}
              onChange={(e) => setFilters(current => ({ ...current, paymentStatus: e.target.value }))}
              className="fancy-filter-input"
            >
              <option value="">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Partially Paid">Partially Paid</option>
              <option value="Paid">Paid</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#475569', letterSpacing: '0.05em', marginBottom: '8px' }}>Request ID</span>
            <input 
              type="text" 
              value={filters.requestId}
              onChange={(e) => setFilters(current => ({ ...current, requestId: e.target.value }))}
              placeholder="Search Request ID..."
              className="fancy-filter-input"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#475569', letterSpacing: '0.05em', marginBottom: '8px' }}>IMEI</span>
            <input 
              type="text" 
              value={filters.imei}
              onChange={(e) => setFilters(current => ({ ...current, imei: e.target.value }))}
              placeholder="Search IMEI..."
              className="fancy-filter-input"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#475569', letterSpacing: '0.05em', marginBottom: '8px' }}>Vehicle Number</span>
            <input 
              type="text" 
              value={filters.vehicleNumber}
              onChange={(e) => setFilters(current => ({ ...current, vehicleNumber: e.target.value }))}
              placeholder="Search Vehicle..."
              className="fancy-filter-input"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#475569', letterSpacing: '0.05em', marginBottom: '8px' }}>From Date</span>
            <input 
              type="date" 
              value={filters.fromDate}
              onChange={(e) => setFilters(current => ({ ...current, fromDate: e.target.value }))}
              className="fancy-filter-input"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#475569', letterSpacing: '0.05em', marginBottom: '8px' }}>To Date</span>
            <input 
              type="date" 
              value={filters.toDate}
              onChange={(e) => setFilters(current => ({ ...current, toDate: e.target.value }))}
              className="fancy-filter-input"
            />
          </div>
        </div>
        <div style={{ padding: '0 24px 24px 24px' }}>
          <button 
            type="button" 
            onClick={handleResetFilters}
            style={{ 
              background: '#ffffff', 
              border: '1px solid #cbd5e1', 
              color: '#475569', 
              padding: '10px 20px', 
              fontWeight: '600', 
              borderRadius: '8px', 
              fontSize: '13px', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '8px', 
              transition: 'all 0.2s ease', 
              cursor: 'pointer',
              boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#f8fafc';
              e.currentTarget.style.color = '#0f172a';
              e.currentTarget.style.borderColor = '#94a3b8';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = '#ffffff';
              e.currentTarget.style.color = '#475569';
              e.currentTarget.style.borderColor = '#cbd5e1';
            }}
          >
            <FaTimes /> Reset Filters
          </button>
        </div>
      </section>

      {/* Due Ledger Table */}
      <section className="portal-panel">
        <div className="portal-panel-header">
          <div>
            <h2>Renewal Due Ledgers</h2>
            <span>Summary of dealer renewal outstanding dues</span>
          </div>
          <FaCoins className="portal-panel-icon" />
        </div>
        
        {loading ? (
          <div style={{ padding: '40px', textAlignment: 'center', color: '#64748b' }}>Loading ledgers...</div>
        ) : (
          <div className="portal-table-wrap">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Dealer Name</th>
                  <th>Dealer Code</th>
                  <th style={{ textAlign: 'center' }}>Pending Requests</th>
                  <th style={{ textAlign: 'right' }}>Total Amount</th>
                  <th style={{ textAlign: 'right' }}>Received Amount</th>
                  <th style={{ textAlign: 'right' }}>Remaining Due</th>
                  <th style={{ textAlign: 'center' }}>Last Payment Date</th>
                  <th style={{ textAlign: 'center' }}>Payment Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {dealersDue.map((row) => (
                  <tr key={row.dealerId || row.dealerName}>
                    <td className="strong">{row.dealerName}</td>
                    <td>{row.dealerCode}</td>
                    <td style={{ textAlign: 'center' }}>{row.pendingRequestsCount}</td>
                    <td style={{ textAlign: 'right' }}>₹{row.totalRenewalAmount.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>₹{row.receivedAmount.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', fontWeight: '700', color: row.remainingDue > 0 ? '#ef4444' : '#10b981' }}>
                      ₹{row.remainingDue.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'center' }}>{formatDate(row.lastPaymentDate)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '700',
                        textTransform: 'uppercase',
                        background: row.paymentStatus === 'Paid' ? '#d1fae5' : row.paymentStatus === 'Partially Paid' ? '#fef3c7' : '#fee2e2',
                        color: row.paymentStatus === 'Paid' ? '#065f46' : row.paymentStatus === 'Partially Paid' ? '#92400e' : '#991b1b',
                      }}>
                        {row.paymentStatus}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => handleOpenPaymentModal(row)}
                        disabled={row.pendingRequestsCount === 0}
                        style={{
                          background: row.pendingRequestsCount === 0 ? '#cbd5e1' : '#3b82f6',
                          color: '#fff',
                          border: 'none',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: row.pendingRequestsCount === 0 ? 'not-allowed' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <FaEdit /> Update Payment
                      </button>
                    </td>
                  </tr>
                ))}
                {dealersDue.length === 0 && (
                  <tr>
                    <td colSpan={9} className="portal-empty">No renewal due records found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Update Payment Modal */}
      {isModalOpen && selectedDealerRow && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0, 0, 0, 0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '500px', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1', paddingBottom: '10px', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>Update Payment</h3>
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)} 
                style={{ background: 'none', border: 'none', fontSize: '24px', lineHeight: '1', cursor: 'pointer', color: '#64748b' }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleSavePayment} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Dealer Name</span>
                <input type="text" value={selectedDealerRow.dealerName} readOnly style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 12px', fontSize: '13px' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Select Request ID *</span>
                <select 
                  value={selectedRequestId} 
                  onChange={(e) => handleRequestChange(e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 12px', fontSize: '13px' }}
                  required
                >
                  <option value="">Select Request</option>
                  {dealerRequests.map(r => (
                    <option key={r._id} value={r._id}>
                      {r.requestId} (IMEI: {r.imei} - Vehicle: {r.vehicleNumber})
                    </option>
                  ))}
                </select>
              </div>

              {selectedRequest && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Bill Amount</span>
                      <strong style={{ fontSize: '16px', color: '#0f172a' }}>₹{(selectedRequest.billAmount || 0).toLocaleString()}</strong>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Remaining Due</span>
                      <strong style={{ fontSize: '16px', color: '#ef4444' }}>
                        ₹{(Math.max((selectedRequest.billAmount || 0) - (Number(paymentForm.receivedAmount) || 0), 0)).toLocaleString()}
                      </strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Received Amount *</span>
                    <input 
                      type="number" 
                      value={paymentForm.receivedAmount} 
                      onChange={(e) => setPaymentForm(current => ({ ...current, receivedAmount: e.target.value }))}
                      placeholder="Enter amount received..."
                      style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 12px', fontSize: '13px' }}
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Payment Mode</span>
                    <select 
                      value={paymentForm.paymentMode} 
                      onChange={(e) => setPaymentForm(current => ({ ...current, paymentMode: e.target.value }))}
                      style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 12px', fontSize: '13px' }}
                    >
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Cheque">Cheque</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Transaction ID</span>
                    <input 
                      type="text" 
                      value={paymentForm.transactionId} 
                      onChange={(e) => setPaymentForm(current => ({ ...current, transactionId: e.target.value }))}
                      placeholder="Enter transaction ref..."
                      style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 12px', fontSize: '13px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Payment Date</span>
                    <input 
                      type="date" 
                      value={paymentForm.paymentDate} 
                      onChange={(e) => setPaymentForm(current => ({ ...current, paymentDate: e.target.value }))}
                      style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 12px', fontSize: '13px' }}
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Remarks</span>
                    <textarea 
                      value={paymentForm.remarks} 
                      onChange={(e) => setPaymentForm(current => ({ ...current, remarks: e.target.value }))}
                      placeholder="Add payment notes..."
                      style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', minHeight: '60px' }}
                    />
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="submit" style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>
                  Save Payment
                </button>
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ flex: 1, background: '#64748b', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RenewalDueManagement;
