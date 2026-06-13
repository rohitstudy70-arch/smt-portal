import { useState, useEffect } from 'react';
import { 
  FaMobileAlt, 
  FaSimCard, 
  FaMicrochip, 
  FaArrowCircleDown, 
  FaMoneyBillAlt, 
  FaChevronRight,
  FaFileExcel,
  FaSpinner
} from 'react-icons/fa';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import './Dashboard.css';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [simExpiry, setSimExpiry] = useState([]);
  const [clExpiry, setClExpiry] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const { user } = useAuth();

  // Report Generator State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportSuccess, setExportSuccess] = useState('');
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const [statsRes, simExpiryRes, clExpiryRes] = await Promise.all([
          api.get('/dashboard/stats'),
          api.get('/dashboard/sim-expiry'),
          api.get('/dashboard/cl-expiry')
        ]);

        setStats(statsRes.data);
        setSimExpiry(simExpiryRes.data);
        setClExpiry(clExpiryRes.data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError('Failed to fetch dashboard data. Please try again.');
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const handleDownloadReport = async (e) => {
    e.preventDefault();
    setExportSuccess('');
    setExportError('');
    setExportLoading(true);

    try {
      const response = await api.get('/reports/common-layer/export', {
        params: {
          startDate,
          endDate,
          search: searchQuery
        },
        responseType: 'blob'
      });

      // Extract filename from content-disposition
      const contentDisposition = response.headers['content-disposition'];
      let filename = '';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename=(.+)/);
        if (match && match[1]) {
          filename = match[1];
        }
      }
      if (!filename) {
        const today = new Date();
        const day = String(today.getDate()).padStart(2, '0');
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const year = today.getFullYear();
        filename = `Common_Layer_Report_${day}-${month}-${year}.xlsx`;
      }

      // Download trigger
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);

      setExportSuccess('Common Layer Report exported and downloaded successfully!');
      setExportLoading(false);
      
      // Auto clear success alert
      setTimeout(() => setExportSuccess(''), 5000);
    } catch (err) {
      console.error('Error downloading report:', err);
      setExportError('Failed to generate and download report. Make sure you are authorized.');
      setExportLoading(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center', fontSize: '14px', color: '#666' }}>Loading dashboard data...</div>;
  }

  if (error) {
    return <div style={{ padding: '20px', color: 'red', textAlign: 'center' }}>{error}</div>;
  }

  return (
    <div className="dashboard-container">
      {/* Admin Report Generator (visible to both Admin/Partner and Main Customer) */}
      {(user?.role === 'partner' || user?.role === 'customer') && (
        <div className="admin-report-panel">
          <div className="panel-header">
            <span className="panel-title">
              <FaFileExcel /> COMMON LAYER REPORT GENERATOR
            </span>
          </div>
          <div className="panel-body">
            {exportSuccess && <div className="report-alert success">{exportSuccess}</div>}
            {exportError && <div className="report-alert error">{exportError}</div>}

            <form onSubmit={handleDownloadReport} className="report-form">
              <div className="report-input-group">
                <label>Start Date</label>
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)} 
                />
              </div>

              <div className="report-input-group">
                <label>End Date</label>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)} 
                />
              </div>

              <div className="report-input-group">
                <label>Search (Vehicle No / IMEI / RMN)</label>
                <input 
                  type="text" 
                  placeholder="Enter vehicle no, imei or mobile..." 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                />
              </div>

              <button 
                type="submit" 
                className="btn-download-report" 
                disabled={exportLoading}
              >
                {exportLoading ? (
                  <>
                    <FaSpinner className="spin-icon" /> Downloading...
                  </>
                ) : (
                  <>
                    <FaArrowCircleDown /> Download Common Layer Report
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Device Information Section */}
      <div>
        <h2 className="section-title">Device Information</h2>
        <div className="device-cards-grid">
          <div className="device-card red">
            <div className="card-body">
              <div className="card-info">
                <span className="card-count">{stats?.totalDevices || 0}</span>
                <span className="card-label">Total Devices</span>
              </div>
              <FaMobileAlt className="card-icon" />
            </div>
            <div className="card-footer-action" onClick={() => alert('Downloading total devices report...')}>
              Download <FaArrowCircleDown />
            </div>
          </div>

          <div className="device-card teal">
            <div className="card-body">
              <div className="card-info">
                <span className="card-count">{stats?.totalDevicesWithSim || 0}</span>
                <span className="card-label">Total Devices with SIM</span>
              </div>
              <FaSimCard className="card-icon" />
            </div>
            <div className="card-footer-action" onClick={() => alert('Downloading SIM devices report...')}>
              Download <FaArrowCircleDown />
            </div>
          </div>

          <div className="device-card teal">
            <div className="card-body">
              <div className="card-info">
                <span className="card-count">{stats?.taisysDevices || 0}</span>
                <span className="card-label">Taisys Devices</span>
              </div>
              <FaMicrochip className="card-icon" />
            </div>
            <div className="card-footer-action" onClick={() => alert('Downloading Taisys devices report...')}>
              Download <FaArrowCircleDown />
            </div>
          </div>
        </div>
      </div>

      {/* Activation & Common Layer Status Tables */}
      <div className="status-tables-grid">
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Activation Request Status wise</span>
            <select className="panel-toggle-select" defaultValue="Table">
              <option value="Table">Table</option>
              <option value="Chart">Chart</option>
            </select>
          </div>
          <div className="panel-body">
            <table className="table-custom">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Requested</th>
                  <th>Processing</th>
                  <th>Completed</th>
                  <th>Rejected</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>#</td>
                  <td>{stats?.activationStatus?.requested || 0}</td>
                  <td>{stats?.activationStatus?.processing || 0}</td>
                  <td>{stats?.activationStatus?.completed || 0}</td>
                  <td>{stats?.activationStatus?.rejected || 0}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Common Layer Status wise</span>
            <select className="panel-toggle-select" defaultValue="Table">
              <option value="Table">Table</option>
              <option value="Chart">Chart</option>
            </select>
          </div>
          <div className="panel-body">
            <table className="table-custom">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Processing</th>
                  <th>Completed</th>
                  <th>Rejected</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>#</td>
                  <td>{stats?.commonLayerStatus?.processing || 0}</td>
                  <td>{stats?.commonLayerStatus?.completed || 0}</td>
                  <td>{stats?.commonLayerStatus?.rejected || 0}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Transaction Details Section */}
      <div>
        <h2 className="section-title">Transaction Details</h2>
        <div className="transaction-cards-grid">
          <div className="transaction-card">
            <div className="transaction-card-body">
              <div className="card-info">
                <span className="transaction-amount">₹{stats?.simActivationTransactions?.toFixed(2) || '0.00'}</span>
                <span className="transaction-label">SIM Activation Transactions</span>
              </div>
              <FaMoneyBillAlt className="transaction-icon" />
            </div>
            <div className="transaction-footer" onClick={() => alert('Opening SIM transactions...')}>
              <span>VIEW TRANSACTIONS</span>
              <FaChevronRight />
            </div>
          </div>

          <div className="transaction-card">
            <div className="transaction-card-body">
              <div className="card-info">
                <span className="transaction-amount">₹{stats?.commonLayerTransactions?.toFixed(2) || '0.00'}</span>
                <span className="transaction-label">Common Layer Transactions</span>
              </div>
              <FaMoneyBillAlt className="transaction-icon" />
            </div>
            <div className="transaction-footer" onClick={() => alert('Opening Common Layer transactions...')}>
              <span>VIEW TRANSACTIONS</span>
              <FaChevronRight />
            </div>
          </div>
        </div>
      </div>

      {/* Expiry Lists (SIM & CL) */}
      <div className="expiry-tables-grid">
        <div className="panel">
          <div className="panel-header">
            <div className="panel-header-expiry">
              <div className="expiry-title-group">
                <h3>SIM Expiry (Jun,Jul)</h3>
                <span className="expiry-count">Count: {simExpiry.length}</span>
              </div>
              <button className="btn-view-all" onClick={() => alert('Viewing all SIM expiries')}>View all</button>
            </div>
          </div>
          <div className="panel-body">
            {simExpiry.length > 0 ? (
              <table className="table-custom">
                <thead>
                  <tr>
                    <th>Sno</th>
                    <th>IMEI</th>
                    <th>Serial No</th>
                    <th>ICCID</th>
                    <th>Expiry Date</th>
                    <th>Days more</th>
                  </tr>
                </thead>
                <tbody>
                  {simExpiry.map((item, index) => (
                    <tr key={item._id || index}>
                      <td>{index + 1}</td>
                      <td>{item.imei}</td>
                      <td>{item.serialNo}</td>
                      <td>{item.iccid || 'N/A'}</td>
                      <td>{new Date(item.simExpiryDate).toLocaleDateString()}</td>
                      <td>
                        {Math.ceil((new Date(item.simExpiryDate) - new Date()) / (1000 * 60 * 60 * 24))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="table-no-data">No data available in table</div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div className="panel-header-expiry">
              <div className="expiry-title-group">
                <h3>CL Expiry (Jun,Jul)</h3>
                <span className="expiry-count">Count: {clExpiry.length}</span>
              </div>
              <button className="btn-view-all" onClick={() => alert('Viewing all CL expiries')}>View all</button>
            </div>
          </div>
          <div className="panel-body">
            {clExpiry.length > 0 ? (
              <table className="table-custom">
                <thead>
                  <tr>
                    <th>Sno</th>
                    <th>Common Layer</th>
                    <th>IMEI</th>
                    <th>ICCID</th>
                    <th>Expiry Date</th>
                    <th>Days more</th>
                  </tr>
                </thead>
                <tbody>
                  {clExpiry.map((item, index) => (
                    <tr key={item._id || index}>
                      <td>{index + 1}</td>
                      <td>{item.commonLayer || 'N/A'}</td>
                      <td>{item.imei}</td>
                      <td>{item.iccid || 'N/A'}</td>
                      <td>{new Date(item.clExpiryDate).toLocaleDateString()}</td>
                      <td>
                        {Math.ceil((new Date(item.clExpiryDate) - new Date()) / (1000 * 60 * 60 * 24))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="table-no-data">No data available in table</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
