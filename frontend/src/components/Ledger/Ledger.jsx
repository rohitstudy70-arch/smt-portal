import { useState, useEffect } from 'react';
import { 
  FaGlobe, 
  FaPlus, 
  FaDownload, 
  FaSearch, 
  FaUser, 
  FaHistory, 
  FaArrowLeft, 
  FaRegMoneyBillAlt 
} from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import './Ledger.css';

const getRole = (user) => {
  if (user?.role === 'partner') return 'ADMIN';
  if (user?.userType === 'Sub Dealer') return 'SUB_DEALER';
  if (user?.userType === 'End Customer') return 'CUSTOMER';
  return 'DEALER';
};

const Ledger = () => {
  const { user: currentUser } = useAuth();
  const currentRole = getRole(currentUser);

  // States
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userError, setUserError] = useState('');
  
  // Selected user for ledger detail view
  const [selectedUser, setSelectedUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [transactionError, setTransactionError] = useState('');
  
  // Selected user for transaction modal
  const [targetUserForModal, setTargetUserForModal] = useState(null);
  const [showModal, setShowModal] = useState(false);
  
  // Search & Filter for Users List
  const [userSearch, setUserSearch] = useState('');
  const [userLimit, setUserLimit] = useState(10);
  
  // Filters for Transaction History
  const [txLimit, setTxLimit] = useState(10);
  const [txPage, setTxPage] = useState(1);
  const [txFromDate, setTxFromDate] = useState('');
  const [txToDate, setTxToDate] = useState('');
  const [txSearch, setTxSearch] = useState('');
  const [txTotal, setTxTotal] = useState(0);

  // Modal Form State
  const [modalAmount, setModalAmount] = useState('');
  const [modalType, setModalType] = useState('Credit'); // 'Credit' or 'Debit'
  const [modalPaymentFor, setModalPaymentFor] = useState('Adjustment Entry');
  const [modalPayMode, setModalPayMode] = useState('Cash');
  const [modalReferenceNo, setModalReferenceNo] = useState('');
  const [modalRemarks, setModalRemarks] = useState('');
  const [submittingTx, setSubmittingTx] = useState(false);

  // Fetch all sub-users
  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const res = await api.get('/wallet/users');
      setUsers(res.data);
      setUserError('');
    } catch (err) {
      console.error(err);
      setUserError('Failed to load sub-users list. Please try again.');
    } finally {
      setLoadingUsers(false);
    }
  };

  // Fetch transactions for selected user
  const fetchTransactions = async (userId) => {
    if (!userId) return;
    try {
      setLoadingTransactions(true);
      const res = await api.get(`/wallet/transactions/${userId}`, {
        params: {
          fromDate: txFromDate,
          toDate: txToDate,
          search: txSearch,
          limit: txLimit,
          page: txPage
        }
      });
      setTransactions(res.data.transactions);
      setTxTotal(res.data.total);
      
      // Update selectedUser balance in local state in case it changed
      setSelectedUser(res.data.user);
      setTransactionError('');
    } catch (err) {
      console.error(err);
      setTransactionError('Failed to fetch transaction history. Please try again.');
    } finally {
      setLoadingTransactions(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedUser) {
      fetchTransactions(selectedUser._id);
    }
  }, [selectedUser?._id, txFromDate, txToDate, txLimit, txPage]);

  const handleTxSearchSubmit = (e) => {
    e.preventDefault();
    setTxPage(1);
    fetchTransactions(selectedUser._id);
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
      alert(`Insufficient balance. User has ₹${targetUserForModal.availableBalance.toFixed(2)}.`);
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
      
      // If modal was opened from detail view, refresh that user's view
      if (selectedUser && selectedUser._id === targetUserForModal._id) {
        fetchTransactions(selectedUser._id);
      }
      
      // Update the user item in the local users list
      setUsers(prev => prev.map(u => {
        if (u._id === targetUserForModal._id) {
          return { ...u, availableBalance: res.data.availableBalance };
        }
        return u;
      }));

      setShowModal(false);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to submit transaction.');
    } finally {
      setSubmittingTx(false);
    }
  };

  // Filter users list based on search query
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

  return (
    <div className="ledger-container">
      {!selectedUser ? (
        // LIST VIEW OF DEALERS
        <div className="card-panel">
          <div className="card-panel-header">
            <FaUser className="panel-icon" />
            <span className="panel-title">DEALER / SUB-USER ACCOUNTS LIST</span>
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
                    placeholder="Search dealers..." 
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
                    <th style={{ width: '120px', textAlign: 'center' }}>Ledger</th>
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
                              setSelectedUser(u);
                              setTxPage(1);
                              setTxSearch('');
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
      ) : (
        // TRANSACTION LEDGER FOR SELECTED USER
        <div className="card-panel">
          <div className="card-panel-header selected-user-header">
            <div className="header-left">
              <button className="btn-back" onClick={() => { setSelectedUser(null); fetchUsers(); }}>
                <FaArrowLeft /> Back
              </button>
              <span className="panel-title text-uppercase">
                LEDGER: {selectedUser.displayName || selectedUser.companyName || selectedUser.username} ({selectedUser.userType})
              </span>
            </div>
            <div className="header-right text-bold">
              Available Balance: <span className="balance-highlight">₹{(selectedUser.availableBalance || 0).toFixed(2)}</span>
            </div>
          </div>

          <div className="card-panel-body">
            <div className="detail-actions-row">
              <div className="button-group">
                <button className="btn-ledger-action credit" onClick={() => handleOpenModal(selectedUser, 'Credit')}>
                  <FaPlus /> Credit Funds (+)
                </button>
                <button className="btn-ledger-action debit" onClick={() => handleOpenModal(selectedUser, 'Debit')}>
                  <FaPlus /> Debit Funds (-)
                </button>
                <button className="btn-export" onClick={() => alert(`Exporting ledger for ${selectedUser.username} to Excel...`)}>
                  <FaDownload /> Export Ledger
                </button>
              </div>
            </div>

            {transactionError && <div className="alert-message error">{transactionError}</div>}

            {/* Filters Bar */}
            <div className="table-filters-bar">
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
                
                <div className="filter-item">
                  <label>From Date</label>
                  <input type="date" value={txFromDate} onChange={(e) => { setTxFromDate(e.target.value); setTxPage(1); }} />
                </div>
                
                <div className="filter-item">
                  <label>To Date</label>
                  <input type="date" value={txToDate} onChange={(e) => { setTxToDate(e.target.value); setTxPage(1); }} />
                </div>
              </div>

              <form className="filters-right" onSubmit={handleTxSearchSubmit}>
                <div className="search-input-group">
                  <input 
                    type="text" 
                    placeholder="Search ledger..." 
                    value={txSearch}
                    onChange={(e) => setTxSearch(e.target.value)}
                  />
                  <button type="submit"><FaSearch /></button>
                </div>
              </form>
            </div>

            {/* Table Container */}
            <div className="table-responsive">
              <table className="table-custom">
                <thead>
                  <tr>
                    <th style={{ width: '50px' }}>Sno</th>
                    <th>Date</th>
                    <th>Transaction ID</th>
                    <th>Payment ID</th>
                    <th>Payment For</th>
                    <th>Reference No</th>
                    <th>Pay Mode</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Remarks</th>
                    <th>Amt Requested</th>
                    <th>Amt Transacted</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingTransactions ? (
                    <tr>
                      <td colSpan={12} className="text-center">Loading ledger entries...</td>
                    </tr>
                  ) : transactions.length > 0 ? (
                    transactions.map((t, idx) => (
                      <tr key={t._id || idx}>
                        <td>{((txPage - 1) * txLimit) + idx + 1}</td>
                        <td>{new Date(t.date).toLocaleString()}</td>
                        <td className="text-semibold text-teal">{t.transactionId}</td>
                        <td>{t.paymentId || '-'}</td>
                        <td>{t.paymentFor || '-'}</td>
                        <td>{t.referenceNo || '-'}</td>
                        <td>{t.payMode}</td>
                        <td>
                          <span className={`badge-type ${t.transactionType.toLowerCase()}`}>
                            {t.transactionType}
                          </span>
                        </td>
                        <td>
                          <span className="badge-status-success">{t.status}</span>
                        </td>
                        <td className="text-remarks" title={t.remarks}>{t.remarks || '-'}</td>
                        <td>{t.requestedAmt}</td>
                        <td className="text-bold">₹{t.transactedAmt.toFixed(2)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={12} className="text-center">No transaction records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Row */}
            <div className="table-pagination-row">
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
      )}

      {/* RECORD TRANSACTION MODAL */}
      {showModal && targetUserForModal && (
        <div className="modal-backdrop">
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
