import { useCallback, useEffect, useState } from 'react';
import { FaSearch, FaFilter, FaCalendarAlt, FaTimesCircle, FaCheckCircle } from 'react-icons/fa';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import './RenewalDueManagement.css';

const RenewalDueManagement = () => {
  const { user } = useAuth();
  
  // Table Loading & Error States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ show: false, type: '', message: '' });

  // Data States
  const [devicesList, setDevicesList] = useState([]);
  const [totalDevices, setTotalDevices] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters State
  const [filters, setFilters] = useState({
    search: '',
    dealer: '',
    customer: '',
    expiryMonth: '',
    deviceStatus: 'all',
  });

  // Modal State for Renew
  const [renewDevice, setRenewDevice] = useState(null);
  const [renewValidity, setRenewValidity] = useState('1 Year');
  const [renewing, setRenewing] = useState(false);

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    window.setTimeout(() => setToast({ show: false, type: '', message: '' }), 4000);
  };

  const fetchRenewals = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/due-dashboard/renewal-due-devices', {
        params: {
          page,
          limit: 10,
          search: filters.search,
          dealer: filters.dealer,
          customer: filters.customer,
          expiryMonth: filters.expiryMonth,
          deviceStatus: filters.deviceStatus,
        },
      });
      setDevicesList(res.data.devices || []);
      setTotalDevices(res.data.total || 0);
      setTotalPages(res.data.pages || 1);
    } catch (err) {
      console.error('Error fetching renewal due list:', err);
      setError(err.response?.data?.message || 'Failed to load renewal due devices.');
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  // Refetch when filters or page changes
  useEffect(() => {
    fetchRenewals();
  }, [page, fetchRenewals]);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
    setPage(1);
  };

  const handleRenewSubmit = async (e) => {
    e.preventDefault();
    if (!renewDevice) return;
    try {
      setRenewing(true);
      const res = await api.post('/due-dashboard/renew-device', {
        deviceId: renewDevice._id,
        validity: renewValidity,
      });
      showToast('success', res.data.message || 'Device renewed successfully.');
      setRenewDevice(null);
      fetchRenewals();
    } catch (err) {
      console.error('Error renewing device:', err);
      showToast('error', err.response?.data?.message || 'Failed to renew device.');
    } finally {
      setRenewing(false);
    }
  };

  const formatDate = (dateValue) => {
    if (!dateValue) return '-';
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusClass = (statusStr) => {
    const s = String(statusStr || '').toLowerCase();
    if (s === 'expired') return 'expired';
    if (s === 'expiring soon') return 'expiring';
    return 'active';
  };

  return (
    <div className="renewal-due-container">
      {toast.show && (
        <div className={`toast-notification ${toast.type}`} style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 11000, display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', borderRadius: '6px', color: '#fff', background: toast.type === 'success' ? '#10b981' : '#ef4444', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          {toast.type === 'success' ? <FaCheckCircle /> : <FaTimesCircle />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Row with Title & Filters */}
      <div className="renewal-due-header-row">
        <h1 className="renewal-due-title">Renewal Due Devices</h1>
        
        <div className="renewal-filters-group">
          {/* Search Box */}
          <div className="renewal-search-input-wrapper">
            <FaSearch className="renewal-search-icon" />
            <input
              type="text"
              placeholder="Search IMEI/Device Name..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="renewal-filter-field"
            />
          </div>

          {/* Dealer Filter */}
          <div className="renewal-search-input-wrapper">
            <input
              type="text"
              placeholder="Dealer Name..."
              value={filters.dealer}
              onChange={(e) => handleFilterChange('dealer', e.target.value)}
              style={{ paddingLeft: '12px' }}
              className="renewal-filter-field"
            />
          </div>

          {/* Customer Filter */}
          <div className="renewal-search-input-wrapper">
            <input
              type="text"
              placeholder="Customer Name..."
              value={filters.customer}
              onChange={(e) => handleFilterChange('customer', e.target.value)}
              style={{ paddingLeft: '12px' }}
              className="renewal-filter-field"
            />
          </div>

          {/* Expiry Month Filter */}
          <div className="renewal-search-input-wrapper">
            <input
              type="month"
              value={filters.expiryMonth}
              onChange={(e) => handleFilterChange('expiryMonth', e.target.value)}
              className="renewal-date-field"
            />
          </div>

          {/* Status Dropdown */}
          <div className="renewal-filter-select-wrapper">
            <FaFilter className="renewal-search-icon" />
            <select
              value={filters.deviceStatus}
              onChange={(e) => handleFilterChange('deviceStatus', e.target.value)}
              className="renewal-filter-select"
            >
              <option value="all">All Status</option>
              <option value="Active">Active</option>
              <option value="Expiring Soon">Expiring Soon</option>
              <option value="Expired">Expired</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className="renewal-table-card">
        {error && (
          <div style={{ color: '#b91c1c', background: '#fef2f2', padding: '12px 18px', borderBottom: '1px solid #fee2e2', fontSize: '13px', fontWeight: 'bold' }}>
            {error}
          </div>
        )}

        <div className="renewal-table-wrapper">
          <table className="renewal-devices-table">
            <thead>
              <tr>
                <th>IMEI</th>
                <th>Device Name</th>
                <th>Customer Name</th>
                <th>Dealer Name</th>
                <th>Activation Date</th>
                <th>Expiry Date</th>
                <th>Remaining Days</th>
                <th>Renewal Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    Loading renewal due list...
                  </td>
                </tr>
              ) : devicesList.length > 0 ? (
                devicesList.map((device) => (
                  <tr key={device._id}>
                    <td className="imei-cell">{device.imei}</td>
                    <td>{device.deviceName}{device.vehicleNumber ? ` (${device.vehicleNumber})` : ''}</td>
                    <td>{device.customerName || '-'}</td>
                    <td>{device.dealerName || '-'}</td>
                    <td>{formatDate(device.activationDate)}</td>
                    <td>{formatDate(device.expiryDate)}</td>
                    <td className={`remaining-days-cell ${getStatusClass(device.status)}`}>
                      {device.remainingDays} days
                    </td>
                    <td className="amount-cell">₹{(device.renewalAmount || 0).toLocaleString()}</td>
                    <td>
                      <span className={`renewal-status-badge ${getStatusClass(device.status)}`}>
                        {device.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-renew-action"
                        onClick={() => {
                          setRenewDevice(device);
                          setRenewValidity('1 Year');
                        }}
                      >
                        Renew
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    No renewal due devices found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Row */}
        {!loading && totalPages > 1 && (
          <div className="renewal-pagination-row">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              className="btn-renewal-page"
            >
              &lt; Prev
            </button>
            <span className="renewal-page-info">
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              className="btn-renewal-page"
            >
              Next &gt;
            </button>
          </div>
        )}
      </div>

      {/* Renew Modal Dialog */}
      {renewDevice && (
        <div className="renew-modal-overlay">
          <div className="renew-modal-card">
            <div className="renew-modal-header">
              <span>Device Renewal</span>
              <button
                type="button"
                className="renew-modal-close"
                onClick={() => setRenewDevice(null)}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleRenewSubmit}>
              <div className="renew-modal-body">
                <div className="renew-modal-row">
                  <label>IMEI</label>
                  <input
                    type="text"
                    value={renewDevice.imei}
                    readOnly
                    style={{ background: '#f1f5f9', cursor: 'not-allowed' }}
                  />
                </div>
                <div className="renew-modal-row">
                  <label>Device Name</label>
                  <input
                    type="text"
                    value={renewDevice.deviceName}
                    readOnly
                    style={{ background: '#f1f5f9', cursor: 'not-allowed' }}
                  />
                </div>
                <div className="renew-modal-row">
                  <label>Customer Name</label>
                  <input
                    type="text"
                    value={renewDevice.customerName || 'N/A'}
                    readOnly
                    style={{ background: '#f1f5f9', cursor: 'not-allowed' }}
                  />
                </div>
                <div className="renew-modal-row">
                  <label>Current Expiry Date</label>
                  <input
                    type="text"
                    value={formatDate(renewDevice.expiryDate)}
                    readOnly
                    style={{ background: '#f1f5f9', cursor: 'not-allowed' }}
                  />
                </div>
                <div className="renew-modal-row">
                  <label>Renewal Period</label>
                  <select
                    value={renewValidity}
                    onChange={(e) => setRenewValidity(e.target.value)}
                  >
                    <option value="1 Year">1 Year</option>
                    <option value="2 Years">2 Years</option>
                  </select>
                </div>
                <div className="renew-modal-actions">
                  <button
                    type="button"
                    className="btn-renew-cancel"
                    onClick={() => setRenewDevice(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-renew-submit"
                    disabled={renewing}
                  >
                    {renewing ? 'Renewing...' : 'Confirm Renewal'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RenewalDueManagement;
