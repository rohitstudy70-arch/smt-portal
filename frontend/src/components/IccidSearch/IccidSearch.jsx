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
  const [latestRenewal, setLatestRenewal] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Document Management States
  const [documentsList, setDocumentsList] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState(''); // 'idle', 'uploading', 'success', 'failed'
  const [uploadError, setUploadError] = useState('');
  const [selectedDocType, setSelectedDocType] = useState('Vehicle Image');
  const [isReplacingDocId, setIsReplacingDocId] = useState(null);
  
  // Preview Modals State
  const [previewImage, setPreviewImage] = useState(null);
  const [previewPdf, setPreviewPdf] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const getRole = (u) => {
    if (u?.role === 'partner') return 'ADMIN';
    if (u?.userType === 'Administration') return 'ADMIN';
    if (u?.userType === 'Sub Dealer') return 'SUB_DEALER';
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
        setDevice(null);
        setLatestRequest(null);
        setLatestRenewal(null);
        setDocumentsList([]);

        // 1. Fetch device details
        const res = await api.get('/devices', {
          params: { search: searchQuery, limit: 1 }
        });

        let foundDevice = null;
        let targetImei = searchQuery;

        if (res.data.devices && res.data.devices.length > 0) {
          foundDevice = res.data.devices[0];
          targetImei = foundDevice.imei;
          setDevice(foundDevice);
          setDocumentsList(foundDevice.documents || []);
        }

        // 2. Fetch history and renewals in parallel using targetImei
        const [historyRes, renewalRes] = await Promise.all([
          api.get('/activation-requests', {
            params: { search: targetImei, limit: 100 }
          }).catch(() => ({ data: { requests: [] } })),
          api.get('/portal/renewals', {
            params: { imei: targetImei }
          }).catch(() => ({ data: [] }))
        ]);

        const history = historyRes.data.requests || [];
        let fetchedRequest = null;
        if (history.length > 0) {
          const sortedHistory = [...history].sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
          fetchedRequest = sortedHistory[0];
          setLatestRequest(fetchedRequest);
        }

        const renewals = renewalRes.data || [];
        let fetchedRenewal = null;
        if (renewals.length > 0) {
          const sortedRenewals = [...renewals].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          fetchedRenewal = sortedRenewals[0];
          setLatestRenewal(fetchedRenewal);
        }

        const realImei = fetchedRenewal?.imei || fetchedRequest?.imei || (foundDevice ? foundDevice.imei : null);

        if (realImei && (!foundDevice || foundDevice.imei !== realImei)) {
          const devRes = await api.get('/devices', {
            params: { search: realImei, limit: 1 }
          }).catch(() => null);

          if (devRes && devRes.data.devices && devRes.data.devices.length > 0) {
            foundDevice = devRes.data.devices[0];
            setDevice(foundDevice);
            setDocumentsList(foundDevice.documents || []);
          }
        }

        // If no device was found in Device table, but we have renewal or activation records, create a mock device!
        if (!foundDevice) {
          if (fetchedRenewal || fetchedRequest) {
            const mockDevice = {
              _id: fetchedRenewal?._id || fetchedRequest?._id,
              imei: realImei || targetImei,
              serialNo: fetchedRenewal?.serialNo || fetchedRequest?.serialNo || '—',
              iccid: fetchedRenewal?.iccid || fetchedRequest?.iccid || '—',
              vendor: fetchedRenewal?.deviceModel || fetchedRequest?.vendor || '—',
              dealerName: fetchedRenewal?.dealerName || fetchedRequest?.dealerName || '—',
              validity: fetchedRenewal?.validity || fetchedRequest?.validity || '1 Year',
              presentDate: fetchedRequest?.installationDate || fetchedRenewal?.createdAt || null,
              expiryDate: fetchedRenewal?.newExpiryDate || fetchedRequest?.expiryDate || null,
              status: fetchedRenewal?.status || fetchedRequest?.status || 'Active',
              documents: []
            };

            if (realImei && /^\d{15}$/.test(realImei)) {
              const docRes = await api.get(`/devices/${realImei}/documents`).catch(() => null);
              if (docRes && docRes.data && docRes.data.documents) {
                mockDevice.documents = docRes.data.documents;
              } else {
                const searchRes = await api.get(`/portal/renewals/search-imei/${realImei}`).catch(() => null);
                if (searchRes && searchRes.data && searchRes.data.documents) {
                  mockDevice.documents = searchRes.data.documents;
                }
              }
            }

            setDevice(mockDevice);
            setDocumentsList(mockDevice.documents || []);
          } else {
            setError('No device found matching the search term.');
          }
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
    
    const vendorName = device.vendor || latestRenewal?.deviceModel || latestRequest?.vendor || '-';
    const dealerName = device.dealerName
      || device.dealerId?.displayName
      || device.dealerId?.companyName
      || device.dealerId?.username
      || latestRenewal?.dealerName
      || latestRequest?.dealerName
      || '-';

    const details = `--- DEVICE DETAILS ---
Model: ${vendorName}
Dealer Name: ${dealerName}
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
Activation Type: ${latestRenewal?.activationType || latestRequest?.activationMode || '—'}
Vehicle Condition: ${latestRequest?.vehicleCondition || '—'}
Vehicle Make: ${latestRequest?.vehicleMake || '—'}
Vehicle Model: ${latestRequest?.vehicleModel || '—'}
RTO: ${latestRequest?.rto || '—'}
Vehicle No: ${latestRenewal?.vehicleNumber || latestRequest?.vehicleNo || '—'}
Engine No: ${latestRequest?.engineNo || '—'}
Chassis No: ${latestRequest?.chassisNo || '—'}

--- CUSTOMER DETAILS ---
Customer Name: ${latestRenewal?.customerName || latestRequest?.customerName || '—'}
Mobile No 1: ${latestRenewal?.customerMobile || latestRequest?.regMobNo || '—'}
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
    if (device.deviceStatus === 'active' || device.status === 'Activated' || device.status === 'Active') {
      return 'active';
    }
    if (latestRenewal && ['Activated', 'Completed'].includes(latestRenewal.status)) {
      return 'active';
    }
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

  const handleFileUpload = async (event, replaceDocId = null) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Validation
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        alert(`File "${file.name}" has an unsupported format. Only JPG, JPEG, PNG, and PDF are allowed.`);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert(`File "${file.name}" exceeds the maximum limit of 10MB.`);
        return;
      }
    }

    const formData = new FormData();
    if (replaceDocId) {
      formData.append('file', files[0]);
    } else {
      for (const file of files) {
        formData.append('files', file);
      }
      formData.append('documentType', selectedDocType);
    }

    try {
      setUploadProgress(0);
      setUploadStatus('uploading');
      setUploadError('');

      const url = replaceDocId 
        ? `/devices/${device.imei}/documents/${replaceDocId}`
        : `/devices/${device.imei}/documents`;

      const method = replaceDocId ? 'put' : 'post';

      const res = await api({
        method,
        url,
        data: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        }
      });

      setUploadStatus('success');
      setDocumentsList(res.data.documents || []);
      setIsReplacingDocId(null);
      
      setTimeout(() => {
        setUploadStatus('idle');
        setUploadProgress(0);
      }, 3000);
    } catch (err) {
      console.error('File upload failed:', err);
      setUploadStatus('failed');
      setUploadError(err.response?.data?.message || 'Failed to upload files. Please try again.');
    }
  };

  const handleFileDelete = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this document?')) {
      return;
    }

    try {
      const res = await api.delete(`/devices/${device.imei}/documents/${docId}`);
      setDocumentsList(res.data.documents || []);
      alert('Document deleted successfully.');
    } catch (err) {
      console.error('Failed to delete document:', err);
      alert(err.response?.data?.message || 'Failed to delete document. Please try again.');
    }
  };

  const handleFileDownload = async (doc) => {
    try {
      const res = await api.get(`/devices/${device.imei}/documents/${doc._id}/download`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', doc.originalName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download document:', err);
      alert('Failed to download document.');
    }
  };

  const handleViewFile = (doc) => {
    const isImage = ['image/jpeg', 'image/jpg', 'image/png'].includes(doc.mimeType);
    const previewUrl = `${(api.defaults.baseURL || '').replace(/\/api$/, '')}/api/devices/${device.imei}/documents/${doc._id}/preview`;
    
    if (isImage) {
      setPreviewImage({ ...doc, url: previewUrl });
      setZoomLevel(1);
      setIsFullScreen(false);
    } else if (doc.mimeType === 'application/pdf') {
      setPreviewPdf({ ...doc, url: previewUrl });
    }
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
              <div>Model: <strong>{device.vendor || '—'}</strong></div>
              <div>Dealer Name: <strong>{device.dealerName || device.dealerId?.displayName || device.dealerId?.companyName || '—'}</strong></div>
            </div>
            <div className="top-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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
                      <div className="grid-cell-value">{latestRenewal?.activationType || latestRequest?.activationMode || '—'}</div>
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
                      <div className="grid-cell-value bold">{latestRenewal?.vehicleNumber || latestRequest?.vehicleNo || '—'}</div>
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
                      <div className="grid-cell-value bold">{latestRenewal?.customerName || latestRequest?.customerName || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">Mobile No 1</div>
                      <div className="grid-cell-value">{latestRenewal?.customerMobile || latestRequest?.regMobNo || '—'}</div>
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

          {/* 4. Uploaded Documents Section */}
          <div className="search-section-card">
            <div className="section-header-teal">Uploaded Documents</div>
            
            {/* Admin Upload Control Section */}
            {role === 'ADMIN' && (
              <div className="upload-controls-box">
                <div className="upload-fields-row">
                  <div className="upload-field-group">
                    <label>Document Type</label>
                    <select 
                      value={selectedDocType} 
                      onChange={(e) => setSelectedDocType(e.target.value)}
                      className="doc-type-select"
                    >
                      <option value="Vehicle Image">Vehicle Image</option>
                      <option value="RC">RC</option>
                      <option value="Insurance">Insurance</option>
                      <option value="Activation Paper">Activation Paper</option>
                      <option value="Customer ID">Customer ID</option>
                      <option value="Invoice">Invoice</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  
                  <div className="upload-button-wrapper">
                    <input 
                      type="file" 
                      id="doc-files-upload"
                      multiple
                      onChange={(e) => handleFileUpload(e)}
                      style={{ display: 'none' }}
                      accept=".jpg,.jpeg,.png,.pdf"
                    />
                    <label htmlFor="doc-files-upload" className="btn-upload-label">
                      Choose & Upload File(s)
                    </label>
                  </div>
                </div>

                {/* Upload Status / Progress Bar */}
                {uploadStatus === 'uploading' && (
                  <div className="progress-bar-container">
                    <div className="progress-bar-label">Uploading... {uploadProgress}%</div>
                    <div className="progress-bar-track">
                      <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }}></div>
                    </div>
                  </div>
                )}
                {uploadStatus === 'success' && (
                  <div className="upload-status-alert success-alert">
                    Success: Document(s) uploaded successfully!
                  </div>
                )}
                {uploadStatus === 'failed' && (
                  <div className="upload-status-alert danger-alert">
                    Failed: {uploadError}
                  </div>
                )}
              </div>
            )}

            {/* Documents List Table */}
            <div className="card-body-table" style={{ marginTop: '15px' }}>
              <table className="portal-table wide">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>File Name</th>
                    <th>Uploaded By</th>
                    <th>Upload Time</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documentsList.map((doc) => {
                    const isImg = ['image/jpeg', 'image/jpg', 'image/png'].includes(doc.mimeType);
                    const previewUrl = `${(api.defaults.baseURL || '').replace(/\/api$/, '')}/api/devices/${device.imei}/documents/${doc._id}/preview`;
                    return (
                      <tr key={doc._id}>
                        <td className="strong">{doc.documentType}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {isImg ? (
                              <img 
                                src={previewUrl} 
                                alt={doc.originalName} 
                                className="doc-thumbnail"
                                onError={(e) => { e.target.src = 'https://placehold.co/40x40?text=Doc' }}
                              />
                            ) : (
                              <div className="pdf-thumbnail-placeholder">PDF</div>
                            )}
                            <span className="doc-file-name" title={doc.originalName}>
                              {doc.originalName.length > 25 ? doc.originalName.substring(0, 22) + '...' : doc.originalName}
                            </span>
                          </div>
                        </td>
                        <td>{doc.uploadedBy?.username || doc.uploadedBy?.displayName || 'Admin'}</td>
                        <td>{new Date(doc.uploadedAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                            <button 
                              type="button" 
                              className="btn-action-view"
                              onClick={() => handleViewFile(doc)}
                            >
                              View
                            </button>
                            <button 
                              type="button" 
                              className="btn-action-download"
                              onClick={() => handleFileDownload(doc)}
                            >
                              Download
                            </button>
                            {role === 'ADMIN' && (
                              <>
                                <input 
                                  type="file" 
                                  id={`replace-upload-${doc._id}`}
                                  onChange={(e) => handleFileUpload(e, doc._id)}
                                  style={{ display: 'none' }}
                                  accept=".jpg,.jpeg,.png,.pdf"
                                />
                                <label 
                                  htmlFor={`replace-upload-${doc._id}`} 
                                  className="btn-action-replace"
                                  onClick={() => setIsReplacingDocId(doc._id)}
                                >
                                  Replace
                                </label>
                                <button 
                                  type="button" 
                                  className="btn-action-delete"
                                  onClick={() => handleFileDelete(doc._id)}
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {documentsList.length === 0 && (
                    <tr>
                      <td colSpan={5} className="portal-empty" style={{ padding: '24px' }}>
                        No documents uploaded for this device.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Image Preview Modal */}
          {previewImage && (
            <div className={`preview-modal-overlay ${isFullScreen ? 'fullscreen' : ''}`}>
              <div className="preview-modal-container image-modal">
                <div className="preview-modal-header">
                  <h3>{previewImage.documentType} - {previewImage.originalName}</h3>
                  <div className="preview-header-controls">
                    <button type="button" onClick={() => setZoomLevel(prev => Math.max(0.5, prev - 0.25))} title="Zoom Out">-</button>
                    <span className="zoom-text">{Math.round(zoomLevel * 100)}%</span>
                    <button type="button" onClick={() => setZoomLevel(prev => Math.min(3, prev + 0.25))} title="Zoom In">+</button>
                    <button type="button" onClick={() => setIsFullScreen(!isFullScreen)} title="Full Screen">
                      {isFullScreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    </button>
                    <button type="button" onClick={() => handleFileDownload(previewImage)} title="Download">Download</button>
                    <button type="button" className="close-btn" onClick={() => { setPreviewImage(null); setZoomLevel(1); setIsFullScreen(false); }}>Close</button>
                  </div>
                </div>
                <div className="preview-modal-body">
                  <div className="image-zoom-wrapper" style={{ overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: '100%' }}>
                    <img 
                      src={previewImage.url} 
                      alt={previewImage.originalName} 
                      style={{ 
                        transform: `scale(${zoomLevel})`, 
                        transition: 'transform 0.1s ease',
                        maxWidth: '100%', 
                        maxHeight: '100%',
                        objectFit: 'contain'
                      }} 
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PDF Preview Modal */}
          {previewPdf && (
            <div className="preview-modal-overlay">
              <div className="preview-modal-container pdf-modal">
                <div className="preview-modal-header">
                  <h3>{previewPdf.documentType} - {previewPdf.originalName}</h3>
                  <div className="preview-header-controls">
                    <button type="button" onClick={() => handleFileDownload(previewPdf)} title="Download">Download</button>
                    <button type="button" className="close-btn" onClick={() => setPreviewPdf(null)}>Close</button>
                  </div>
                </div>
                <div className="preview-modal-body">
                  <iframe 
                    src={`${previewPdf.url}#toolbar=0`} 
                    title={previewPdf.originalName}
                    width="100%"
                    height="100%"
                    style={{ border: 'none' }}
                  />
                </div>
              </div>
            </div>
          )}

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
