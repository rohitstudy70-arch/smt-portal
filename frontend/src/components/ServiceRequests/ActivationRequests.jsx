import { useState, useEffect, useRef } from 'react';
import { FaSyncAlt, FaPlus, FaTimes, FaSpinner, FaSearch, FaChevronDown } from 'react-icons/fa';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import './ActivationRequests.css';

const getRole = (user) => {
  if (user?.role === 'partner') return 'ADMIN';
  if (user?.userType === 'Sub Dealer') return 'SUB_DEALER';
  if (user?.userType === 'End Customer') return 'CUSTOMER';
  return 'DEALER';
};

const ActivationRequests = () => {
  const { user } = useAuth();
  const role = getRole(user);
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
    amount: 1300,
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
    subDealerName: ''
  };

  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState(initialFormState);

  // Device dropdown list state
  const [availableDevices, setAvailableDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [deviceSearch, setDeviceSearch] = useState('');
  const [deviceDropdownOpen, setDeviceDropdownOpen] = useState(false);

  const deviceDropdownRef = useRef(null);

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
    const type = formData.requestType;
    const plan = formData.plan;

    if (type === 'Commercial Plan') {
      if (plan === '1 Year') {
        setFormData(prev => ({ ...prev, amount: qty * 1300 }));
      } else if (plan === '2 Years') {
        setFormData(prev => ({ ...prev, amount: qty * 2600 }));
      } else if (plan === '1 Month') {
        setFormData(prev => ({ ...prev, amount: qty * 110 }));
      }
    } else if (type === 'Recharge Plan') {
      if (plan === 'recharge NIC') {
        setFormData(prev => ({ ...prev, amount: qty * 1500 }));
      } else if (plan === 'RENEWAL MINING') {
        setFormData(prev => ({ ...prev, amount: qty * 1800 }));
      }
    } else if (type === 'Top-up') {
      if (plan === '1 Month') {
        setFormData(prev => ({ ...prev, amount: qty * 100 }));
      } else if (plan === '1 Year') {
        setFormData(prev => ({ ...prev, amount: qty * 1200 }));
      } else if (plan === '2 Years') {
        setFormData(prev => ({ ...prev, amount: qty * 2400 }));
      }
    }
  }, [formData.quantity, formData.requestType, formData.plan]);

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
      plan: device.validity === '2 Years' ? '2 Years' : '1 Year'
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

  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/activation-requests', formData);
      setShowModal(false);
      setSubmitting(false);
      setFormData(initialFormState);
      // Refresh list
      handleRefresh();
      alert('Activation Request raised successfully!');
    } catch (err) {
      console.error('Error creating request:', err);
      setSubmitting(false);
      alert(err.response?.data?.message || 'Failed to raise request.');
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
          <button className="btn-raise" onClick={() => setShowModal(true)}>
            <FaPlus /> Raise Request
          </button>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h3>Raise Activation Request</h3>
              <FaTimes className="modal-close-icon" onClick={() => setShowModal(false)} />
            </div>

            <form onSubmit={handleSubmitRequest} className="activation-form">
              <div className="form-columns-container">
                
                {/* COLUMN 1: DEVICE DETAILS (AUTO-FILLED) */}
                <div className="form-column">
                  <h4 className="column-section-title">Device & Partner Details</h4>
                  
                  <div className="form-group-custom" ref={deviceDropdownRef}>
                    <label>Select Device (IMEI / Serial) <span className="required-star">*</span></label>
                    <div className="searchable-dropdown-custom">
                      <div 
                        className="dropdown-trigger-custom"
                        onClick={() => setDeviceDropdownOpen(!deviceDropdownOpen)}
                      >
                        <span className={formData.imei ? 'selected-value' : 'placeholder-value'}>
                          {formData.imei ? `${formData.imei} (SN: ${formData.serialNo})` : 'Search & Select Device...'}
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
                  </div>

                  <h4 className="column-section-title" style={{ marginTop: '20px' }}>Billing & Plan</h4>
                  
                  <div className="form-row-grid">
                    <div className="form-group-custom">
                      <label>Request Type</label>
                      <select 
                        value={formData.requestType}
                        onChange={(e) => {
                          const type = e.target.value;
                          let defaultPlan = '1 Year';
                          let defaultAmt = 1300;
                          if (type === 'Recharge Plan') {
                            defaultPlan = 'recharge NIC';
                            defaultAmt = 1500;
                          } else if (type === 'Top-up') {
                            defaultPlan = '1 Month';
                            defaultAmt = 100;
                          }
                          setFormData({
                            ...formData,
                            requestType: type,
                            plan: defaultPlan,
                            amount: defaultAmt
                          });
                        }}
                      >
                        <option value="Commercial Plan">Commercial Plan</option>
                        <option value="Top-up">Top-up</option>
                        <option value="Recharge Plan">Recharge Plan</option>
                      </select>
                    </div>

                    <div className="form-group-custom">
                      <label>Plan</label>
                      <select 
                        value={formData.plan}
                        onChange={(e) => setFormData({...formData, plan: e.target.value})}
                      >
                        {formData.requestType === 'Commercial Plan' && (
                          <>
                            <option value="1 Month">1 Month</option>
                            <option value="1 Year">1 Year</option>
                            <option value="2 Years">2 Years</option>
                          </>
                        )}
                        {formData.requestType === 'Recharge Plan' && (
                          <>
                            <option value="recharge NIC">recharge NIC</option>
                            <option value="RENEWAL MINING">RENEWAL MINING</option>
                          </>
                        )}
                        {formData.requestType === 'Top-up' && (
                          <>
                            <option value="1 Month">1 Month</option>
                            <option value="1 Year">1 Year</option>
                            <option value="2 Years">2 Years</option>
                          </>
                        )}
                      </select>
                    </div>

                    <div className="form-group-custom">
                      <label>PI No <span className="required-star">*</span></label>
                      <input 
                        type="text" 
                        value={formData.piNo}
                        onChange={(e) => setFormData({...formData, piNo: e.target.value})}
                        placeholder="e.g. iTR_PI_0626_43466"
                        required
                      />
                    </div>

                    <div className="form-group-custom">
                      <label>Amount (₹) <span className="required-star">*</span></label>
                      <input 
                        type="number" 
                        min="0.01" 
                        step="0.01"
                        value={formData.amount}
                        onChange={(e) => setFormData({...formData, amount: parseFloat(e.target.value) || 0})}
                        readOnly={(formData.requestType === 'Commercial Plan' && (formData.plan === '1 Year' || formData.plan === '2 Years')) || (formData.requestType === 'Recharge Plan' && (formData.plan === 'recharge NIC' || formData.plan === 'RENEWAL MINING'))}
                        className={((formData.requestType === 'Commercial Plan' && (formData.plan === '1 Year' || formData.plan === '2 Years')) || (formData.requestType === 'Recharge Plan' && (formData.plan === 'recharge NIC' || formData.plan === 'RENEWAL MINING'))) ? 'readonly-input' : ''}
                        required
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

                    <div className="form-group-custom full-width-group">
                      <label>Remarks</label>
                      <textarea 
                        value={formData.remarks}
                        onChange={(e) => setFormData({...formData, remarks: e.target.value})}
                        placeholder="Enter remarks"
                        rows="2"
                      />
                    </div>
                  </div>
                </div>

                {/* COLUMN 2: VEHICLE & CUSTOMER DETAILS (MANUAL) */}
                <div className="form-column">
                  <h4 className="column-section-title">Vehicle & Installation Details</h4>
                  
                  <div className="form-row-grid">
                    <div className="form-group-custom">
                      <label>Installation Date <span className="required-star">*</span></label>
                      <input 
                        type="date" 
                        value={formData.installationDate}
                        onChange={(e) => setFormData({...formData, installationDate: e.target.value})}
                        required
                      />
                    </div>

                    <div className="form-group-custom">
                      <label>Activation Mode <span className="required-star">*</span></label>
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
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="form-group-custom">
                      <label>Vehicle Model <span className="required-star">*</span></label>
                      <input 
                        type="text" 
                        value={formData.vehicleModel}
                        onChange={(e) => setFormData({...formData, vehicleModel: e.target.value})}
                        placeholder="e.g. Bolero, LPT 1613"
                        required
                      />
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
                        onChange={(e) => setFormData({...formData, rto: e.target.value})}
                        placeholder="e.g. Jaipur RJ14"
                        required
                      />
                    </div>

                    <div className="form-group-custom">
                      <label>Engine Number <span className="required-star">*</span></label>
                      <input 
                        type="text" 
                        value={formData.engineNo}
                        onChange={(e) => setFormData({...formData, engineNo: e.target.value})}
                        placeholder="Enter engine number"
                        required
                      />
                    </div>

                    <div className="form-group-custom">
                      <label>Chassis Number <span className="required-star">*</span></label>
                      <input 
                        type="text" 
                        value={formData.chassisNo}
                        onChange={(e) => setFormData({...formData, chassisNo: e.target.value})}
                        placeholder="Enter chassis number"
                        required
                      />
                    </div>
                  </div>

                  <h4 className="column-section-title" style={{ marginTop: '20px' }}>Customer Details</h4>

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
                      <label>Aadhar Number <span className="required-star">*</span></label>
                      <input 
                        type="text" 
                        value={formData.aadharNo}
                        onChange={(e) => setFormData({...formData, aadharNo: e.target.value})}
                        placeholder="Enter 12-digit Aadhar"
                        maxLength={12}
                        required
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
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="btn-cancel-custom"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={submitting || !formData.imei}
                  className="btn-submit-custom"
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
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
              </tr>
            </thead>
            <tbody>
              {requests.length > 0 ? (
                requests.map((req, index) => (
                  <tr key={req._id}>
                    <td><input type="checkbox" /></td>
                    <td>{((page - 1) * limit) + index + 1}</td>
                    <td style={{ color: '#337ab7', fontWeight: '600' }}>{req.requestId}</td>
                    <td>{req.isSubDealer ? 'Yes' : 'No'}</td>
                    <td>{req.subDealerName || '--'}</td>
                    <td>{new Date(req.dateTime).toLocaleString()}</td>
                    <td>{req.quantity}</td>
                    <td>{req.requestType}</td>
                    <td>{req.plan}</td>
                    <td>{req.piNo || '--'}</td>
                    <td style={{ fontWeight: '600' }}>{req.amount.toFixed(2)}</td>
                    <td style={{ maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {req.remarks || '--'}
                    </td>
                    <td>
                      <span className={`status-badge ${req.status.toLowerCase()}`}>
                        {req.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="13" style={{ textAlign: 'center', padding: '20px', color: '#999', fontStyle: 'italic' }}>
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
