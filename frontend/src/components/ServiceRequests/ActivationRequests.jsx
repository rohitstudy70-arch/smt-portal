import { useState, useEffect } from 'react';
import { FaSyncAlt, FaPlus, FaCheck, FaTimes, FaSpinner } from 'react-icons/fa';
import api from '../../utils/api';
import './ActivationRequests.css';

const ActivationRequests = () => {
  const [requests, setRequests] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);
  const [search, setSearch] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // New Request Simulation State
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    quantity: 1,
    requestType: 'Commercial Plan',
    plan: '1 Year',
    piNo: '',
    amount: 1300,
    remarks: ''
  });

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        setLoading(true);
        const response = await api.get('/activation-requests', {
          params: { page, limit, search }
        });
        setRequests(response.data.requests);
        setTotalCount(response.data.total);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching activation requests:', err);
        setLoading(false);
      }
    };

    fetchRequests();
  }, [page, limit, search, refreshTrigger]);

  useEffect(() => {
    const qty = formData.quantity;
    const type = formData.requestType;
    const plan = formData.plan;

    if (type === 'Commercial Plan') {
      if (plan === '1 Year') {
        setFormData(prev => ({ ...prev, amount: qty * 1300 }));
      } else if (plan === '2 Years') {
        setFormData(prev => ({ ...prev, amount: qty * 2600 }));
      }
    } else if (type === 'Recharge Plan') {
      if (plan === 'recharge NIC') {
        setFormData(prev => ({ ...prev, amount: qty * 1500 }));
      } else if (plan === 'RENEWAL MINING') {
        setFormData(prev => ({ ...prev, amount: qty * 1800 }));
      }
    }
  }, [formData.quantity, formData.requestType, formData.plan]);

  const handleLimitChange = (e) => {
    setLimit(parseInt(e.target.value));
    setPage(1);
  };

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= Math.ceil(totalCount / limit)) {
      setPage(newPage);
    }
  };

  // Handle raise request form submission
  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/activation-requests', formData);
      setShowModal(false);
      setSubmitting(false);
      setFormData({
        quantity: 1,
        requestType: 'Commercial Plan',
        plan: '1 Year',
        piNo: '',
        amount: 1300,
        remarks: ''
      });
      // Refresh list
      handleRefresh();
      alert('Activation Request raised successfully!');
    } catch (err) {
      console.error('Error creating request:', err);
      setSubmitting(false);
      alert(err.response?.data?.message || 'Failed to raise request.');
    }
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
    <div className="requests-panel">
      <div className="requests-header">
        <span className="requests-title">
          <FaSyncAlt style={{ cursor: 'pointer' }} onClick={handleRefresh} />
          LATEST UPLOADED REQUESTS
        </span>
        <button className="btn-raise" onClick={() => setShowModal(true)}>
          <FaPlus /> Raise Request
        </button>
      </div>

      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 2000
        }}>
          <div style={{
            background: 'white', padding: '25px', borderRadius: '4px',
            width: '450px', boxShadow: '0 5px 15px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ marginBottom: '15px', color: '#00897b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Raise Activation Request</span>
              <FaTimes style={{ cursor: 'pointer', fontSize: '16px', color: '#888' }} onClick={() => setShowModal(false)} />
            </h3>
            <form onSubmit={handleSubmitRequest} style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontWeight: '600' }}>Quantity</label>
                <input 
                  type="number" 
                  min="1" 
                  value={formData.quantity}
                  onChange={(e) => setFormData({...formData, quantity: parseInt(e.target.value) || 1})}
                  style={{ padding: '6px', border: '1px solid #ccc', borderRadius: '2px' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontWeight: '600' }}>Request Type</label>
                <select 
                  value={formData.requestType}
                  onChange={(e) => {
                    const type = e.target.value;
                    let defaultPlan = '1 Year';
                    let defaultAmt = 1300;
                    if (type === 'Recharge Plan') {
                      defaultPlan = 'recharge NIC';
                      defaultAmt = 1500;
                    } else if (type === 'Top-up') {
                      defaultPlan = '1 Month';
                      defaultAmt = 100;
                    }
                    setFormData({
                      ...formData,
                      requestType: type,
                      plan: defaultPlan,
                      amount: defaultAmt
                    });
                  }}
                  style={{ padding: '6px', border: '1px solid #ccc', borderRadius: '2px' }}
                >
                  <option value="Commercial Plan">Commercial Plan</option>
                  <option value="Top-up">Top-up</option>
                  <option value="Recharge Plan">Recharge Plan</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontWeight: '600' }}>Plan</label>
                <select 
                  value={formData.plan}
                  onChange={(e) => setFormData({...formData, plan: e.target.value})}
                  style={{ padding: '6px', border: '1px solid #ccc', borderRadius: '2px' }}
                >
                  {formData.requestType === 'Commercial Plan' && (
                    <>
                      <option value="1 Month">1 Month</option>
                      <option value="1 Year">1 Year</option>
                      <option value="2 Years">2 Years</option>
                    </>
                  )}
                  {formData.requestType === 'Recharge Plan' && (
                    <>
                      <option value="recharge NIC">recharge NIC</option>
                      <option value="RENEWAL MINING">RENEWAL MINING</option>
                    </>
                  )}
                  {formData.requestType === 'Top-up' && (
                    <>
                      <option value="1 Month">1 Month</option>
                      <option value="1 Year">1 Year</option>
                      <option value="2 Years">2 Years</option>
                    </>
                  )}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontWeight: '600' }}>PI No</label>
                <input 
                  type="text" 
                  value={formData.piNo}
                  onChange={(e) => setFormData({...formData, piNo: e.target.value})}
                  placeholder="e.g. iTR_PI_0626_43466"
                  style={{ padding: '6px', border: '1px solid #ccc', borderRadius: '2px' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontWeight: '600' }}>Amount (₹)</label>
                <input 
                  type="number" 
                  min="0.01" 
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: parseFloat(e.target.value) || 0})}
                  readOnly={(formData.requestType === 'Commercial Plan' && (formData.plan === '1 Year' || formData.plan === '2 Years')) || (formData.requestType === 'Recharge Plan' && (formData.plan === 'recharge NIC' || formData.plan === 'RENEWAL MINING'))}
                  style={{ 
                    padding: '6px', 
                    border: '1px solid #ccc', 
                    borderRadius: '2px',
                    backgroundColor: ((formData.requestType === 'Commercial Plan' && (formData.plan === '1 Year' || formData.plan === '2 Years')) || (formData.requestType === 'Recharge Plan' && (formData.plan === 'recharge NIC' || formData.plan === 'RENEWAL MINING'))) ? '#f1f5f9' : 'white',
                    cursor: ((formData.requestType === 'Commercial Plan' && (formData.plan === '1 Year' || formData.plan === '2 Years')) || (formData.requestType === 'Recharge Plan' && (formData.plan === 'recharge NIC' || formData.plan === 'RENEWAL MINING'))) ? 'not-allowed' : 'default'
                  }}
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontWeight: '600' }}>Remarks</label>
                <textarea 
                  value={formData.remarks}
                  onChange={(e) => setFormData({...formData, remarks: e.target.value})}
                  placeholder="Device serial numbers or remarks"
                  style={{ padding: '6px', border: '1px solid #ccc', borderRadius: '2px', height: '60px', resize: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  style={{ padding: '6px 15px', border: '1px solid #ccc', background: 'white', borderRadius: '2px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={submitting}
                  style={{ padding: '6px 15px', border: 'none', background: '#00897b', color: 'white', borderRadius: '2px', cursor: 'pointer' }}
                >
                  {submitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="requests-filters">
        <div className="show-entries">
          Show 
          <select value={limit} onChange={handleLimitChange}>
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select> 
          entries
        </div>

        <div className="search-entries">
          Search: 
          <input 
            type="text" 
            value={search} 
            onChange={handleSearchChange} 
            placeholder="Search by Request ID, Plan, Remarks"
          />
        </div>
      </div>

      <div className="table-responsive">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: '#666' }}>
            <FaSpinner className="spin" style={{ marginRight: '8px' }} /> Loading requests...
          </div>
        ) : (
          <table className="table-requests">
            <thead>
              <tr>
                <th style={{ width: '40px' }}><input type="checkbox" /></th>
                <th>No.</th>
                <th>Request ID</th>
                <th>Is Sub Dealer</th>
                <th>Sub Dealer Name</th>
                <th>DateTime</th>
                <th>Quantity</th>
                <th>Request Type</th>
                <th>Plan</th>
                <th>PI No.</th>
                <th>Amount (₹)</th>
                <th>Remarks</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.length > 0 ? (
                requests.map((req, index) => (
                  <tr key={req._id}>
                    <td><input type="checkbox" /></td>
                    <td>{((page - 1) * limit) + index + 1}</td>
                    <td style={{ color: '#337ab7', fontWeight: '600' }}>{req.requestId}</td>
                    <td>{req.isSubDealer ? 'Yes' : 'No'}</td>
                    <td>{req.subDealerName || '--'}</td>
                    <td>{new Date(req.dateTime).toLocaleString()}</td>
                    <td>{req.quantity}</td>
                    <td>{req.requestType}</td>
                    <td>{req.plan}</td>
                    <td>{req.piNo || '--'}</td>
                    <td style={{ fontWeight: '600' }}>{req.amount.toFixed(2)}</td>
                    <td style={{ maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {req.remarks || '--'}
                    </td>
                    <td>
                      <span className={`status-badge ${req.status.toLowerCase()}`}>
                        {req.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="13" style={{ textAlign: 'center', padding: '20px', color: '#999', fontStyle: 'italic' }}>
                    No records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="requests-footer">
        <div className="records-info">
          Showing {totalCount > 0 ? ((page - 1) * limit) + 1 : 0} to {Math.min(page * limit, totalCount)} of {totalCount} records
        </div>

        <div className="pagination">
          <div 
            className={`pagination-item ${page === 1 ? 'disabled' : ''}`}
            onClick={() => handlePageChange(page - 1)}
          >
            Previous
          </div>

          {getPageNumbers().map((p, idx) => (
            p === '...' ? (
              <span key={`ell-${idx}`} className="pagination-ellipsis" style={{ padding: '6px 12px', color: '#888', background: 'transparent', display: 'inline-block' }}>
                ...
              </span>
            ) : (
              <div 
                key={p}
                className={`pagination-item ${page === p ? 'active' : ''}`}
                onClick={() => handlePageChange(p)}
              >
                {p}
              </div>
            )
          ))}

          <div 
            className={`pagination-item ${page === totalPages ? 'disabled' : ''}`}
            onClick={() => handlePageChange(page + 1)}
          >
            Next
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActivationRequests;
