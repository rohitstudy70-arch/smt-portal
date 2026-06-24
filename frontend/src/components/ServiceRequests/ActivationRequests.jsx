import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { FaSyncAlt, FaPlus, FaTimes, FaSpinner, FaSearch, FaChevronDown } from 'react-icons/fa';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import './ActivationRequests.css';

const getRole = (user) => {
  if (user?.role === 'partner') return 'ADMIN';
  if (user?.userType === 'Administration') return 'ADMIN';
  if (user?.userType === 'Sub Dealer') return 'SUB_DEALER';
  if (user?.userType === 'End Customer') return 'CUSTOMER';
  return 'DEALER';
};

const ActivationRequests = () => {
  const { user } = useAuth();
  const role = getRole(user);
  const location = useLocation();
  const [requests, setRequests] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);
  const [search, setSearch] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Initial Form State
  const initialFormState = {
    quantity: 1,
    requestType: 'Commercial Plan',
    plan: '1 Year',
    piNo: '',
    amount: 0,
    remarks: '',
    dealerName: '',
    dealerAddress: '',
    imei: '',
    iccid: '',
    serialNo: '',
    msisdn1: '',
    msisdn2: '',
    validity: '',
    expiryDate: null,
    itrNo: '',
    vendor: '',
    installationDate: '',
    activationMode: 'NIC',
    vehicleCondition: 'New',
    vehicleMake: '',
    vehicleModel: '',
    registrationYear: '',
    vehicleNo: '',
    rto: '',
    engineNo: '',
    chassisNo: '',
    regMobNo: '',
    regMobNo2: '',
    customerName: '',
    aadharNo: '',
    address: '',
    isSubDealer: false,
    subDealerName: '',
    deviceBillAmount: null
  };

  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editRequestId, setEditRequestId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState(initialFormState);
  const [imeiError, setImeiError] = useState('');

  // Device dropdown list state
  const [availableDevices, setAvailableDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [deviceSearch, setDeviceSearch] = useState('');
  const [deviceDropdownOpen, setDeviceDropdownOpen] = useState(false);

  const deviceDropdownRef = useRef(null);

  // Helper to format date for input (YYYY-MM-DD)
  const formatDateForInput = (dateVal) => {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Prefill Listener from Location State
  useEffect(() => {
    if (location.state?.prefillDevice) {
      const { prefillDevice, prefillRequest } = location.state;
      console.log('Prefill device object received in ActivationRequests:', prefillDevice);
      console.log('Prefill request object received in ActivationRequests:', prefillRequest);

      // Extract dealer details using select logic
      const dealerObj = prefillDevice.dealerId;
      let dealerAddressStr = '';
      let dName = prefillDevice.dealerName || '';
      
      if (dealerObj) {
        const parts = [
          dealerObj.address,
          dealerObj.city,
          dealerObj.state,
          dealerObj.pincode
        ].filter(Boolean);
        dealerAddressStr = parts.join(', ');
        dName = dealerObj.displayName || dealerObj.companyName || dealerObj.username || dName;
      } else {
        if (role === 'ADMIN' || role === 'DEALER') {
          const parts = [
            user?.address,
            user?.city,
            user?.state,
            user?.pincode
          ].filter(Boolean);
          dealerAddressStr = parts.join(', ');
          dName = user?.displayName || user?.companyName || user?.username || dName;
        }
      }

      setFormData(prev => ({
        ...prev,
        imei: prefillDevice.imei || '',
        iccid: prefillDevice.iccid || '',
        serialNo: prefillDevice.serialNo || '',
        msisdn1: prefillDevice.msisdn1 || '',
        msisdn2: prefillDevice.msisdn2 || '',
        validity: prefillDevice.validity || '1 Year',
        expiryDate: prefillDevice.expiryDate || null,
        dealerName: dName || '',
        dealerAddress: dealerAddressStr || '',
        isSubDealer: !!prefillDevice.subDealerId,
        subDealerName: prefillDevice.subDealerName || '',
        plan: prefillDevice.validity === '2 Years' ? '2 Years' : '1 Year',
        amount: prefillDevice.billAmount || 0,
        deviceBillAmount: prefillDevice.billAmount || null,
        itrNo: prefillDevice.itrNo || prefillRequest?.itrNo || '',
        vendor: prefillDevice.vendor || '',
        
        // Vehicle details from request
        installationDate: prefillRequest?.installationDate ? formatDateForInput(prefillRequest.installationDate) : '',
        activationMode: prefillRequest?.activationMode || 'NIC',
        vehicleCondition: prefillRequest?.vehicleCondition || 'New',
        vehicleMake: prefillRequest?.vehicleMake || '',
        vehicleModel: prefillRequest?.vehicleModel || '',
        registrationYear: prefillRequest?.registrationYear || '',
        vehicleNo: prefillRequest?.vehicleNo || '',
        rto: prefillRequest?.rto || '',
        engineNo: prefillRequest?.engineNo || '',
        chassisNo: prefillRequest?.chassisNo || '',
        
        // Customer details from request
        customerName: prefillRequest?.customerName || '',
        aadharNo: prefillRequest?.aadharNo || '',
        regMobNo: prefillRequest?.regMobNo || '',
        regMobNo2: prefillRequest?.regMobNo2 || '',
        address: prefillRequest?.address || ''
      }));

      setShowModal(true);

      // Clear the router state to avoid reopening on refresh
      window.history.replaceState(null, '');
    }
  }, [location.state, user, role]);

  // Auto-fetch customer details by RMN
  useEffect(() => {
    if (formData.regMobNo && formData.regMobNo.length === 10) {
      const fetchCustomerInfo = async () => {
        try {
          const res = await api.get(`/activation-requests/customer/${formData.regMobNo}`);
          if (res.data) {
            setFormData(prev => ({
              ...prev,
              customerName: prev.customerName || res.data.customerName || '',
              address: prev.address || res.data.address || '',
              aadharNo: prev.aadharNo || res.data.aadharNo || '',
              regMobNo2: prev.regMobNo2 || res.data.regMobNo2 || '',
              vehicleMake: prev.vehicleMake || res.data.vehicleMake || '',
              vehicleModel: prev.vehicleModel || res.data.vehicleModel || '',
              rto: prev.rto || res.data.rto || ''
            }));
          }
        } catch (error) {
          // If not found (404), do nothing.
        }
      };
      fetchCustomerInfo();
    }
  }, [formData.regMobNo]);

  // Auto-fetch existing activation data by IMEI
  useEffect(() => {
    if (formData.imei && formData.imei.length >= 10) {
      const fetchCustomerByImei = async () => {
        try {
          const res = await api.get(`/activation-requests/device/${formData.imei}`);
          if (res.data) {
            if (res.data.status !== 'Rejected') {
              setImeiError('ALREADY RAISED REQUEST');
            } else {
              setImeiError('');
            }
            const existingData = res.data;
            setFormData(prev => ({
              ...prev,
              customerName: existingData.customerName || prev.customerName || '',
              address: existingData.address || prev.address || '',
              aadharNo: existingData.aadharNo || prev.aadharNo || '',
              regMobNo: existingData.regMobNo || prev.regMobNo || '',
              regMobNo2: existingData.regMobNo2 || prev.regMobNo2 || '',
              vehicleMake: existingData.vehicleMake || prev.vehicleMake || '',
              vehicleModel: existingData.vehicleModel || prev.vehicleModel || '',
              rto: existingData.rto || prev.rto || '',
              vehicleNo: existingData.vehicleNo || prev.vehicleNo || '',
              engineNo: existingData.engineNo || prev.engineNo || '',
              chassisNo: existingData.chassisNo || prev.chassisNo || '',
              registrationYear: existingData.registrationYear || prev.registrationYear || '',
              vehicleCondition: existingData.vehicleCondition || prev.vehicleCondition || '',
              activationMode: existingData.activationMode || prev.activationMode || '',
              installationDate: (existingData.installationDate ? existingData.installationDate.substring(0, 10) : prev.installationDate),
            }));
          }
        } catch (error) {
          // If not found, do nothing.
          setImeiError('');
        }
      };
      fetchCustomerByImei();
    } else {
      setImeiError('');
    }
  }, [formData.imei]);

  // Fetch Requests
  useEffect(() => {
    const fetchRequests = async () => {
      try {
        setLoading(true);
        const response = await api.get('/activation-requests', {
          params: { page, limit, search }
        });
        setRequests(response.data.requests);
        setTotalCount(response.data.total);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching activation requests:', err);
        setLoading(false);
      }
    };

    fetchRequests();
  }, [page, limit, search, refreshTrigger]);

  // Amount Auto-calculation
  useEffect(() => {
    const qty = formData.quantity || 1;
    const customAmt = formData.deviceBillAmount || 0;
    if (formData.amount !== qty * customAmt) {
      setFormData(prev => ({ ...prev, amount: qty * customAmt }));
    }
  }, [formData.quantity, formData.deviceBillAmount]);

  // Load Devices on Modal Open
  useEffect(() => {
    if (showModal) {
      const fetchAvailableDevices = async () => {
        try {
          setLoadingDevices(true);
          const response = await api.get('/devices', {
            params: { limit: 1000, page: 1 }
          });
          setAvailableDevices(response.data.devices || []);
        } catch (err) {
          console.error('Error fetching devices:', err);
        } finally {
          setLoadingDevices(false);
        }
      };
      fetchAvailableDevices();
    }
  }, [showModal]);

  // Click Outside Listener for Device Selector Dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (deviceDropdownRef.current && !deviceDropdownRef.current.contains(event.target)) {
        setDeviceDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectDevice = (device) => {
    console.log('Selected device object in dropdown ActivationRequests:', device);
    // Construct address
    const dealerObj = device.dealerId;
    let dealerAddressStr = '';
    let dName = device.dealerName || '';
    
    if (dealerObj) {
      const parts = [
        dealerObj.address,
        dealerObj.city,
        dealerObj.state,
        dealerObj.pincode
      ].filter(Boolean);
      dealerAddressStr = parts.join(', ');
      dName = dealerObj.displayName || dealerObj.companyName || dealerObj.username || dName;
    } else {
      // Fallback to logged-in user if they are dealer/admin
      if (role === 'ADMIN' || role === 'DEALER') {
        const parts = [
          user?.address,
          user?.city,
          user?.state,
          user?.pincode
        ].filter(Boolean);
        dealerAddressStr = parts.join(', ');
        dName = user?.displayName || user?.companyName || user?.username || dName;
      }
    }

    setFormData(prev => ({
      ...prev,
      imei: device.imei || '',
      iccid: device.iccid || '',
      serialNo: device.serialNo || '',
      msisdn1: device.msisdn1 || '',
      msisdn2: device.msisdn2 || '',
      validity: device.validity || '1 Year',
      expiryDate: device.expiryDate || null,
      dealerName: dName || '',
      dealerAddress: dealerAddressStr || '',
      isSubDealer: !!device.subDealerId,
      subDealerName: device.subDealerName || '',
      vendor: device.vendor || '',
      itrNo: device.itrNo || '',
      plan: device.validity === '2 Years' ? '2 Years' : '1 Year',
      amount: device.billAmount || 0,
      deviceBillAmount: device.billAmount || null
    }));
    setDeviceDropdownOpen(false);
    setDeviceSearch('');
  };

  const handleLimitChange = (e) => {
    setLimit(parseInt(e.target.value));
    setPage(1);
  };

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= Math.ceil(totalCount / limit)) {
      setPage(newPage);
    }
  };

  const handleApproveRequest = async (requestId) => {
    if (!window.confirm('Are you sure you want to approve this activation request and activate the device?')) {
      return;
    }
    try {
      await api.put(`/activation-requests/${requestId}/approve`);
      alert('Request approved and device activated successfully!');
      handleRefresh();
    } catch (err) {
      console.error('Approve request error:', err);
      alert(err.response?.data?.message || 'Failed to approve request.');
    }
  };

  const handleRejectRequest = async (requestId, remarks) => {
    try {
      await api.put(`/activation-requests/${requestId}/reject`, { remarks });
      alert('Request rejected successfully!');
      handleRefresh();
    } catch (err) {
      console.error('Reject request error:', err);
      alert(err.response?.data?.message || 'Failed to reject request.');
    }
  };

  const handleDeleteRequest = async (requestId) => {
    if (!window.confirm('Are you sure you want to delete this request? This will allow you to assign the IMEI to another customer.')) {
      return;
    }
    try {
      await api.delete(`/activation-requests/${requestId}`);
      alert('Request deleted successfully!');
      handleRefresh();
    } catch (err) {
      console.error('Delete request error:', err);
      alert(err.response?.data?.message || 'Failed to delete request.');
    }
  };

  const handleRejectClick = (requestId) => {
    const remarks = window.prompt('Enter rejection remarks (optional):');
    if (remarks !== null) {
      handleRejectRequest(requestId, remarks);
    }
  };

  const handleEditClick = (req) => {
    setFormData({
      quantity: req.quantity || 1,
      requestType: req.requestType || 'Commercial Plan',
      plan: req.plan || '',
      piNo: req.piNo || '',
      amount: req.amount || 0,
      remarks: req.remarks || '',
      dealerName: req.dealerName || '',
      dealerAddress: req.dealerAddress || '',
      imei: req.imei || '',
      iccid: req.iccid || '',
      serialNo: req.serialNo || '',
      msisdn1: req.msisdn1 || '',
      msisdn2: req.msisdn2 || '',
      validity: req.validity || '',
      expiryDate: req.expiryDate ? formatDateForInput(req.expiryDate) : '',
      itrNo: req.itrNo || '',
      vendor: req.vendor || '',
      installationDate: req.installationDate ? formatDateForInput(req.installationDate) : '',
      activationMode: req.activationMode || 'NIC',
      vehicleCondition: req.vehicleCondition || 'New',
      vehicleMake: req.vehicleMake || '',
      vehicleModel: req.vehicleModel || '',
      registrationYear: req.registrationYear || '',
      vehicleNo: req.vehicleNo || '',
      rto: req.rto || '',
      engineNo: req.engineNo || '',
      chassisNo: req.chassisNo || '',
      regMobNo: req.regMobNo || '',
      regMobNo2: req.regMobNo2 || '',
      customerName: req.customerName || '',
      aadharNo: req.aadharNo || '',
      address: req.address || '',
      isSubDealer: req.isSubDealer || false,
      subDealerName: req.subDealerName || '',
      deviceBillAmount: null
    });
    setEditRequestId(req._id);
    setIsEditing(true);
    setShowModal(true);
  };

  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isEditing) {
        await api.put(`/activation-requests/${editRequestId}`, formData);
        alert('Activation Request updated successfully!');
      } else {
        await api.post('/activation-requests', formData);
        alert('Activation Request raised successfully!');
      }
      setShowModal(false);
      setSubmitting(false);
      setIsEditing(false);
      setEditRequestId(null);
      setFormData(initialFormState);
      handleRefresh();
    } catch (err) {
      console.error('Error submitting request:', err);
      setSubmitting(false);
      alert(err.response?.data?.message || 'Failed to submit request.');
    }
  };

  const totalPages = Math.ceil(totalCount / limit) || 1;

  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      let start = Math.max(2, page - 2);
      let end = Math.min(totalPages - 1, page + 2);
      
      if (page <= 4) {
        end = 5;
      } else if (page >= totalPages - 3) {
        start = totalPages - 4;
      }
      
      if (start > 2) {
        pages.push('...');
      }
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (end < totalPages - 1) {
        pages.push('...');
      }
      pages.push(totalPages);
    }
    return pages;
  };

  const formatDateString = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const filteredDevices = availableDevices.filter(device => {
    const searchLower = deviceSearch.toLowerCase();
    return (
      (device.imei || '').toLowerCase().includes(searchLower) ||
      (device.serialNo || '').toLowerCase().includes(searchLower) ||
      (device.iccid || '').toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="requests-panel">
      <div className="requests-header">
        <span className="requests-title">
          <FaSyncAlt style={{ cursor: 'pointer' }} onClick={handleRefresh} />
          LATEST UPLOADED REQUESTS
        </span>
        {role !== 'CUSTOMER' && (
          <button className="btn-raise" onClick={() => {
            setFormData(initialFormState);
            setIsEditing(false);
            setEditRequestId(null);
            setShowModal(true);
          }}>
            <FaPlus /> Raise Request
          </button>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h3>{isEditing ? 'Edit Activation Request' : 'Raise Activation Request'}</h3>
              <FaTimes className="modal-close-icon" onClick={() => {
                setShowModal(false);
                setIsEditing(false);
                setEditRequestId(null);
                setFormData(initialFormState);
              }} />
            </div>

            <form onSubmit={handleSubmitRequest} className="activation-form">
              <div className="form-columns-container">
                
                {/* COLUMN 1: DEVICE DETAILS (AUTO-FILLED) */}
                <div className="form-column">
                  <h4 className="column-section-title">DEVICE & PARTNER DETAILS</h4>
                  
                  <div className="form-group-custom" ref={deviceDropdownRef}>
                    <label>Select Device (IMEI / Serial) <span className="required-star">*</span></label>
                    <div className="searchable-dropdown-custom">
                      <div 
                        className="dropdown-trigger-custom"
                        onClick={() => setDeviceDropdownOpen(!deviceDropdownOpen)}
                      >
                        <span className={formData.imei ? 'selected-value' : 'placeholder-value'}>
                          {formData.imei ? formData.imei : 'Search & Select Device...'}
                        </span>
                        <FaChevronDown className={`dropdown-arrow-custom ${deviceDropdownOpen ? 'open' : ''}`} />
                      </div>
                      
                      {deviceDropdownOpen && (
                        <div className="dropdown-menu-custom">
                          <div className="dropdown-search-custom">
                            <FaSearch className="search-icon-custom" />
                            <input 
                              type="text"
                              placeholder="Search by IMEI, Serial, ICCID..."
                              value={deviceSearch}
                              onChange={(e) => setDeviceSearch(e.target.value)}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          
                          <ul className="dropdown-list-custom">
                            {loadingDevices ? (
                              <li className="dropdown-info-custom">Loading devices...</li>
                            ) : filteredDevices.length > 0 ? (
                              filteredDevices.map(dev => (
                                <li key={dev._id} onClick={() => handleSelectDevice(dev)} className="dropdown-item-custom">
                                  <div className="dropdown-item-title">IMEI: {dev.imei}</div>
                                  <div className="dropdown-item-subtitle">
                                    SN: {dev.serialNo} | ICCID: {dev.iccid || 'N/A'}
                                  </div>
                                </li>
                              ))
                            ) : (
                              <li className="dropdown-info-custom">No devices found</li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="form-row-grid">
                    <div className="form-group-custom">
                      <label>Dealer Name</label>
                      <input 
                        type="text" 
                        value={formData.dealerName} 
                        className="readonly-input" 
                        readOnly 
                        placeholder="Auto-filled"
                      />
                    </div>

                    {formData.isSubDealer && (
                      <div className="form-group-custom">
                        <label>Sub Dealer Name</label>
                        <input 
                          type="text" 
                          value={formData.subDealerName} 
                          className="readonly-input" 
                          readOnly 
                          placeholder="Auto-filled"
                        />
                      </div>
                    )}

                    <div className="form-group-custom">
                      <label>Dealer Address</label>
                      <input 
                        type="text" 
                        value={formData.dealerAddress} 
                        className="readonly-input" 
                        readOnly 
                        placeholder="Auto-filled"
                      />
                    </div>

                    <div className="form-group-custom">
                      <label>IMEI No</label>
                      <input 
                        type="text" 
                        value={formData.imei} 
                        className="readonly-input" 
                        readOnly 
                        placeholder="Auto-filled"
                      />
                      {imeiError && <span style={{ color: 'red', fontSize: '12px', marginTop: '4px', display: 'block', fontWeight: 'bold' }}>{imeiError}</span>}
                    </div>

                    <div className="form-group-custom">
                      <label>ICCID No</label>
                      <input 
                        type="text" 
                        value={formData.iccid} 
                        className="readonly-input" 
                        readOnly 
                        placeholder="Auto-filled"
                      />
                    </div>

                    <div className="form-group-custom">
                      <label>Serial No</label>
                      <input 
                        type="text" 
                        value={formData.serialNo} 
                        className="readonly-input" 
                        readOnly 
                        placeholder="Auto-filled"
                      />
                    </div>

                    <div className="form-group-custom">
                      <label>MSISDN 1</label>
                      <input 
                        type="text" 
                        value={formData.msisdn1} 
                        className="readonly-input" 
                        readOnly 
                        placeholder="Auto-filled"
                      />
                    </div>

                    <div className="form-group-custom">
                      <label>MSISDN 2</label>
                      <input 
                        type="text" 
                        value={formData.msisdn2} 
                        className="readonly-input" 
                        readOnly 
                        placeholder="Auto-filled"
                      />
                    </div>

                    <div className="form-group-custom">
                      <label>Validity</label>
                      <input 
                        type="text" 
                        value={formData.validity} 
                        className="readonly-input" 
                        readOnly 
                        placeholder="Auto-filled"
                      />
                    </div>

                    <div className="form-group-custom">
                      <label>Exp. Date</label>
                      <input 
                        type="text" 
                        value={formatDateString(formData.expiryDate)} 
                        className="readonly-input" 
                        readOnly 
                        placeholder="Auto-filled"
                      />
                    </div>
                    <div className="form-group-custom">
                      <label>ITR No</label>
                      <input 
                        type="text" 
                        value={formData.itrNo}
                        onChange={(e) => setFormData({...formData, itrNo: e.target.value})}
                        placeholder="Enter ITR Number"
                      />
                    </div>
                    <div className="form-group-custom">
                      <label>Vendor Name</label>
                      <input 
                        type="text" 
                        value={formData.vendor} 
                        className="readonly-input" 
                        readOnly 
                        placeholder="Auto-filled"
                      />
                    </div>
                  </div>


                </div>

                {/* COLUMN 2: VEHICLE & CUSTOMER DETAILS (MANUAL) */}
                <div className="form-column">
                  <h4 className="column-section-title">VEHICLE & INSTALLATION DETAILS</h4>
                  
                  <div className="form-row-grid">
                    <div className="form-group-custom">
                      <label>Activation Type <span className="required-star">*</span></label>
                      <select 
                        value={formData.activationMode}
                        onChange={(e) => setFormData({...formData, activationMode: e.target.value})}
                      >
                        <option value="NIC">NIC</option>
                        <option value="Mining">Mining</option>
                      </select>
                    </div>

                    <div className="form-group-custom">
                      <label>Vehicle Condition <span className="required-star">*</span></label>
                      <select 
                        value={formData.vehicleCondition}
                        onChange={(e) => setFormData({...formData, vehicleCondition: e.target.value})}
                      >
                        <option value="New">New</option>
                        <option value="Old">Old</option>
                      </select>
                    </div>

                    <div className="form-group-custom">
                      <label>Vehicle Make <span className="required-star">*</span></label>
                      <select
                        value={formData.vehicleMake}
                        onChange={(e) => setFormData({...formData, vehicleMake: e.target.value})}
                        required
                      >
                        <option value="">Select Make</option>
                        <option value="Tata Motors">Tata Motors</option>
                        <option value="Mahindra">Mahindra</option>
                        <option value="Ashok Leyland">Ashok Leyland</option>
                        <option value="Eicher Motors">Eicher Motors</option>
                        <option value="Maruti Suzuki">Maruti Suzuki</option>
                        <option value="Hyundai">Hyundai</option>
                        <option value="Honda">Honda</option>
                        <option value="Toyota">Toyota</option>
                        <option value="BharatBenz">BharatBenz</option>
                        <option value="Force Motors">Force Motors</option>
                        <option value="VE Commercial">VE Commercial</option>
                        <option value="VE">VE</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="form-group-custom">
                      <label>Vehicle Model <span className="required-star">*</span></label>
                      <select 
                        value={formData.vehicleModel}
                        onChange={(e) => setFormData({...formData, vehicleModel: e.target.value})}
                        required
                      >
                        <option value="">Select Model</option>
                        <option value="Goods carrier">Goods carrier</option>
                        <option value="Bus">Bus</option>
                        <option value="Cab">Cab</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="form-group-custom">
                      <label>Registration Year <span className="required-star">*</span></label>
                      <select
                        value={formData.registrationYear}
                        onChange={(e) => setFormData({...formData, registrationYear: e.target.value})}
                        required
                      >
                        <option value="">Select Year</option>
                        {Array.from({ length: 25 }, (_, i) => {
                          const year = new Date().getFullYear() - i;
                          return <option key={year} value={year}>{year}</option>;
                        })}
                      </select>
                    </div>

                    <div className="form-group-custom">
                      <label>Vehicle Number <span className="required-star">*</span></label>
                      <input 
                        type="text" 
                        value={formData.vehicleNo}
                        onChange={(e) => setFormData({...formData, vehicleNo: e.target.value})}
                        placeholder="e.g. RJ14-GA-1234"
                        required
                      />
                    </div>

                    <div className="form-group-custom">
                      <label>RTO <span className="required-star">*</span></label>
                      <input 
                        type="text" 
                        value={formData.rto}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                          if (val.length <= 4) {
                            setFormData({...formData, rto: val});
                          }
                        }}
                        placeholder="e.g. RJ14"
                        maxLength={4}
                        required
                      />
                    </div>

                    <div className="form-group-custom">
                      <label>Engine Number</label>
                      <input 
                        type="text" 
                        value={formData.engineNo}
                        onChange={(e) => setFormData({...formData, engineNo: e.target.value})}
                        placeholder="Enter engine number"
                      />
                    </div>

                    <div className="form-group-custom">
                      <label>Chassis Number</label>
                      <input 
                        type="text" 
                        value={formData.chassisNo}
                        onChange={(e) => setFormData({...formData, chassisNo: e.target.value})}
                        placeholder="Enter chassis number"
                      />
                    </div>
                  </div>

                  <h4 className="column-section-title" style={{ marginTop: '20px' }}>CUSTOMER DETAILS</h4>

                  <div className="form-row-grid">
                    <div className="form-group-custom">
                      <label>Customer Name <span className="required-star">*</span></label>
                      <input 
                        type="text" 
                        value={formData.customerName}
                        onChange={(e) => setFormData({...formData, customerName: e.target.value})}
                        placeholder="Enter customer name"
                        required
                      />
                    </div>

                    <div className="form-group-custom">
                      <label>Aadhar Number</label>
                      <input 
                        type="text" 
                        value={formData.aadharNo}
                        onChange={(e) => setFormData({...formData, aadharNo: e.target.value})}
                        placeholder="Enter 12-digit Aadhar"
                        maxLength={12}
                      />
                    </div>

                    <div className="form-group-custom">
                      <label>Reg. Mobile No <span className="required-star">*</span></label>
                      <input 
                        type="text" 
                        value={formData.regMobNo}
                        onChange={(e) => setFormData({...formData, regMobNo: e.target.value})}
                        placeholder="Enter mobile number"
                        maxLength={10}
                        required
                      />
                    </div>

                    <div className="form-group-custom">
                      <label>Reg. Mobile No 2</label>
                      <input 
                        type="text" 
                        value={formData.regMobNo2}
                        onChange={(e) => setFormData({...formData, regMobNo2: e.target.value})}
                        placeholder="Alternative contact"
                        maxLength={10}
                      />
                    </div>

                    <div className="form-group-custom full-width-group">
                      <label>Customer Address <span className="required-star">*</span></label>
                      <textarea 
                        value={formData.address}
                        onChange={(e) => setFormData({...formData, address: e.target.value})}
                        placeholder="Enter customer address"
                        rows="2"
                        required
                      />
                    </div>
                  </div>
                </div>

              </div>

              <div className="modal-footer-actions">
                <div className="bill-amt-badge">
                  BILL AMT: <span>₹{formData.amount}</span>
                </div>
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="btn-cancel-custom"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={submitting || !formData.imei || !!imeiError}
                  className="btn-submit-custom"
                >
                  {submitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="requests-filters">
        <div className="show-entries">
          Show 
          <select value={limit} onChange={handleLimitChange}>
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select> 
          entries
        </div>

        <div className="search-entries">
          Search: 
          <input 
            type="text" 
            value={search} 
            onChange={handleSearchChange} 
            placeholder="Search by Request ID, Plan, Remarks"
          />
        </div>
      </div>

      <div className="table-responsive">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: '#666' }}>
            <FaSpinner className="spin" style={{ marginRight: '8px' }} /> Loading requests...
          </div>
        ) : (
          <table className="table-requests">
            <thead>
              {role === 'ADMIN' ? (
                <tr>
                  <th style={{ width: '40px' }}><input type="checkbox" /></th>
                  <th>No.</th>
                  <th>Request ID</th>
                  <th>IMEI</th>
                  <th>ICCID</th>
                  <th>Customer Name</th>
                  <th>Dealer Name</th>
                  <th>Request Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              ) : (
                <tr>
                  <th style={{ width: '40px' }}><input type="checkbox" /></th>
                  <th>No.</th>
                  <th>Request ID</th>
                  <th>Is Sub Dealer</th>
                  <th>Sub Dealer Name</th>
                  <th>DateTime</th>
                  <th>Quantity</th>
                  <th>Request Type</th>
                  <th>Plan</th>
                  <th>PI No.</th>
                  <th>Amount (₹)</th>
                  <th>Remarks</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              )}
            </thead>
            <tbody>
              {requests.length > 0 ? (
                requests.map((req, index) => {
                  const displayStatus = req.status === 'Completed' ? 'Active' : req.status;
                  const statusClass = displayStatus.toLowerCase();

                  if (role === 'ADMIN') {
                    return (
                      <tr key={req._id}>
                        <td><input type="checkbox" /></td>
                        <td>{((page - 1) * limit) + index + 1}</td>
                        <td style={{ color: '#337ab7', fontWeight: '600' }}>{req.requestId}</td>
                        <td style={{ fontWeight: '600' }}>{req.imei || '--'}</td>
                        <td>{req.iccid || '--'}</td>
                        <td>{req.customerName || '--'}</td>
                        <td>{req.dealerName || '--'}</td>
                        <td>
                          {new Date(req.dateTime).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </td>
                        <td>
                          <span className={`status-badge ${statusClass}`}>
                            {displayStatus}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {['requested', 'processing'].includes(req.status.toLowerCase()) ? (
                              <>
                                <button
                                  onClick={() => handleApproveRequest(req._id)}
                                  style={{
                                    padding: '4px 8px',
                                    background: '#5cb85c',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Approve / Activate Device
                                </button>
                                <button
                                  onClick={() => handleRejectClick(req._id)}
                                  style={{
                                    padding: '4px 8px',
                                    background: '#d9534f',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Reject
                                </button>
                              </>
                            ) : (
                              <span style={{ fontSize: '11px', color: '#999', fontStyle: 'italic', display: 'none' }}></span>
                            )}
                            <div style={{ display: 'flex', gap: '5px', marginLeft: 'auto' }}>
                              {(req.status !== 'Completed' || role === 'ADMIN') && (
                                <button
                                  onClick={() => handleEditClick(req)}
                                  style={{ padding: '4px 8px', background: '#337ab7', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                                >
                                  Edit
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteRequest(req._id)}
                                style={{ padding: '4px 8px', background: '#d9534f', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={req._id}>
                      <td><input type="checkbox" /></td>
                      <td>{((page - 1) * limit) + index + 1}</td>
                      <td style={{ color: '#337ab7', fontWeight: '600' }}>{req.requestId}</td>
                      <td>{req.isSubDealer ? 'Yes' : 'No'}</td>
                      <td>{req.subDealerName || '--'}</td>
                      <td>
                        {new Date(req.dateTime).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: true
                        })}
                      </td>
                      <td>{req.quantity}</td>
                      <td>{req.requestType}</td>
                      <td>{req.plan}</td>
                      <td>{req.piNo || '--'}</td>
                      <td style={{ fontWeight: '600' }}>{req.amount.toFixed(2)}</td>
                      <td style={{ maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {req.remarks || '--'}
                      </td>
                      <td>
                        <span className={`status-badge ${statusClass}`}>
                          {displayStatus}
                        </span>
                      </td>
                      <td>
                        {(req.status !== 'Completed' || role === 'ADMIN') && (
                          <div style={{ display: 'flex', gap: '5px' }}>
                            <button
                              onClick={() => handleEditClick(req)}
                              style={{ padding: '4px 8px', background: '#337ab7', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteRequest(req._id)}
                              style={{ padding: '4px 8px', background: '#d9534f', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={role === 'ADMIN' ? '10' : '13'} style={{ textAlign: 'center', padding: '20px', color: '#999', fontStyle: 'italic' }}>
                    No records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="requests-footer">
        <div className="records-info">
          Showing {totalCount > 0 ? ((page - 1) * limit) + 1 : 0} to {Math.min(page * limit, totalCount)} of {totalCount} records
        </div>

        <div className="pagination">
          <div 
            className={`pagination-item ${page === 1 ? 'disabled' : ''}`}
            onClick={() => handlePageChange(page - 1)}
          >
            Previous
          </div>

          {getPageNumbers().map((p, idx) => (
            p === '...' ? (
              <span key={`ell-${idx}`} className="pagination-ellipsis" style={{ padding: '6px 12px', color: '#888', background: 'transparent', display: 'inline-block' }}>
                ...
              </span>
            ) : (
              <div 
                key={p}
                className={`pagination-item ${page === p ? 'active' : ''}`}
                onClick={() => handlePageChange(p)}
              >
                {p}
              </div>
            )
          ))}

          <div 
            className={`pagination-item ${page === totalPages ? 'disabled' : ''}`}
            onClick={() => handlePageChange(page + 1)}
          >
            Next
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActivationRequests;
