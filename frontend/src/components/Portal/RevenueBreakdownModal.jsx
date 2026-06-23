import React, { useState, useEffect } from 'react';
import './RevenueBreakdownModal.css';
import api from '../../utils/api';

const RevenueBreakdownModal = ({ isOpen, onClose, initialTab = 'today' }) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [breakdown, setBreakdown] = useState([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      fetchBreakdown(initialTab);
    }
  }, [isOpen, initialTab]);

  const fetchBreakdown = async (period) => {
    try {
      setLoading(true);
      const res = await api.get('/due-dashboard/revenue-breakdown', { params: { period } });
      setBreakdown(res.data.breakdown || []);
      setTotalRevenue(res.data.totalRevenue || 0);
    } catch (err) {
      console.error('Error fetching revenue breakdown:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    fetchBreakdown(tab);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content revenue-breakdown-modal">
        <div className="modal-header">
          <h3>Revenue Breakdown Details</h3>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-tabs" style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
          <button 
            className={`btn ${activeTab === 'today' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => handleTabChange('today')}
          >
            Today
          </button>
          <button 
            className={`btn ${activeTab === 'month' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => handleTabChange('month')}
          >
            This Month
          </button>
          <button 
            className={`btn ${activeTab === 'year' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => handleTabChange('year')}
          >
            This Year
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="loading-spinner" style={{ textAlign: 'center', padding: '20px' }}>Loading...</div>
          ) : (
            <>
              <div className="table-responsive" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table className="table table-hover" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f4f4f9', textAlign: 'left' }}>
                      <th style={{ padding: '10px', borderBottom: '2px solid #ddd' }}>IMEI No</th>
                      <th style={{ padding: '10px', borderBottom: '2px solid #ddd' }}>Dealer</th>
                      <th style={{ padding: '10px', borderBottom: '2px solid #ddd' }}>Sub-Dealer</th>
                      <th style={{ padding: '10px', borderBottom: '2px solid #ddd' }}>Customer</th>
                      <th style={{ padding: '10px', borderBottom: '2px solid #ddd' }}>Added Date</th>
                      <th style={{ padding: '10px', borderBottom: '2px solid #ddd', textAlign: 'right' }}>Revenue (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="text-center" style={{ padding: '20px' }}>No revenue records found for this period.</td>
                      </tr>
                    ) : (
                      breakdown.map((item) => (
                        <tr key={item._id} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '10px' }}>{item.imei}</td>
                          <td style={{ padding: '10px' }}>{item.dealerName}</td>
                          <td style={{ padding: '10px' }}>{item.subDealerName}</td>
                          <td style={{ padding: '10px' }}>{item.customerName}</td>
                          <td style={{ padding: '10px' }}>{new Date(item.presentDate).toLocaleDateString('en-GB')}</td>
                          <td style={{ padding: '10px', textAlign: 'right', fontWeight: '500' }}>{item.billAmount.toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              
              <div className="revenue-total-summary" style={{ marginTop: '20px', textAlign: 'right', padding: '15px', backgroundColor: '#eef2f5', borderRadius: '8px' }}>
                <h4 style={{ margin: 0, color: '#2c3e50' }}>Total Revenue: <span style={{ color: '#27ae60', marginLeft: '10px' }}>₹{totalRevenue.toLocaleString()}</span></h4>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RevenueBreakdownModal;
