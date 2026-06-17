import { FaCloudUploadAlt } from 'react-icons/fa';
import './AddDevice.css';

const BulkUploadDevices = () => {
  return (
    <div className="add-device-container">
      <div className="add-device-card">
        <div className="add-device-header">
          <FaCloudUploadAlt className="header-icon" />
          <span>BULK UPLOAD DEVICES</span>
        </div>
        <div style={{ padding: '60px 24px', textAlign: 'center' }}>
          <FaCloudUploadAlt style={{ fontSize: '48px', color: '#cbd5e1', marginBottom: '16px' }} />
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#334155', marginBottom: '8px' }}>Coming Soon</h3>
          <p style={{ fontSize: '13.5px', color: '#64748b', maxWidth: '400px', margin: '0 auto' }}>
            Bulk device upload via Excel/CSV will be available soon. Stay tuned!
          </p>
        </div>
      </div>
    </div>
  );
};

export default BulkUploadDevices;
