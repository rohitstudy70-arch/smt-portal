import { useState, useEffect } from 'react';
import { 
  FaGlobe, 
  FaPlus, 
  FaDownload, 
  FaSearch, 
  FaUser, 
  FaHistory, 
  FaArrowLeft, 
  FaRegMoneyBillAlt,
  FaFilter,
  FaArrowUp,
  FaArrowDown,
  FaFilePdf,
  FaFileCsv,
  FaWallet,
  FaChartBar,
  FaBoxes
} from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import './Ledger.css';

const getRole = (user) => {
  if (user?.role === 'partner') return 'ADMIN';
  if (user?.userType === 'Administration') return 'ADMIN';
  if (user?.userType === 'Sub Dealer') return 'SUB_DEALER';
  if (user?.userType === 'End Customer') return 'CUSTOMER';
  return 'DEALER';
};

const Ledger = () => {
  const { user: currentUser } = useAuth();
  const currentRole = getRole(currentUser);

  // Tabs: 'dashboard' or 'wallet-controls'
  const [activeTab, setActiveTab] = useState('dashboard');

  // Users in hierarchy list
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userError, setUserError] = useState('');

  // Selected dealer ID for filtering dashboard
  // Admin: "" (All Dealers), Dealer: currentUser._id (My Account)
  const [selectedDealerId, setSelectedDealerId] = useState(
    currentRole === 'ADMIN' ? '' : (currentUser?._id || '')
  );

  // Dashboard state
  const [transactions, setTransactions] = useState([]);
  const [txTotal, setTxTotal] = useState(0);
  const [summary, setSummary] = useState({
    totalCredit: 0,
    totalDebit: 0,
    currentBalance: 0,
    totalDevicesAssigned: 0
  });
  const [analytics, setAnalytics] = useState({
    todayTotalCredit: 0,
    todayTotalDebit: 0,
    monthlySales: [],
    pendingDues: 0,
    topDealers: []
  });
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [dashboardError, setDashboardError] = useState('');

  // Filters for dashboard
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [txType, setTxType] = useState(''); // 'Credit', 'Debit', or ''
  const [searchQuery, setSearchQuery] = useState('');
  const [txLimit, setTxLimit] = useState(10);
  const [txPage, setTxPage] = useState(1);

  // Accounts view search & limit
  const [userSearch, setUserSearch] = useState('');
  const [userLimit, setUserLimit] = useState(10);

  // Modal Form State (Credit / Debit entries)
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('Credit'); // 'Credit' or 'Debit'
  const [targetUserForModal, setTargetUserForModal] = useState(null);
  const [modalAmount, setModalAmount] = useState('');
  const [modalPaymentFor, setModalPaymentFor] = useState('Adjustment Entry');
  const [modalPayMode, setModalPayMode] = useState('Cash');
  const [modalReferenceNo, setModalReferenceNo] = useState('');
  const [modalRemarks, setModalRemarks] = useState('');
  const [submittingTx, setSubmittingTx] = useState(false);

  // Fetch users in hierarchy
  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const res = await api.get('/wallet/users');
      setUsers(res.data);
      setUserError('');
    } catch (err) {
      console.error(err);
      setUserError('Failed to load sub-users list.');
    } finally {
      setLoadingUsers(false);
    }
  };

  // Fetch dashboard data
  const fetchDashboardData = async () => {
    try {
      setLoadingDashboard(true);
      const res = await api.get('/wallet/ledger-dashboard', {
        params: {
          fromDate,
          toDate,
          search: searchQuery,
          type: txType,
          dealerId: selectedDealerId,
          limit: txLimit,
          page: txPage
        }
      });
      setTransactions(res.data.transactions);
      setTxTotal(res.data.total);
      setSummary(res.data.summary);
      setAnalytics(res.data.analytics);
      setDashboardError('');
    } catch (err) {
      console.error(err);
      setDashboardError('Failed to load ledger dashboard.');
    } finally {
      setLoadingDashboard(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [selectedDealerId, fromDate, toDate, txType, txLimit, txPage]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setTxPage(1);
    fetchDashboardData();
  };

  const handleOpenModal = (user, type = 'Credit') => {
    setTargetUserForModal(user);
    setModalType(type);
    setModalAmount('');
    setModalPaymentFor('Adjustment Entry');
    setModalPayMode('Cash');
    setModalReferenceNo('');
    setModalRemarks('');
    setShowModal(true);
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    if (!modalAmount || isNaN(modalAmount) || Number(modalAmount) <= 0) {
      alert('Please enter a valid amount.');
      return;
    }

    if (modalType === 'Debit' && targetUserForModal.availableBalance < Number(modalAmount)) {
      alert(`Insufficient balance. User has ₹${(targetUserForModal.availableBalance || 0).toFixed(2)}.`);
      return;
    }

    try {
      setSubmittingTx(true);
      const res = await api.post(`/wallet/transaction/${targetUserForModal._id}`, {
        amount: Number(modalAmount),
        type: modalType,
        paymentFor: modalPaymentFor,
        payMode: modalPayMode,
        referenceNo: modalReferenceNo,
        remarks: modalRemarks
      });

      alert(`Transaction of ₹${Number(modalAmount).toFixed(2)} recorded successfully!`);
      
      // Refresh current view
      fetchDashboardData();
      fetchUsers();
      setShowModal(false);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to submit transaction.');
    } finally {
      setSubmittingTx(false);
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    if (transactions.length === 0) {
      alert("No transaction records to export.");
      return;
    }
    const headers = [
      "Sl No.", "Date", "Transaction ID", "User / Dealer", "Payment For", "Reference No", 
      "Device Name", "IMEI", "ICCID", "Serial No", "Type", "Amount", "Balance After Tx", "Created By", "Remarks"
    ];

    const csvRows = [headers.join(",")];

    transactions.forEach((t, idx) => {
      const values = [
        idx + 1,
        new Date(t.date).toLocaleString(),
        t.transactionId,
        t.userId ? (t.userId.displayName || t.userId.companyName || t.userId.username) : "-",
        t.paymentFor,
        t.referenceNo || "-",
        t.deviceName || "-",
        t.imei || "-",
        t.iccid || "-",
        t.serialNo || "-",
        t.transactionType,
        t.transactedAmt,
        t.balanceAfterTransaction !== undefined ? t.balanceAfterTransaction : 0,
        t.createdBy ? (t.createdBy.displayName || t.createdBy.username) : "System",
        t.remarks || "-"
      ];
      const escaped = values.map(val => `"${String(val).replace(/"/g, '""')}"`);
      csvRows.push(escaped.join(","));
    });

    const csvString = csvRows.join("\n");
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute("download", `Ledger_Report_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Trigger print view
  const handleExportPDF = () => {
    window.print();
  };

  // Filter users list based on search query (for Tab 2)
  const filteredUsers = users.filter(u => {
    const q = userSearch.toLowerCase();
    return (
      (u.displayName || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.mobileNo || '').includes(q) ||
      (u.companyName || '').toLowerCase().includes(q) ||
      (u.userType || '').toLowerCase().includes(q)
    );
  });

  const displayUsers = filteredUsers.slice(0, userLimit);
  const totalTxPages = Math.ceil(txTotal / txLimit);

  // Compute maximum monthly sales for chart scaling
  const maxSale = Math.max(...(analytics.monthlySales?.map(m => m.total) || []), 1);

  // Determine selected dealer info for display
  const selectedDealerObj = users.find(u => u._id === selectedDealerId);
  const selectedDealerName = selectedDealerId === '' 
    ? 'All Dealers' 
    : (selectedDealerId === currentUser?._id 
        ? 'My Account' 
        : (selectedDealerObj ? (selectedDealerObj.displayName || selectedDealerObj.companyName || selectedDealerObj.username) : 'Dealer'));

  // Show Tab 2 only if user has descendants or is Admin
  const canManageAccounts = currentRole === 'ADMIN' || users.length > 0;

  return (
    <div className="ledger-container">
      {/* TABS NAVIGATION */}
      {canManageAccounts && (
        <div className="tabs-navigation no-print">
          <button 
            className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <FaHistory /> Ledger Dashboard
          </button>
          <button 
            className={`tab-btn ${activeTab === 'wallet-controls' ? 'active' : ''}`}
            onClick={() => setActiveTab('wallet-controls')}
          >
            <FaWallet /> User Wallet Controls
          </button>
        </div>
      )}

      {activeTab === 'dashboard' ? (
        <>
          {/* SUMMARY CARDS GRID */}
          <div className="summary-cards-grid no-print">
            <div className="summary-card credit-card">
              <div className="card-info">
                <span className="card-title">Total Credit</span>
                <span className="card-value">₹{summary.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="card-icon-wrapper">
                <FaArrowUp />
              </div>
            </div>

            <div className="summary-card debit-card">
              <div className="card-info">
                <span className="card-title">Total Debit</span>
                <span className="card-value">₹{summary.totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="card-icon-wrapper">
                <FaArrowDown />
              </div>
            </div>

            <div className="summary-card balance-card">
              <div className="card-info">
                <span className="card-title">Current Balance</span>
                <span className="card-value">₹{summary.currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="card-icon-wrapper">
                <FaWallet />
              </div>
            </div>

            <div className="summary-card devices-card">
              <div className="card-info">
                <span className="card-title">Assigned Devices</span>
                <span className="card-value">{summary.totalDevicesAssigned}</span>
              </div>
              <div className="card-icon-wrapper">
                <FaBoxes />
              </div>
            </div>
          </div>

          {/* ANALYTICS SECTION */}
          <div className="analytics-grid no-print">
            {/* Widget 1: Today's Summary & Dues */}
            <div className="analytics-widget">
              <div className="widget-header">Today's Summary & Outstanding</div>
              <div className="widget-body today-summary">
                <div className="stats-row">
                  <div className="stats-label">Today's Credit</div>
                  <div className="stats-val text-teal">₹{analytics.todayTotalCredit.toFixed(2)}</div>
                </div>
                <div className="stats-row">
                  <div className="stats-label">Today's Debit</div>
                  <div className="stats-val text-red">₹{analytics.todayTotalDebit.toFixed(2)}</div>
                </div>
                <div className="stats-divider"></div>
                <div className="stats-row highlight">
                  <div className="stats-label">Pending Dues (Overdrawn)</div>
                  <div className="stats-val text-red">₹{analytics.pendingDues.toFixed(2)}</div>
                </div>
              </div>
            </div>

            {/* Widget 2: Sales Chart */}
            <div className="analytics-widget">
              <div className="widget-header">Monthly Debit Trends ({new Date().getFullYear()})</div>
              <div className="widget-body">
                {analytics.monthlySales && analytics.monthlySales.length > 0 ? (
                  <div className="monthly-chart-container">
                    {analytics.monthlySales.map((item, idx) => {
                      const pct = (item.total / maxSale) * 100;
                      return (
                        <div key={idx} className="chart-bar-wrapper">
                          <div className="chart-bar-value" style={{ height: `${Math.max(pct, 2)}%` }} title={`₹${item.total}`}>
                            {item.total > 0 && <span className="bar-label">₹{Math.round(item.total)}</span>}
                          </div>
                          <span className="chart-bar-name">{item.month}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-4">No sales data for chart</div>
                )}
              </div>
            </div>

            {/* Widget 3: Top Dealers (Admin Only) */}
            {currentRole === 'ADMIN' && selectedDealerId === '' && (
              <div className="analytics-widget">
                <div className="widget-header">Top Dealers by Debit volume</div>
                <div className="widget-body">
                  {analytics.topDealers && analytics.topDealers.length > 0 ? (
                    <div className="top-dealers-list">
                      {analytics.topDealers.map((dealer, idx) => (
                        <div key={dealer.userId} className="dealer-leaderboard-row">
                          <div className="dealer-rank-info">
                            <span className="rank-badge">{idx + 1}</span>
                            <div>
                              <div className="leader-name">{dealer.name}</div>
                              <div className="leader-role">{dealer.role}</div>
                            </div>
                          </div>
                          <div className="leader-amount">₹{dealer.totalDebit.toLocaleString('en-IN')}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4">No top dealers data available</div>
                  )}
                </div>
              </div>
            )}

            {/* If not admin or showing specific dealer details */}
            {(currentRole !== 'ADMIN' || selectedDealerId !== '') && (
              <div className="analytics-widget">
                <div className="widget-header">Selected Profile Info</div>
                <div className="widget-body account-details-widget">
                  <div className="detail-line">
                    <strong>Owner / Dealer:</strong> {selectedDealerName}
                  </div>
                  {selectedDealerObj && (
                    <>
                      <div className="detail-line">
                        <strong>Username:</strong> {selectedDealerObj.username}
                      </div>
                      <div className="detail-line">
                        <strong>Company:</strong> {selectedDealerObj.companyName || '-'}
                      </div>
                      <div className="detail-line">
                        <strong>Mobile:</strong> {selectedDealerObj.mobileNo || '-'}
                      </div>
                    </>
                  )}
                  {selectedDealerId === currentUser?._id && (
                    <>
                      <div className="detail-line">
                        <strong>Username:</strong> {currentUser.username}
                      </div>
                      <div className="detail-line">
                        <strong>Company:</strong> {currentUser.companyName || '-'}
                      </div>
                      <div className="detail-line">
                        <strong>Mobile:</strong> {currentUser.mobileNo || '-'}
                      </div>
                    </>
                  )}
                  {selectedDealerId !== '' && (selectedDealerObj || selectedDealerId === currentUser?._id) && (
                    <div className="quick-actions-widget">
                      <button 
                        className="btn-ledger-action credit" 
                        onClick={() => handleOpenModal(selectedDealerObj || currentUser, 'Credit')}
                      >
                        <FaPlus /> Credit
                      </button>
                      <button 
                        className="btn-ledger-action debit" 
                        onClick={() => handleOpenModal(selectedDealerObj || currentUser, 'Debit')}
                      >
                        <FaPlus /> Debit
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* MAIN TRANSACTION LEDGER PANEL */}
          <div className="card-panel">
            <div className="card-panel-header selected-user-header no-print">
              <div className="header-left">
                <FaHistory className="panel-icon" />
                <span className="panel-title text-uppercase">
                  TRANSACTION HISTORY {selectedDealerId ? `: ${selectedDealerName}` : ' (GLOBAL VIEW)'}
                </span>
              </div>
            </div>

            <div className="card-panel-body">
              {dashboardError && <div className="alert-message error no-print">{dashboardError}</div>}

              {/* Filters Bar */}
              <div className="table-filters-bar no-print">
                <div className="filters-left">
                  <div className="filter-item">
                    <label>Show</label>
                    <select value={txLimit} onChange={(e) => { setTxLimit(Number(e.target.value)); setTxPage(1); }}>
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                  </div>

                  {/* Dealer selector dropdown (Admin / Dealer with descendants) */}
                  {canManageAccounts && (
                    <div className="filter-item">
                      <label>Select Account</label>
                      <select 
                        value={selectedDealerId} 
                        onChange={(e) => { setSelectedDealerId(e.target.value); setTxPage(1); }}
                      >
                        {currentRole === 'ADMIN' ? (
                          <>
                            <option value="">All Dealers</option>
                            {users.map(u => (
                              <option key={u._id} value={u._id}>
                                {u.displayName || u.companyName || u.username} ({u.userType})
                              </option>
                            ))}
                          </>
                        ) : (
                          <>
                            <option value={currentUser._id}>My Account</option>
                            {users.map(u => (
                              <option key={u._id} value={u._id}>
                                {u.displayName || u.companyName || u.username} ({u.userType})
                              </option>
                            ))}
                          </>
                        )}
                      </select>
                    </div>
                  )}

                  <div className="filter-item">
                    <label>From Date</label>
                    <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setTxPage(1); }} />
                  </div>
                  
                  <div className="filter-item">
                    <label>To Date</label>
                    <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setTxPage(1); }} />
                  </div>

                  <div className="filter-item">
                    <label>Type</label>
                    <select value={txType} onChange={(e) => { setTxType(e.target.value); setTxPage(1); }}>
                      <option value="">All</option>
                      <option value="Credit">Credit (+)</option>
                      <option value="Debit">Debit (-)</option>
                    </select>
                  </div>
                </div>

                <div className="filters-right">
                  <form onSubmit={handleSearchSubmit} className="search-input-group">
                    <input 
                      type="text" 
                      placeholder="Search (IMEI / ID)..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <button type="submit"><FaSearch /></button>
                  </form>

                  <div className="export-buttons-group">
                    <button className="btn-export-alt csv" onClick={handleExportCSV} title="Export to CSV">
                      <FaFileCsv /> CSV
                    </button>
                    <button className="btn-export-alt pdf" onClick={handleExportPDF} title="Print/Export PDF">
                      <FaFilePdf /> PDF
                    </button>
                  </div>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="table-responsive printable-area">
                <table className="table-custom">
                  <thead>
                    <tr>
                      <th style={{ width: '50px' }}>Sno</th>
                      <th>Date</th>
                      <th>Transaction ID</th>
                      <th>User / Dealer</th>
                      <th>Payment For</th>
                      <th>Device details / Ref</th>
                      <th>Pay Mode</th>
                      <th>Type</th>
                      <th>Remarks</th>
                      <th>Amt Requested</th>
                      <th>Amt Transacted</th>
                      <th>Balance After</th>
                      <th className="no-print">Created By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingDashboard ? (
                      <tr>
                        <td colSpan={13} className="text-center">Loading ledger records...</td>
                      </tr>
                    ) : transactions.length > 0 ? (
                      transactions.map((t, idx) => (
                        <tr key={t._id || idx}>
                          <td>{((txPage - 1) * txLimit) + idx + 1}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{new Date(t.date).toLocaleString()}</td>
                          <td className="text-semibold text-teal">{t.transactionId}</td>
                          <td>
                            {t.userId ? (
                              <div className="table-user-name">
                                {t.userId.displayName || t.userId.companyName || t.userId.username}
                                <span className="sub-role-label">({t.userId.userType || 'Dealer'})</span>
                              </div>
                            ) : '-'}
                          </td>
                          <td className="text-semibold">{t.paymentFor || '-'}</td>
                          <td>
                            {t.deviceName ? (
                              <div className="device-detail-cell">
                                <div className="device-name-sub">{t.deviceName}</div>
                                <div className="device-details-bullets">
                                  {t.imei && <span>IMEI: {t.imei}</span>}
                                  {t.iccid && <span> | ICCID: {t.iccid}</span>}
                                  {t.serialNo && <span> | S/N: {t.serialNo}</span>}
                                </div>
                              </div>
                            ) : (
                              t.referenceNo || '-'
                            )}
                          </td>
                          <td>{t.payMode}</td>
                          <td>
                            <span className={`badge-type ${t.transactionType.toLowerCase()}`}>
                              {t.transactionType}
                            </span>
                          </td>
                          <td className="text-remarks" title={t.remarks}>{t.remarks || '-'}</td>
                          <td>{t.requestedAmt}</td>
                          <td className={`text-bold ${t.transactionType === 'Credit' ? 'text-teal' : 'text-red'}`}>
                            ₹{t.transactedAmt.toFixed(2)}
                          </td>
                          <td className="text-bold">
                            ₹{(t.balanceAfterTransaction !== undefined ? t.balanceAfterTransaction : 0).toFixed(2)}
                          </td>
                          <td className="no-print">
                            {t.createdBy ? (
                              <div className="created-by-cell">
                                {t.createdBy.displayName || t.createdBy.username}
                              </div>
                            ) : 'System'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={13} className="text-center">No transaction records found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Row */}
              <div className="table-pagination-row no-print">
                <div className="pagination-info">
                  Showing {txTotal > 0 ? ((txPage - 1) * txLimit) + 1 : 0} to {Math.min(txPage * txLimit, txTotal)} of {txTotal} records
                </div>
                
                {totalTxPages > 1 && (
                  <div className="pagination-controls">
                    <button 
                      disabled={txPage === 1} 
                      onClick={() => setTxPage(txPage - 1)}
                      className="btn-page-arrow"
                    >
                      &lt;
                    </button>
                    
                    {Array.from({ length: totalTxPages }).map((_, idx) => (
                      <button 
                        key={idx}
                        onClick={() => setTxPage(idx + 1)}
                        className={`btn-page-number ${txPage === idx + 1 ? 'active' : ''}`}
                      >
                        {idx + 1}
                      </button>
                    ))}
                    
                    <button 
                      disabled={txPage === totalTxPages} 
                      onClick={() => setTxPage(txPage + 1)}
                      className="btn-page-arrow"
                    >
                      &gt;
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        /* TAB 2: USER WALLET CONTROLS - ACCOUNTS LIST */
        <div className="card-panel no-print">
          <div className="card-panel-header">
            <FaUser className="panel-icon" />
            <span className="panel-title">DEALER / SUB-USER WALLET BALANCES</span>
          </div>

          <div className="card-panel-body">
            {userError && <div className="alert-message error">{userError}</div>}

            <div className="table-filters-bar">
              <div className="filters-left">
                <div className="filter-item">
                  <label>Show</label>
                  <select value={userLimit} onChange={(e) => setUserLimit(Number(e.target.value))}>
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>

              <div className="filters-right">
                <div className="search-input-group">
                  <input 
                    type="text" 
                    placeholder="Search sub-users..." 
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                  />
                  <button type="button"><FaSearch /></button>
                </div>
              </div>
            </div>

            <div className="table-responsive">
              <table className="table-custom">
                <thead>
                  <tr>
                    <th style={{ width: '60px' }}>Sl No.</th>
                    <th>Name</th>
                    <th>Username</th>
                    <th>User Type</th>
                    <th>Mobile No</th>
                    <th>Available Balance</th>
                    <th style={{ width: '220px', textAlign: 'center' }}>Record Len-Den</th>
                    <th style={{ width: '120px', textAlign: 'center' }}>Ledger Dashboard</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingUsers ? (
                    <tr>
                      <td colSpan={8} className="text-center">Loading accounts...</td>
                    </tr>
                  ) : displayUsers.length > 0 ? (
                    displayUsers.map((u, idx) => (
                      <tr key={u._id || idx}>
                        <td>{idx + 1}</td>
                        <td className="text-semibold">{u.displayName || u.companyName || '-'}</td>
                        <td>{u.username}</td>
                        <td>
                          <span className={`badge-role ${u.userType?.replace(' ', '').toLowerCase() || 'customer'}`}>
                            {u.userType || 'Customer'}
                          </span>
                        </td>
                        <td>{u.mobileNo || '-'}</td>
                        <td className="text-bold text-teal">₹{(u.availableBalance || 0).toFixed(2)}</td>
                        <td>
                          <div className="ledger-action-buttons justify-center">
                            <button 
                              className="btn-ledger-action credit" 
                              onClick={() => handleOpenModal(u, 'Credit')}
                            >
                              <FaRegMoneyBillAlt /> Credit (+)
                            </button>
                            <button 
                              className="btn-ledger-action debit" 
                              onClick={() => handleOpenModal(u, 'Debit')}
                            >
                              <FaRegMoneyBillAlt /> Debit (-)
                            </button>
                          </div>
                        </td>
                        <td className="text-center">
                          <button 
                            className="btn-view-ledger"
                            onClick={() => {
                              setSelectedDealerId(u._id);
                              setActiveTab('dashboard');
                              setTxPage(1);
                              setSearchQuery('');
                            }}
                          >
                            <FaHistory /> View
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="text-center">No accounts found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="table-info-row">
              Showing 1 to {displayUsers.length} of {filteredUsers.length} records
            </div>
          </div>
        </div>
      )}

      {/* PRINT-ONLY DIVISION FOR window.print() */}
      <div className="printable-ledger-report print-only">
        <div className="print-report-header">
          <h1>LEDGER STATEMENT REPORT</h1>
          <p><strong>Date Generated:</strong> {new Date().toLocaleString()}</p>
          <p><strong>Account Name:</strong> {selectedDealerName}</p>
          <p><strong>Period:</strong> {fromDate || 'Beginning'} to {toDate || 'Present'}</p>
        </div>

        <div className="print-summary-grid">
          <div className="print-summary-card">
            <span className="print-summary-title">Total Credit</span>
            <span className="print-summary-value">₹{summary.totalCredit.toFixed(2)}</span>
          </div>
          <div className="print-summary-card">
            <span className="print-summary-title">Total Debit</span>
            <span className="print-summary-value">₹{summary.totalDebit.toFixed(2)}</span>
          </div>
          <div className="print-summary-card">
            <span className="print-summary-title">Current Balance</span>
            <span className="print-summary-value">₹{summary.currentBalance.toFixed(2)}</span>
          </div>
          <div className="print-summary-card">
            <span className="print-summary-title">Devices Assigned</span>
            <span className="print-summary-value">{summary.totalDevicesAssigned}</span>
          </div>
        </div>

        <table className="print-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>Sno</th>
              <th style={{ width: '120px' }}>Date</th>
              <th style={{ width: '120px' }}>Transaction ID</th>
              <th style={{ width: '150px' }}>User / Dealer</th>
              <th style={{ width: '120px' }}>Payment For</th>
              <th>Reference / Device details</th>
              <th style={{ width: '80px' }}>Type</th>
              <th style={{ width: '100px' }}>Amount</th>
              <th style={{ width: '100px' }}>Balance After</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t, idx) => (
              <tr key={t._id || idx}>
                <td>{idx + 1}</td>
                <td>{new Date(t.date).toLocaleString()}</td>
                <td>{t.transactionId}</td>
                <td>{t.userId ? (t.userId.displayName || t.userId.companyName || t.userId.username) : "-"}</td>
                <td>{t.paymentFor}</td>
                <td>
                  {t.deviceName ? (
                    <span>
                      {t.deviceName} {t.imei && `(IMEI: ${t.imei})`} {t.iccid && `(ICCID: ${t.iccid})`} {t.serialNo && `(S/N: ${t.serialNo})`}
                    </span>
                  ) : (
                    t.referenceNo || t.remarks || '-'
                  )}
                </td>
                <td>{t.transactionType}</td>
                <td>₹{t.transactedAmt.toFixed(2)}</td>
                <td>₹{(t.balanceAfterTransaction !== undefined ? t.balanceAfterTransaction : 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* RECORD TRANSACTION MODAL */}
      {showModal && targetUserForModal && (
        <div className="modal-backdrop no-print">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Record Len-Den Entry ({modalType})</h3>
              <button className="btn-close-modal" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleModalSubmit}>
              <div className="modal-body">
                <div className="ledger-modal-user-info">
                  <strong>User:</strong> {targetUserForModal.displayName || targetUserForModal.companyName || targetUserForModal.username}<br />
                  <strong>Current Balance:</strong> ₹{(targetUserForModal.availableBalance || 0).toFixed(2)}
                </div>

                <div className="form-group">
                  <label htmlFor="amount">Amount (INR) *</label>
                  <input
                    type="number"
                    id="amount"
                    value={modalAmount}
                    onChange={(e) => setModalAmount(e.target.value)}
                    placeholder="Enter transaction amount"
                    required
                    min="1"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="paymentFor">Payment For</label>
                  <select 
                    id="paymentFor"
                    value={modalPaymentFor}
                    onChange={(e) => setModalPaymentFor(e.target.value)}
                  >
                    <option value="Balance Load">Balance Load</option>
                    <option value="Device Purchase">Device Purchase</option>
                    <option value="Activation Charge">Activation Charge</option>
                    <option value="Adjustment Entry">Adjustment Entry</option>
                    <option value="Invoice Payment">Invoice Payment</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="payMode">Payment Mode</label>
                  <select 
                    id="payMode"
                    value={modalPayMode}
                    onChange={(e) => setModalPayMode(e.target.value)}
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer (NEFT/IMPS)</option>
                    <option value="UPI">UPI</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Wallet Adjustment">Wallet Adjustment</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="referenceNo">Reference No / Tx ID</label>
                  <input
                    type="text"
                    id="referenceNo"
                    value={modalReferenceNo}
                    onChange={(e) => setModalReferenceNo(e.target.value)}
                    placeholder="Ref number, UTR number, check number..."
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="remarks">Remarks *</label>
                  <textarea
                    id="remarks"
                    value={modalRemarks}
                    onChange={(e) => setModalRemarks(e.target.value)}
                    placeholder="Write detailed reason/remarks..."
                    rows={3}
                    required
                  />
                </div>
              </div>
              
              <div className="modal-footer">
                <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-submit" disabled={submittingTx}>
                  {submittingTx ? 'Recording...' : `Record ${modalType}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Ledger;
