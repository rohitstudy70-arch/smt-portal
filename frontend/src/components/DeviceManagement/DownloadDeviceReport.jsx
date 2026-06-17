import { FaDownload } from 'react-icons/fa';
import './AddDevice.css';

const DownloadDeviceReport = () => {
  return (
    <div className="add-device-container">
      <div className="add-device-card">
        <div className="add-device-header">
          <FaDownload className="header-icon" />
          <span>DOWNLOAD DEVICE REPORT</span>
        </div>
        <div style={{ padding: '60px 24px', textAlign: 'center' }}>
          <FaDownload style={{ fontSize: '48px', color: '#cbd5e1', marginBottom: '16px' }} />
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#334155', marginBottom: '8px' }}>Coming Soon</h3>
          <p style={{ fontSize: '13.5px', color: '#64748b', maxWidth: '400px', margin: '0 auto' }}>
            Device report download functionality will be available soon. Stay tuned!
          </p>
        </div>
      </div>
    </div>
  );
};

export default DownloadDeviceReport;
