import { useState, useEffect } from 'react';
import { FaGlobe, FaPlus, FaDownload, FaWallet, FaSearch } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import './WalletSystem.css';

const WalletSystem = () => {
  const { user, updateProfile } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters
  const [limit, setLimit] = useState(5);
  const [page, setPage] = useState(1);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  
  // Add Wallet Modal/Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addAmount, setAddAmount] = useState('');
  const [addRemarks, setAddRemarks] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const res = await api.get('/wallet/transactions', {
        params: {
          fromDate,
          toDate,
          search,
          limit,
          page
        }
      });
      setTransactions(res.data.transactions);
      setTotal(res.data.total);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch transaction history. Please try again.');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [fromDate, toDate, limit, page]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchTransactions();
  };

  const handleAddWalletSubmit = async (e) => {
    e.preventDefault();
    if (!addAmount || isNaN(addAmount) || Number(addAmount) <= 0) {
      alert('Please enter a valid amount.');
      return;
    }

    try {
      setAdding(true);
      const res = await api.post('/wallet/add', {
        amount: Number(addAmount),
        type: 'Credit',
        payMode: 'Manualentry',
        remarks: addRemarks || 'Wallet topup request'
      });

      // Update AuthContext user details
      if (user) {
        updateProfile({
          ...user,
          availableBalance: res.data.availableBalance
        });
      }

      alert('Funds added successfully to wallet!');
      setShowAddModal(false);
      setAddAmount('');
      setAddRemarks('');
      setPage(1);
      fetchTransactions();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to add funds. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  // Pagination helper
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="wallet-system-container">
      {/* Upper Actions Row */}
      <div className="wallet-actions-row">
        <div className="wallet-balance-center">
          Available Balance: <span className="balance-value">₹{user?.availableBalance?.toFixed(2) || '0.00'}</span>
        </div>
        
        <div className="button-group">
          <button className="btn-add-wallet" onClick={() => setShowAddModal(true)}>
            <FaPlus /> Add Wallet
          </button>
          <button className="btn-export" onClick={() => alert('Exporting transaction history to Excel...')}>
            <FaDownload /> Export
          </button>
          <button className="btn-subdealer-wallet" onClick={() => alert('Redirecting to subdealer wallets...')}>
            <FaWallet /> Subdealer Wallet
          </button>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="card-panel">
        <div className="card-panel-header">
          <FaGlobe className="panel-icon" />
          <span className="panel-title">TRANSACTION HISTORY</span>
        </div>
        
        <div className="card-panel-body">
          {error && <div className="alert-message error">{error}</div>}
          
          {/* Filters Bar */}
          <div className="table-filters-bar">
            <div className="filters-left">
              <div className="filter-item">
                <label>Show</label>
                <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
              
              <div className="filter-item">
                <label>Invoice From</label>
                <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} />
              </div>
              
              <div className="filter-item">
                <label>Invoice To</label>
                <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} />
              </div>
            </div>

            <form className="filters-right" onSubmit={handleSearchSubmit}>
              <div className="search-input-group">
                <input 
                  type="text" 
                  placeholder="Search..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
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
                  <th style={{ width: '40px' }}><input type="checkbox" readOnly /></th>
                  <th style={{ width: '50px' }}>Sno</th>
                  <th>Date</th>
                  <th>Transaction ID</th>
                  <th>Payment ID</th>
                  <th>Payment For</th>
                  <th>Reference No</th>
                  <th>Pay Mode</th>
                  <th>Transaction Type</th>
                  <th>Status</th>
                  <th>Remarks</th>
                  <th>Max Days</th>
                  <th>Requested Amt</th>
                  <th>Transacted Amt</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={14} className="text-center">Loading transaction history...</td>
                  </tr>
                ) : transactions.length > 0 ? (
                  transactions.map((t, index) => (
                    <tr key={t._id || index}>
                      <td><input type="checkbox" readOnly /></td>
                      <td>{((page - 1) * limit) + index + 1}</td>
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
                      <td>{t.maxDays}</td>
                      <td>{t.requestedAmt}</td>
                      <td className="text-bold">₹{t.transactedAmt.toFixed(2)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={14} className="text-center">No transaction records found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Row */}
          <div className="table-pagination-row">
            <div className="pagination-info">
              Showing {total > 0 ? ((page - 1) * limit) + 1 : 0} to {Math.min(page * limit, total)} of {total} records
            </div>
            
            {totalPages > 1 && (
              <div className="pagination-controls">
                <button 
                  disabled={page === 1} 
                  onClick={() => setPage(page - 1)}
                  className="btn-page-arrow"
                >
                  &lt;
                </button>
                
                {Array.from({ length: totalPages }).map((_, idx) => (
                  <button 
                    key={idx}
                    onClick={() => setPage(idx + 1)}
                    className={`btn-page-number ${page === idx + 1 ? 'active' : ''}`}
                  >
                    {idx + 1}
                  </button>
                ))}
                
                <button 
                  disabled={page === totalPages} 
                  onClick={() => setPage(page + 1)}
                  className="btn-page-arrow"
                >
                  &gt;
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Wallet Modal */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Add Wallet Balance</h3>
              <button className="btn-close-modal" onClick={() => setShowAddModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleAddWalletSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="amount">Amount (INR)</label>
                  <input
                    type="number"
                    id="amount"
                    value={addAmount}
                    onChange={(e) => setAddAmount(e.target.value)}
                    placeholder="Enter amount to add"
                    required
                    min="1"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="remarks">Remarks</label>
                  <textarea
                    id="remarks"
                    value={addRemarks}
                    onChange={(e) => setAddRemarks(e.target.value)}
                    placeholder="Reference, bank details, NEFT remarks..."
                    rows={3}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-cancel" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn-submit" disabled={adding}>
                  {adding ? 'Adding...' : 'Add Balance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletSystem;
