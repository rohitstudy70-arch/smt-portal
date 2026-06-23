import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaSpinner } from 'react-icons/fa';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import './IccidSearch.css';

const IccidSearch = () => {
  const { user } = useAuth();
  const [device, setDevice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [latestRequest, setLatestRequest] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();

  const getRole = (u) => {
    if (u?.role === 'partner') return 'ADMIN';
    if (u?.userType === 'Administration') return 'ADMIN';
    if (u?.userType === 'Sub Dealer') return 'SUB_DEALER';
    if (u?.userType === 'End Customer') return 'CUSTOMER';
    return 'DEALER';
  };

  const role = getRole(user);

  const getSearchQuery = () => {
    const params = new URLSearchParams(location.search);
    return params.get('search') || '';
  };

  const searchQuery = getSearchQuery();

  useEffect(() => {
    if (!searchQuery) {
      setDevice(null);
      setLatestRequest(null);
      return;
    }

    const fetchDeviceAndHistory = async () => {
      try {
        setLoading(true);
        setError('');
        
        // 1. Fetch device details
        const res = await api.get('/devices', {
          params: { search: searchQuery, limit: 1 }
        });

        if (res.data.devices && res.data.devices.length > 0) {
          const foundDevice = res.data.devices[0];
          setDevice(foundDevice);

          // 2. Fetch activation history for this device using its IMEI
          const historyRes = await api.get('/activation-requests', {
            params: { search: foundDevice.imei, limit: 100 }
          });
          
          const history = historyRes.data.requests || [];

          // Get the most recent activation request to populate vehicle & customer info
          if (history.length > 0) {
            // Sort by dateTime descending (newest first)
            const sortedHistory = [...history].sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
            setLatestRequest(sortedHistory[0]);
          } else {
            setLatestRequest(null);
          }

        } else {
          setDevice(null);
          setLatestRequest(null);
          setError('No device found matching the search term.');
        }
        setLoading(false);
      } catch (err) {
        console.error('Error fetching search details:', err);
        setError('Failed to fetch device details. Please try again.');
        setLoading(false);
      }
    };

    fetchDeviceAndHistory();
  }, [searchQuery, refreshTrigger]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '00/00/0000';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '00/00/0000';
    return date.toLocaleDateString('en-GB'); // DD/MM/YYYY
  };

  const handleCopyDetails = () => {
    if (!device) return;
    
    const details = `--- DEVICE DETAILS ---
IMEI No: ${device.imei || '—'}
Serial No: ${device.serialNo || '—'}
ICCID No: ${device.iccid || '—'}
MSISDN 1: ${device.msisdn1 || '—'}
MSISDN 2: ${device.msisdn2 || '—'}
ITR No: ${device.itrNo || '—'}
Validity: ${device.validity || '—'}
Activation Date: ${formatDate(device.presentDate)}
Expiry Date: ${formatDate(device.expiryDate)}

--- VEHICLE DETAILS ---
Vehicle Reg. Year: ${latestRequest?.registrationYear || '—'}
Activation Type: ${latestRequest?.activationMode || '—'}
Vehicle Condition: ${latestRequest?.vehicleCondition || '—'}
Vehicle Make: ${latestRequest?.vehicleMake || '—'}
Vehicle Model: ${latestRequest?.vehicleModel || '—'}
RTO: ${latestRequest?.rto || '—'}
Vehicle No: ${latestRequest?.vehicleNo || '—'}
Engine No: ${latestRequest?.engineNo || '—'}
Chassis No: ${latestRequest?.chassisNo || '—'}

--- CUSTOMER DETAILS ---
Customer Name: ${latestRequest?.customerName || '—'}
Mobile No 1: ${latestRequest?.regMobNo || '—'}
Mobile No 2: ${latestRequest?.regMobNo2 || '—'}
Aadhar No: ${latestRequest?.aadharNo || '—'}
Address: ${latestRequest?.address || '—'}
State: ${latestRequest?.userId?.state || device.dealerId?.state || '—'}`;

    navigator.clipboard.writeText(details)
      .then(() => {
        alert('All details copied to clipboard!');
      })
      .catch((err) => {
        console.error('Failed to copy details:', err);
        alert('Failed to copy details. Please copy manually.');
      });
  };

  const handleDirectActivate = async () => {
    if (!device?.imei) {
      alert('No device IMEI found to activate.');
      return;
    }
    if (!window.confirm('Are you sure you want to activate this device immediately?')) {
      return;
    }
    try {
      setLoading(true);
      await api.post('/activation-requests/direct-activate', { imei: device.imei });
      alert('Device activated successfully!');
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      console.error('Direct activation error:', err);
      alert(err.response?.data?.message || 'Failed to activate device.');
      setLoading(false);
    }
  };

  const handleQuickActivate = async () => {
    if (!latestRequest?._id) {
      // Fallback to direct activation if request ID is not present
      await handleDirectActivate();
      return;
    }
    if (!window.confirm('Are you sure you want to approve this request and activate this device immediately?')) {
      return;
    }
    try {
      setLoading(true);
      await api.put(`/activation-requests/${latestRequest._id}/approve`);
      alert('Device activated successfully!');
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      console.error('Quick activation error:', err);
      alert(err.response?.data?.message || 'Failed to activate device.');
      setLoading(false);
    }
  };

  const getActivationStatus = () => {
    if (!device) return 'none';
    if (device.activationRequestStatus && device.activationRequestStatus !== 'none') {
      return device.activationRequestStatus;
    }
    if (latestRequest) {
      const status = latestRequest.status?.toLowerCase();
      if (['requested', 'processing'].includes(status)) {
        return 'processing';
      }
      if (['completed', 'approved', 'active'].includes(status)) {
        return 'active';
      }
    }
    return 'none';
  };

  const activationStatus = getActivationStatus();

  return (
    <div className="iccid-search-container">
      {loading ? (
        <div className="search-loading">
          <FaSpinner className="spin" /> Loading device details...
        </div>
      ) : error ? (
        <div className="search-error-msg">{error}</div>
      ) : device ? (
        <div className="search-results-wrapper">
          
          {/* Top Info and Action Buttons */}
          <div className="top-info-container">
            <div className="vendor-dealer-info">
              <div>Vendor Name: <strong>{device.vendor || '—'}</strong></div>
              <div>Dealer Name: <strong>{device.dealerName || device.dealerId?.displayName || device.dealerId?.companyName || '—'}</strong></div>
            </div>
            <div className="top-actions">
              <button className="btn-copy-all" onClick={handleCopyDetails}>
                Copy All Details
              </button>
              {activationStatus === 'processing' ? (
                <>
                  <button className="badge-status-processing" style={{
                    padding: '8px 16px',
                    background: '#f0ad4e',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    fontWeight: 'bold',
                    cursor: 'default',
                    display: 'inline-block',
                    fontSize: '13px'
                  }}>
                    Processing
                  </button>
                  {role === 'ADMIN' && (
                      <button 
                        className="btn-activate-quick" 
                        onClick={handleQuickActivate}
                        disabled={loading}
                      >
                        {loading ? <FaSpinner className="fa-spin" /> : 'Activate'}
                      </button>
                    )}
                </>
              ) : activationStatus === 'active' ? (
                <button className="badge-status-active" style={{
                  padding: '8px 16px',
                  background: '#5cb85c',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  fontWeight: 'bold',
                  cursor: 'default',
                  display: 'inline-block',
                  fontSize: '13px'
                }}>
                  Active
                </button>
              ) : (
                <>
                  <button 
                    className="btn-raise-req"
                    onClick={() => navigate('/service-requests/activation', { 
                      state: { 
                        prefillDevice: device, 
                        prefillRequest: latestRequest 
                      } 
                    })}
                  >
                    Raise Request
                  </button>
                  {role === 'ADMIN' && (
                      <button 
                        className="btn-activate-quick" 
                        onClick={handleDirectActivate}
                        disabled={loading}
                      >
                        {loading ? <FaSpinner className="fa-spin" /> : 'Activate'}
                      </button>
                    )}
                </>
              )}
            </div>
          </div>

          {/* 1. Device Details */}
          <div className="search-section-card">
            <div className="section-header-teal">Device Details</div>
            <div className="card-body-table">
              <table className="details-grid-table">
                <tbody>
                  <tr>
                    <td>
                      <div className="grid-cell-label">IMEI No</div>
                      <div className="grid-cell-value bold">{device.imei || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">Serial No</div>
                      <div className="grid-cell-value bold">{device.serialNo || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">ICCID No</div>
                      <div className="grid-cell-value bold">{device.iccid || '—'}</div>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div className="grid-cell-label">MSISDN 1</div>
                      <div className="grid-cell-value">{device.msisdn1 || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">MSISDN 2</div>
                      <div className="grid-cell-value">{device.msisdn2 || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">ITR No</div>
                      <div className="grid-cell-value">{device.itrNo || '—'}</div>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div className="grid-cell-label">Validity</div>
                      <div className="grid-cell-value">{device.validity || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">Activation Date</div>
                      <div className="grid-cell-value">{formatDate(device.presentDate)}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">Expiry Date</div>
                      <div className="grid-cell-value">{formatDate(device.expiryDate)}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. Vehicle Details */}
          <div className="search-section-card">
            <div className="section-header-teal">Vehicle Details</div>
            <div className="card-body-table">
              <table className="details-grid-table">
                <tbody>
                  <tr>
                    <td>
                      <div className="grid-cell-label">Vehicle Reg. Year</div>
                      <div className="grid-cell-value">{latestRequest?.registrationYear || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">Activation Type</div>
                      <div className="grid-cell-value">{latestRequest?.activationMode || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">Vehicle Condition</div>
                      <div className="grid-cell-value">{latestRequest?.vehicleCondition || '—'}</div>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div className="grid-cell-label">Vehicle Make</div>
                      <div className="grid-cell-value">{latestRequest?.vehicleMake || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">Vehicle Model</div>
                      <div className="grid-cell-value">{latestRequest?.vehicleModel || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">RTO</div>
                      <div className="grid-cell-value">{latestRequest?.rto || '—'}</div>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div className="grid-cell-label">Vehicle No</div>
                      <div className="grid-cell-value bold">{latestRequest?.vehicleNo || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">Engine No</div>
                      <div className="grid-cell-value bold">{latestRequest?.engineNo || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">Chassis No</div>
                      <div className="grid-cell-value bold">{latestRequest?.chassisNo || '—'}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. Customer Details */}
          <div className="search-section-card">
            <div className="section-header-teal">Customer Details</div>
            <div className="card-body-table">
              <table className="details-grid-table">
                <tbody>
                  <tr>
                    <td>
                      <div className="grid-cell-label">Customer Name</div>
                      <div className="grid-cell-value bold">{latestRequest?.customerName || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">Mobile No 1</div>
                      <div className="grid-cell-value">{latestRequest?.regMobNo || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">Mobile No 2</div>
                      <div className="grid-cell-value">{latestRequest?.regMobNo2 || '—'}</div>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div className="grid-cell-label">Aadhar No</div>
                      <div className="grid-cell-value">{latestRequest?.aadharNo || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">Address</div>
                      <div className="grid-cell-value">{latestRequest?.address || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">State</div>
                      <div className="grid-cell-value">{latestRequest?.userId?.state || device.dealerId?.state || '—'}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>
      ) : (
        <div className="search-prompt-msg">
          Please enter an IMEI, ICCID or Serial number in the top search bar to view device details.
        </div>
      )}
    </div>
  );
};

export default IccidSearch;
