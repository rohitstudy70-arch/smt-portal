import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaTabletAlt, FaSpinner, FaSimCard, FaCar, FaUserAlt, FaHistory, FaFolderOpen, FaCopy } from 'react-icons/fa';
import api from '../../utils/api';
import './IccidSearch.css';

const IccidSearch = () => {
  const [device, setDevice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activationHistory, setActivationHistory] = useState([]);
  const [latestRequest, setLatestRequest] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  const getSearchQuery = () => {
    const params = new URLSearchParams(location.search);
    return params.get('search') || '';
  };

  const searchQuery = getSearchQuery();

  useEffect(() => {
    if (!searchQuery) {
      setDevice(null);
      setActivationHistory([]);
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
          setActivationHistory(history);

          // Get the most recent activation request to populate vehicle & custodian info
          if (history.length > 0) {
            // Sort by dateTime descending (newest first)
            const sortedHistory = [...history].sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
            setLatestRequest(sortedHistory[0]);
          } else {
            setLatestRequest(null);
          }

        } else {
          setDevice(null);
          setActivationHistory([]);
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
  }, [searchQuery]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-GB'); // DD/MM/YYYY
  };

  // Add one month helper for Bootstrap Expiry
  const formatBootstrapExpiry = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    date.setMonth(date.getMonth() + 1);
    return date.toLocaleDateString('en-GB');
  };

  const handleCopyDetails = () => {
    if (!device) return;
    
    const details = `--- DEVICE DETAILS ---
IMEI No: ${device.imei || '-'}
Serial No: ${device.serialNo || '-'}
ICCID No: ${device.iccid || '-'}
ITR No: ${device.itrNo || '-'}
Invoice Date: ${formatDate(device.presentDate)}
Warranty Expiry: ${formatDate(device.expiryDate)}

--- SIM DETAILS ---
Vendor Name: ${device.vendor || '-'}
MSISDN 1: ${device.msisdn1 || '-'}
TSP 1: ${device.tsp1 || '-'}
MSISDN 2: ${device.msisdn2 || '-'}
TSP 2: ${device.tsp2 || '-'}
Bootstrap Activation: ${formatDate(device.presentDate)}
Bootstrap Expiry: ${formatBootstrapExpiry(device.presentDate)}
SIM Activation: ${formatDate(device.presentDate)}
SIM Expiry: ${formatDate(device.simExpiryDate || device.expiryDate)}

--- VEHICLE DETAILS ---
Engine No: ${latestRequest?.engineNo || 'NA'}
Chassis No: ${latestRequest?.chassisNo || 'NA'}
VRN No: ${latestRequest?.vehicleNo || 'NA'}

--- CUSTODIAN DETAILS ---
End Customer: ${latestRequest?.customerName || 'NA'}
Identity Proof: ${latestRequest?.aadharNo ? 'ADHAR' : 'NA'}
Identity No: ${latestRequest?.aadharNo || 'NA'}
Address Proof: ${latestRequest?.aadharNo ? 'ADHAR' : 'NA'}
Address No: ${latestRequest?.aadharNo || 'NA'}`;

    navigator.clipboard.writeText(details)
      .then(() => {
        alert('All details copied to clipboard!');
      })
      .catch((err) => {
        console.error('Failed to copy details:', err);
        alert('Failed to copy details. Please copy manually.');
      });
  };

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
          
          {/* 1. DEVICE DETAILS CARD */}
          <div className="device-details-card">
            <div className="card-header-teal" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FaTabletAlt className="header-icon" /> DEVICE DETAILS
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className="btn-activate-device"
                  onClick={handleCopyDetails}
                  style={{ background: '#0284c7' }}
                >
                  <FaCopy style={{ marginRight: '6px' }} /> Copy All Details
                </button>
                <button 
                  className="btn-activate-device"
                  onClick={() => navigate('/service-requests/activation', { 
                    state: { 
                      prefillDevice: device, 
                      prefillRequest: latestRequest 
                    } 
                  })}
                >
                  Raise Activation Request
                </button>
              </div>
            </div>
            <div className="card-body-table">
              <table className="device-details-table">
                <tbody>
                  <tr>
                    <td className="cell-label">IMEI No:</td>
                    <td className="cell-val bold-text">{device.imei}</td>
                    <td className="cell-label">Serial No:</td>
                    <td className="cell-val bold-text">{device.serialNo}</td>
                    <td className="cell-label">ICCID No:</td>
                    <td className="cell-val bold-text">{device.iccid || '-'}</td>
                  </tr>
                  <tr>
                    <td className="cell-label">ITR No:</td>
                    <td className="cell-val bold-text">{device.itrNo || '-'}</td>
                    <td className="cell-label">Invoice Date:</td>
                    <td className="cell-val">{formatDate(device.presentDate)}</td>
                    <td className="cell-label">Warranty Expiry:</td>
                    <td className="cell-val">{formatDate(device.expiryDate)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. SIM DETAILS CARD */}
          <div className="device-details-card">
            <div className="card-header-teal">
              <FaSimCard className="header-icon" /> SIM DETAILS
            </div>
            <div className="card-body-table">
              <table className="device-details-table">
                <tbody>
                  <tr>
                    <td className="cell-label center-text" colSpan="3">
                      <FaUserAlt style={{ marginRight: '6px', fontSize: '11px', color: '#00897b' }} /> 
                      Vendor Name: <strong style={{ marginLeft: '4px', color: '#333' }}>{device.vendor || '-'}</strong>
                    </td>
                  </tr>
                  <tr>
                    <td className="cell-label">MSISDN 1:</td>
                    <td className="cell-val">{device.msisdn1 || '-'}</td>
                    <td className="cell-label">TSP 1:</td>
                    <td className="cell-val">{device.tsp1 || '-'}</td>
                    <td className="cell-label">Data Usage:</td>
                    <td className="cell-val">(-)</td>
                  </tr>
                  <tr>
                    <td className="cell-label">MSISDN 2:</td>
                    <td className="cell-val">{device.msisdn2 || '-'}</td>
                    <td className="cell-label">TSP 2:</td>
                    <td className="cell-val">{device.tsp2 || '-'}</td>
                    <td className="cell-label"></td>
                    <td className="cell-val"></td>
                  </tr>
                  <tr>
                    <td className="cell-label">Bootstrap Activation:</td>
                    <td className="cell-val">{formatDate(device.presentDate)}</td>
                    <td className="cell-label">Bootstrap Expiry:</td>
                    <td className="cell-val">{formatBootstrapExpiry(device.presentDate)}</td>
                    <td className="cell-label"></td>
                    <td className="cell-val"></td>
                  </tr>
                  <tr>
                    <td className="cell-label">SIM Activation:</td>
                    <td className="cell-val">{formatDate(device.presentDate)}</td>
                    <td className="cell-label">SIM Expiry:</td>
                    <td className="cell-val">{formatDate(device.simExpiryDate || device.expiryDate)}</td>
                    <td className="cell-label"></td>
                    <td className="cell-val"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. VEHICLE DETAILS CARD */}
          <div className="device-details-card">
            <div className="card-header-teal">
              <FaCar className="header-icon" /> VEHICLE DETAILS
            </div>
            <div className="card-body-table">
              <table className="device-details-table">
                <tbody>
                  <tr>
                    <td className="cell-label">Engine No:</td>
                    <td className="cell-val bold-text">{latestRequest?.engineNo || 'NA'}</td>
                    <td className="cell-label">Chassis No:</td>
                    <td className="cell-val bold-text">{latestRequest?.chassisNo || 'NA'}</td>
                    <td className="cell-label">VRN No:</td>
                    <td className="cell-val bold-text">{latestRequest?.vehicleNo || 'NA'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. CUSTODIAN DETAILS CARD */}
          <div className="device-details-card">
            <div className="card-header-teal">
              <FaUserAlt className="header-icon" /> CUSTODIAN DETAILS
            </div>
            <div className="card-body-table">
              <table className="device-details-table">
                <tbody>
                  <tr>
                    <td className="cell-label center-text" colSpan="3">
                      <FaUserAlt style={{ marginRight: '6px', fontSize: '11px', color: '#00897b' }} /> 
                      End Customer: <strong style={{ marginLeft: '4px', color: '#333' }}>{latestRequest?.customerName || 'NA'}</strong>
                    </td>
                  </tr>
                  <tr>
                    <td className="cell-label">Identity Proof:</td>
                    <td className="cell-val bold-text">{latestRequest?.aadharNo ? 'ADHAR' : 'NA'}</td>
                    <td className="cell-label">Identity No:</td>
                    <td className="cell-val bold-text">{latestRequest?.aadharNo || 'NA'}</td>
                  </tr>
                  <tr>
                    <td className="cell-label">Address Proof:</td>
                    <td className="cell-val bold-text">{latestRequest?.aadharNo ? 'ADHAR' : 'NA'}</td>
                    <td className="cell-label">Address No:</td>
                    <td className="cell-val bold-text">{latestRequest?.aadharNo || 'NA'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 5. Sim Activation History & 6. Common Layer History Side-by-Side Grid */}
          <div className="history-grid-container">
            
            {/* Sim Activation History */}
            <div className="history-card">
              <div className="history-header">
                Sim Activation History
              </div>
              <div className="history-body">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Req ID</th>
                      <th>Req Date</th>
                      <th>Service</th>
                      <th>Req Period</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activationHistory.length > 0 ? (
                      activationHistory.map(req => (
                        <tr key={req._id}>
                          <td className="blue-bold-link">{req.requestId}</td>
                          <td>{formatDate(req.dateTime)}</td>
                          <td>{req.requestType}</td>
                          <td>{req.plan}</td>
                          <td>
                            <span className={`status-badge-mini ${req.status.toLowerCase()}`}>
                              {req.status === 'Completed' ? 'Activated' : req.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" className="empty-history-cell">No records found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Common Layer History */}
            <div className="history-card">
              <div className="history-header">
                Common Layer History
              </div>
              <div className="history-body">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Req ID</th>
                      <th>Req Date</th>
                      <th>Common Layer</th>
                      <th>Certificates</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan="5" className="empty-history-cell">No records found</td>
                    </tr>
                  </tbody>
                </table>
              </div>
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
