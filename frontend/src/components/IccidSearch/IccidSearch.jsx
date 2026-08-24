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
  const [kycDocsList, setKycDocsList] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState(''); // 'idle', 'uploading', 'success', 'failed'
  const [uploadError, setUploadError] = useState('');
  const [selectedDocType, setSelectedDocType] = useState('Fitment Letter');
  const [isReplacingDocId, setIsReplacingDocId] = useState(null);
  
  // Tracking Info States (Tracking ID & Software)
  const [trackingIdInput, setTrackingIdInput] = useState('');
  const [softwareInput, setSoftwareInput] = useState('');
  const [savingTracking, setSavingTracking] = useState(false);
  const [trackingSavedMsg, setTrackingSavedMsg] = useState('');
  
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
        setKycDocsList([]);
        setTrackingIdInput('');
        setSoftwareInput('');
        let targetImei = searchQuery;

        // 1. First try search-imei endpoint (supports Customer Name, Mobile, Vehicle, Chassis, IMEI, Serial, ICCID)
        const portalSearchRes = await api.get(`/portal/renewals/search-imei/${encodeURIComponent(searchQuery)}`).catch(() => null);
        if (portalSearchRes?.data?.imei) {
          targetImei = portalSearchRes.data.imei;
        }

        // 2. Fetch device details
        const res = await api.get('/devices', {
          params: { search: targetImei || searchQuery, limit: 1 }
        }).catch(() => ({ data: { devices: [] } }));

        let foundDevice = null;
        if (res.data?.devices && res.data.devices.length > 0) {
          foundDevice = res.data.devices[0];
          targetImei = foundDevice.imei;
          setDevice(foundDevice);
          setDocumentsList(foundDevice.documents || []);
        }

        // 3. If no device found yet, try searching by Customer Name / Vehicle Number via activation-requests
        if (!foundDevice) {
          const vehicleSearchRes = await api.get('/activation-requests', {
            params: { search: searchQuery, limit: 1 }
          }).catch(() => null);
          const vehicleRequests = vehicleSearchRes?.data?.requests || [];
          if (vehicleRequests.length > 0) {
            const vehicleImei = vehicleRequests[0].imei;
            if (vehicleImei) {
              targetImei = vehicleImei;
              const devByImei = await api.get('/devices', {
                params: { search: vehicleImei, limit: 1 }
              }).catch(() => null);
              if (devByImei?.data?.devices?.length > 0) {
                foundDevice = devByImei.data.devices[0];
                targetImei = foundDevice.imei;
                setDevice(foundDevice);
                setDocumentsList(foundDevice.documents || []);
              }
            }
          }
        }

        // 2. Fetch history and renewals in parallel using targetImei
        const [historyRes, renewalRes, directDeviceActRes] = await Promise.all([
          api.get('/activation-requests', {
            params: { search: targetImei, limit: 100 }
          }).catch(() => ({ data: { requests: [] } })),
          api.get('/portal/renewals', {
            params: { imei: targetImei }
          }).catch(() => ({ data: [] })),
          api.get(`/activation-requests/device/${targetImei}`).catch(() => null)
        ]);

        const history = historyRes.data?.requests || [];
        if (directDeviceActRes?.data && directDeviceActRes.data._id) {
          if (!history.some(r => r._id === directDeviceActRes.data._id)) {
            history.push(directDeviceActRes.data);
          }
        }

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

        // 4. Fetch Customer KYC Documents if IMEI available
        const finalImei = realImei || targetImei;
        if (finalImei) {
          const kycRes = await api.get(`/activation-requests/kyc-by-imei/${finalImei}`).catch(() => null);
          if (kycRes?.data?.kycDocuments && kycRes.data.kycDocuments.length > 0) {
            setKycDocsList(kycRes.data.kycDocuments);
          } else if (fetchedRequest?.kycDocuments?.length > 0) {
            setKycDocsList(fetchedRequest.kycDocuments);
          }
        }

        // 5. Pre-fill Tracking ID & Software
        const initialTrackingId = foundDevice?.trackingId || fetchedRequest?.trackingId || '';
        const initialSoftware = foundDevice?.software || fetchedRequest?.software || '';
        setTrackingIdInput(initialTrackingId);
        setSoftwareInput(initialSoftware);

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

    const subDealerName = device.subDealerName
      || device.subDealerId?.displayName
      || device.subDealerId?.companyName
      || device.subDealerId?.username
      || latestRequest?.subDealerName
      || '';

    const details = `--- DEVICE DETAILS ---
Model: ${vendorName}
Dealer Name: ${dealerName}
Sub Dealer Name: ${subDealerName}
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
Vehicle Reg. Year: ${latestRequest?.registrationYear || device?.registrationYear || '—'}
Activation Type: ${latestRenewal?.activationType || latestRequest?.activationMode || device?.activationType || '—'}
Vehicle Condition: ${latestRequest?.vehicleCondition || device?.vehicleCondition || '—'}
Vehicle Make: ${latestRequest?.vehicleMake || device?.vehicleMake || '—'}
Vehicle Model: ${latestRequest?.vehicleModel || device?.vehicleModel || '—'}
RTO: ${latestRequest?.rto || device?.rto || '—'}
Vehicle No: ${latestRenewal?.vehicleNumber || latestRequest?.vehicleNo || device?.vehicleNo || device?.vehicleNumber || '—'}
Engine No: ${latestRequest?.engineNo || device?.engineNo || '—'}
Chassis No: ${latestRequest?.chassisNo || device?.chassisNo || '—'}

--- CUSTOMER DETAILS ---
Customer Name: ${latestRenewal?.customerName || latestRequest?.customerName || device?.customerName || '—'}
Mobile No 1: ${latestRenewal?.customerMobile || latestRequest?.regMobNo || device?.regMobNo || device?.customerMobile || '—'}
Mobile No 2: ${latestRequest?.regMobNo2 || device?.regMobNo2 || '—'}
Aadhar No: ${latestRequest?.aadharNo || device?.aadharNo || '—'}
Address: ${latestRequest?.address || device?.address || '—'}
State: ${latestRequest?.userId?.state || device?.dealerId?.state || device?.state || '—'}
Tracking ID: ${trackingIdInput || device?.trackingId || latestRequest?.trackingId || latestRenewal?.trackingId || '—'}
Software: ${softwareInput || device?.software || latestRequest?.software || latestRenewal?.software || '—'}`;

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

  const handleViewFile = async (doc) => {
    try {
      const response = await api.get(`/devices/${device.imei}/documents/${doc._id}/preview`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: doc.mimeType || 'application/pdf' });
      const objectUrl = URL.createObjectURL(blob);

      const isImage = ['image/jpeg', 'image/jpg', 'image/png'].includes(doc.mimeType);
      if (isImage) {
        setPreviewImage({ ...doc, url: objectUrl });
        setZoomLevel(1);
        setIsFullScreen(false);
      } else {
        setPreviewPdf({ ...doc, url: objectUrl });
      }
    } catch (err) {
      console.error('Failed to view file:', err);
      // Fallback: pass authenticated URL
      const token = localStorage.getItem('token') || '';
      const previewUrl = `${(api.defaults.baseURL || '').replace(/\/api$/, '')}/api/devices/${device.imei}/documents/${doc._id}/preview?token=${token}`;
      const isImage = ['image/jpeg', 'image/jpg', 'image/png'].includes(doc.mimeType);
      if (isImage) {
        setPreviewImage({ ...doc, url: previewUrl });
        setZoomLevel(1);
        setIsFullScreen(false);
      } else {
        setPreviewPdf({ ...doc, url: previewUrl });
      }
    }
  };

  const handleViewKyc = async (doc) => {
    try {
      let objectUrl = '';
      const response = await api.get(doc.fileUrl, { responseType: 'blob' }).catch(() => null);
      if (response && response.data) {
        const blob = new Blob([response.data], { type: doc.mimeType || 'application/pdf' });
        objectUrl = URL.createObjectURL(blob);
      } else {
        const backendBase = (api.defaults.baseURL || '').replace(/\/api$/, '');
        const token = localStorage.getItem('token') || '';
        objectUrl = doc.fileUrl.startsWith('http')
          ? doc.fileUrl
          : `${backendBase}${doc.fileUrl}?token=${token}`;
      }

      const isImage = ['image/jpeg', 'image/jpg', 'image/png'].includes(doc.mimeType);
      if (isImage) {
        setPreviewImage({ ...doc, url: objectUrl });
        setZoomLevel(1);
        setIsFullScreen(false);
      } else {
        setPreviewPdf({ ...doc, url: objectUrl });
      }
    } catch (err) {
      console.error('Error previewing KYC:', err);
    }
  };

  const handleDownloadKyc = async (doc) => {
    try {
      const response = await api.get(doc.fileUrl, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: doc.mimeType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', doc.originalName || doc.fileName || 'KYC_Document');
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      console.error('Error downloading KYC:', err);
      const backendBase = (api.defaults.baseURL || '').replace(/\/api$/, '');
      const token = localStorage.getItem('token') || '';
      const fileUrl = doc.fileUrl.startsWith('http')
        ? doc.fileUrl
        : `${backendBase}${doc.fileUrl}?token=${token}`;
      window.open(fileUrl, '_blank');
    }
  };

  const handleSaveTrackingInfo = async () => {
    const targetImei = device?.imei || latestRequest?.imei || latestRenewal?.imei;
    if (!targetImei) {
      alert('No valid IMEI found for this device.');
      return;
    }
    setSavingTracking(true);
    setTrackingSavedMsg('');
    try {
      await api.put(`/devices/tracking-info/${targetImei}`, {
        trackingId: trackingIdInput,
        software: softwareInput
      });
      setTrackingSavedMsg('Tracking info saved successfully!');
      setTimeout(() => setTrackingSavedMsg(''), 3500);
    } catch (err) {
      console.error('Save tracking error:', err);
      alert(err.response?.data?.message || 'Failed to save tracking info.');
    } finally {
      setSavingTracking(false);
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
              <div>Sub Dealer Name: <strong>{device.subDealerName || device.subDealerId?.displayName || device.subDealerId?.companyName || ''}</strong></div>
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
                      <div className="grid-cell-value">{latestRequest?.registrationYear || device?.registrationYear || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">Activation Type</div>
                      <div className="grid-cell-value">{latestRenewal?.activationType || latestRequest?.activationMode || device?.activationType || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">Vehicle Condition</div>
                      <div className="grid-cell-value">{latestRequest?.vehicleCondition || device?.vehicleCondition || '—'}</div>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div className="grid-cell-label">Vehicle Make</div>
                      <div className="grid-cell-value">{latestRequest?.vehicleMake || device?.vehicleMake || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">Vehicle Model</div>
                      <div className="grid-cell-value">{latestRequest?.vehicleModel || device?.vehicleModel || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">RTO</div>
                      <div className="grid-cell-value">{latestRequest?.rto || device?.rto || '—'}</div>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div className="grid-cell-label">Vehicle No</div>
                      <div className="grid-cell-value bold">{latestRenewal?.vehicleNumber || latestRequest?.vehicleNo || device?.vehicleNo || device?.vehicleNumber || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">Engine No</div>
                      <div className="grid-cell-value bold">{latestRequest?.engineNo || device?.engineNo || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">Chassis No</div>
                      <div className="grid-cell-value bold">{latestRequest?.chassisNo || device?.chassisNo || '—'}</div>
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
                      <div className="grid-cell-value bold">{latestRenewal?.customerName || latestRequest?.customerName || device?.customerName || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">Mobile No 1</div>
                      <div className="grid-cell-value">{latestRenewal?.customerMobile || latestRequest?.regMobNo || device?.regMobNo || device?.customerMobile || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">Mobile No 2</div>
                      <div className="grid-cell-value">{latestRequest?.regMobNo2 || device?.regMobNo2 || '—'}</div>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div className="grid-cell-label">Aadhar No</div>
                      <div className="grid-cell-value">{latestRequest?.aadharNo || device?.aadharNo || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">Address</div>
                      <div className="grid-cell-value">{latestRequest?.address || device?.address || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">State</div>
                      <div className="grid-cell-value">{latestRequest?.userId?.state || device?.dealerId?.state || device?.state || '—'}</div>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div className="grid-cell-label">Tracking ID</div>
                      <div className="grid-cell-value bold">{trackingIdInput || device?.trackingId || latestRequest?.trackingId || latestRenewal?.trackingId || '—'}</div>
                    </td>
                    <td>
                      <div className="grid-cell-label">Software</div>
                      <div className="grid-cell-value bold">{softwareInput || device?.software || latestRequest?.software || latestRenewal?.software || '—'}</div>
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. Uploaded Documents Section */}
          <div className="search-section-card">
            <div className="section-header-teal">Uploaded Documents</div>
            
            {/* Admin Upload Control Section & Tracking Info Controls */}
            {role === 'ADMIN' && (
              <div className="upload-controls-box">
                <div className="upload-fields-row">
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
                      Upload Fitment Letter
                    </label>
                  </div>

                  {/* TRACKING ID INPUT */}
                  <div className="upload-field-group">
                    <label>Tracking ID</label>
                    <input 
                      type="text" 
                      className="tracking-id-input"
                      value={trackingIdInput}
                      onChange={(e) => setTrackingIdInput(e.target.value)}
                      placeholder="Enter Tracking ID"
                    />
                  </div>

                  {/* SOFTWARE DROPDOWN */}
                  <div className="upload-field-group">
                    <label>Software</label>
                    <select 
                      className="doc-type-select"
                      value={softwareInput}
                      onChange={(e) => setSoftwareInput(e.target.value)}
                    >
                      <option value="">Select Software</option>
                      <option value="CAR ONLINE">CAR ONLINE</option>
                      <option value="TRAQUELITE">TRAQUELITE</option>
                      <option value="CHASETRACK">CHASETRACK</option>
                      <option value="I PLUS">I PLUS</option>
                      <option value="TRACKFEY">TRACKFEY</option>
                      <option value="RTMS">RTMS</option>
                      <option value="OTHERS">OTHERS</option>
                    </select>
                  </div>

                  {/* SAVE TRACKING INFO BUTTON */}
                  <div className="upload-button-wrapper">
                    <button 
                      type="button" 
                      onClick={handleSaveTrackingInfo}
                      disabled={savingTracking}
                      className="btn-upload-label"
                      style={{ backgroundColor: '#059669', border: 'none' }}
                    >
                      {savingTracking ? 'Saving...' : 'Save Tracking Info'}
                    </button>
                  </div>
                </div>

                {trackingSavedMsg && (
                  <div className="upload-status-alert success-alert" style={{ marginTop: '10px' }}>
                    {trackingSavedMsg}
                  </div>
                )}

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
                    Success: Fitment Letter uploaded successfully!
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
                    const token = localStorage.getItem('token') || '';
                    const previewUrl = `${(api.defaults.baseURL || '').replace(/\/api$/, '')}/api/devices/${device.imei}/documents/${doc._id}/preview?token=${token}`;
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

          {/* 5. Customer KYC Documents Section */}
          <div className="search-section-card" style={{ marginTop: '20px' }}>
            <div className="section-header-teal">Customer KYC Details (PAN Card, Aadhaar Card, RC Book)</div>
            <div className="card-body-table" style={{ marginTop: '15px' }}>
              <table className="portal-table wide">
                <thead>
                  <tr>
                    <th>Document Type</th>
                    <th>File Name</th>
                    <th>Upload Date</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {kycDocsList.map((doc, idx) => {
                    const isImg = ['image/jpeg', 'image/jpg', 'image/png'].includes(doc.mimeType);
                    const backendBase = (api.defaults.baseURL || '').replace(/\/api$/, '');
                    const previewUrl = doc.fileUrl?.startsWith('http') ? doc.fileUrl : `${backendBase}${doc.fileUrl}`;
                    return (
                      <tr key={doc._id || idx}>
                        <td className="strong">{doc.documentType}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {isImg ? (
                              <img 
                                src={previewUrl} 
                                alt={doc.originalName || doc.fileName} 
                                className="doc-thumbnail"
                                onError={(e) => { e.target.src = 'https://placehold.co/40x40?text=KYC' }}
                              />
                            ) : (
                              <div className="pdf-thumbnail-placeholder">PDF</div>
                            )}
                            <span className="doc-file-name" title={doc.originalName || doc.fileName}>
                              {(doc.originalName || doc.fileName).length > 30 ? (doc.originalName || doc.fileName).substring(0, 27) + '...' : (doc.originalName || doc.fileName)}
                            </span>
                          </div>
                        </td>
                        <td>{doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                            <button 
                              type="button" 
                              className="btn-action-view"
                              onClick={() => handleViewKyc(doc)}
                            >
                              View
                            </button>
                            <button 
                              type="button" 
                              className="btn-action-download"
                              onClick={() => handleDownloadKyc(doc)}
                            >
                              Download
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {kycDocsList.length === 0 && (
                    <tr>
                      <td colSpan={4} className="portal-empty" style={{ padding: '24px' }}>
                        No KYC documents (PAN Card, Aadhaar Card, RC Book) uploaded for this customer/device.
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
                    <button 
                      type="button" 
                      onClick={() => window.open(previewPdf.url, '_blank')} 
                      title="Open in New Tab"
                      style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                    >
                      Open in New Tab ↗
                    </button>
                    <button type="button" onClick={() => handleFileDownload(previewPdf)} title="Download">Download</button>
                    <button type="button" className="close-btn" onClick={() => setPreviewPdf(null)}>Close</button>
                  </div>
                </div>
                <div className="preview-modal-body" style={{ height: '75vh', width: '100%' }}>
                  <object 
                    data={previewPdf.url} 
                    type="application/pdf" 
                    width="100%" 
                    height="100%"
                    style={{ border: 'none', width: '100%', height: '100%' }}
                  >
                    <embed src={previewPdf.url} type="application/pdf" width="100%" height="100%" />
                    <div style={{ padding: '20px', textAlign: 'center' }}>
                      <p>Inline PDF preview is restricted by browser security policy.</p>
                      <button 
                        onClick={() => window.open(previewPdf.url, '_blank')} 
                        style={{ padding: '8px 16px', background: '#059669', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        Open PDF in New Window
                      </button>
                    </div>
                  </object>
                </div>
              </div>
            </div>
          )}

        </div>
      ) : (
        <div className="search-prompt-msg">
          Please enter an IMEI, ICCID, Serial Number or Vehicle No in the top search bar to view device details.
        </div>
      )}
    </div>
  );
};

export default IccidSearch;
