import { useState } from 'react';
import { FaCertificate, FaDownload, FaSearch, FaPlus } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import './Certificates.css';

const getRole = (user) => {
  if (user?.role === 'partner') return 'ADMIN';
  if (user?.userType === 'Administration') return 'ADMIN';
  if (user?.userType === 'Sub Dealer') return 'SUB_DEALER';
  return 'DEALER';
};

const Certificates = () => {
  const { user } = useAuth();
  const role = getRole(user);
  const [search, setSearch] = useState('');
  const [certificates, setCertificates] = useState([
    { id: 1, imei: '350000000000001', type: 'BSNL Activation Certificate', approvedDate: '2026-05-15', expiryDate: '2027-05-15', status: 'Approved' },
    { id: 2, imei: '350000000000002', type: 'Airtel M2M Certificate', approvedDate: '2026-04-10', expiryDate: '2028-04-10', status: 'Approved' },
    { id: 3, imei: '350000000000003', type: 'iTriangle ARAI Compliance', approvedDate: '2026-03-22', expiryDate: '2027-03-22', status: 'Approved' },
    { id: 4, imei: '350000000000004', type: 'ARAI Conformity Certificate', approvedDate: '2026-02-18', expiryDate: '2027-02-18', status: 'Approved' },
    { id: 5, imei: '350000000000005', type: 'BSNL BSNL-M2M Cert', approvedDate: '2026-01-05', expiryDate: '2027-01-05', status: 'Approved' }
  ]);

  const filteredCerts = certificates.filter(c => 
    c.imei.includes(search) || c.type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="certificates-container">
      <div className="certificates-actions-row">
        <h1 className="page-heading">Device <span className="subtitle">Certificates</span></h1>
        
        <div className="button-group">
          <button className="btn-upload-cert" onClick={() => alert('Opening certificate upload dialog...')}>
            <FaPlus /> Upload Certificate
          </button>
        </div>
      </div>

      <div className="card-panel">
        <div className="card-panel-header">
          <FaCertificate className="panel-icon" />
          <span className="panel-title">APPROVED CERTIFICATES LIST</span>
        </div>

        <div className="card-panel-body">
          <div className="table-filters-bar">
            <div className="search-input-group">
              <input 
                type="text" 
                placeholder="Search IMEI / Type..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button type="button"><FaSearch /></button>
            </div>
          </div>

          <div className="table-responsive">
            <table className="table-custom">
              <thead>
                <tr>
                  <th>Sl No.</th>
                  <th>Device IMEI</th>
                  <th>Certificate Type</th>
                  <th>Approved Date</th>
                  <th>Expiry Date</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredCerts.length > 0 ? (
                  filteredCerts.map((c, idx) => (
                    <tr key={c.id}>
                      <td>{idx + 1}</td>
                      <td className="text-semibold text-teal">{c.imei}</td>
                      <td>{c.type}</td>
                      <td>{c.approvedDate}</td>
                      <td>{c.expiryDate}</td>
                      <td><span className="badge-approved">{c.status}</span></td>
                      <td>
                        <button 
                          className="btn-download" 
                          onClick={() => alert(`Downloading certificate for IMEI: ${c.imei}...`)}
                        >
                          <FaDownload style={{ marginRight: '5px' }} /> Download PDF
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="text-center">No certificates found matching search.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Certificates;
