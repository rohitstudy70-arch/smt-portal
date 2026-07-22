import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FaCheckCircle,
  FaChevronDown,
  FaCloudUploadAlt,
  FaFilter,
  FaMobileAlt,
  FaRedo,
  FaSave,
  FaSearch,
  FaTimesCircle,
  FaEdit,
  FaTrash,
  FaSync,
  FaTimes,
} from 'react-icons/fa';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import BulkUploadDevices from './BulkUploadDevices';
import './AddDevice.css';

const getRole = (user) => {
  if (user?.role === 'partner') return 'ADMIN';
  if (user?.userType === 'Administration') return 'ADMIN';
  if (user?.userType === 'Sub Dealer') return 'SUB_DEALER';
  return 'DEALER';
};

const getName = (item) => item?.displayName || item?.companyName || item?.username || 'N/A';

const getLinkedName = (item, fallback = '-') => (
  item ? getName(item) : (fallback || '-')
);

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const getLocalDateString = (dateObj) => {
  const d = dateObj ? new Date(dateObj) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createEmptyForm = (dealer, defaultVendor = '') => ({
  dealerId: dealer?._id || '',
  dealerName: dealer ? getName(dealer) : '',
  subDealerId: '',
  subDealerName: '',
  vendor: defaultVendor,
  imei: '',
  iccid: '',
  serialNo: '',
  msisdn1: '',
  msisdn2: '',
  itrNo: '',

  billAmount: '',
  validity: '1 Year',
  status: 'Active',
  presentDate: getLocalDateString(),
});

const AddDevice = () => {
  const { user } = useAuth();
  const role = getRole(user);
  const tableColSpan = 15 - (role === 'SUB_DEALER' ? 2 : 0);
  const [dealers, setDealers] = useState([]);
  const [subDealers, setSubDealers] = useState([]);
  const [devices, setDevices] = useState([]);
  const [totalDevices, setTotalDevices] = useState(0);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [formData, setFormData] = useState(createEmptyForm());
  const [editingDeviceId, setEditingDeviceId] = useState(null);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState({ show: false, type: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [dealerSearch, setDealerSearch] = useState('');
  const [dealerDropdownOpen, setDealerDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const [subDealerSearch, setSubDealerSearch] = useState('');
  const [subDealerDropdownOpen, setSubDealerDropdownOpen] = useState(false);
  const subDealerDropdownRef = useRef(null);

  // Table search states
  const [tableSearch, setTableSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterDateMode, setFilterDateMode] = useState('all');
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  // Top Up Modal states
  const [topUpModalOpen, setTopUpModalOpen] = useState(false);
  const [topUpDevice, setTopUpDevice] = useState(null);
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [topUpSubmitting, setTopUpSubmitting] = useState(false);
  const [topUpForm, setTopUpForm] = useState({
    customerName: '',
    customerMobile: '',
    vehicleNumber: '',
    deviceModel: '',
    activationType: 'NIC',
    productDescription: 'Renewal',
    validity: '1 Year',
    renewalDate: getLocalDateString(),
    billAmount: '',
    paymentMode: '',
    transactionId: '',
    paymentDate: getLocalDateString(),
    remarks: '',
  });
  const [topUpScreenshot, setTopUpScreenshot] = useState(null);

  // Pagination states
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  const selectedDealer = useMemo(
    () => dealers.find((dealer) => dealer._id === formData.dealerId),
    [dealers, formData.dealerId]
  );

  const availableSubDealers = useMemo(() => {
    if (!formData.dealerId) return [];
    return subDealers.filter((sd) => sd.parentId === formData.dealerId);
  }, [subDealers, formData.dealerId]);

  const filteredSubDealers = useMemo(() => {
    return availableSubDealers.filter((subDealer) =>
      getName(subDealer).toLowerCase().includes(subDealerSearch.toLowerCase())
    );
  }, [availableSubDealers, subDealerSearch]);

  const expiryDate = useMemo(() => {
    if (!formData.presentDate) return null;
    const date = new Date(formData.presentDate);
    if (isNaN(date.getTime())) return null;
    date.setFullYear(date.getFullYear() + (formData.validity === '2 Years' ? 2 : 1));
    return date;
  }, [formData.presentDate, formData.validity]);

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    window.setTimeout(() => setToast({ show: false, type: '', message: '' }), 4000);
  };

  const fetchDevices = useCallback(async (searchQuery = '', fromDate = '', toDate = '', targetPage = 1, targetLimit = 25) => {
    try {
      setDevicesLoading(true);
      const response = await api.get('/devices', {
        params: {
          limit: targetLimit,
          page: targetPage,
          search: searchQuery,
          dateFrom: fromDate,
          dateTo: toDate,
        },
      });
      setDevices(response.data.devices || []);
      setTotalDevices(response.data.total || 0);
    } catch (error) {
      showToast('error', error.response?.data?.message || 'Failed to load devices.');
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(tableSearch);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [tableSearch]);

  // Fetch devices when search query, role, date filters, page, or limit change
  useEffect(() => {
    fetchDevices(debouncedSearch, filterFromDate, filterToDate, page, limit);
  }, [debouncedSearch, filterFromDate, filterToDate, page, limit, fetchDevices]);

  const handleDateModeChange = (mode) => {
    setFilterDateMode(mode);
    setPage(1);
    const todayStr = getLocalDateString();
    
    if (mode === 'all') {
      setFilterFromDate('');
      setFilterToDate('');
    } else if (mode === 'today') {
      setFilterFromDate(todayStr);
      setFilterToDate(todayStr);
    } else if (mode === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = getLocalDateString(yesterday);
      setFilterFromDate(yesterdayStr);
      setFilterToDate(yesterdayStr);
    } else if (mode === 'custom') {
      // Keep empty or let them change
    }
  };

  useEffect(() => {
    const fetchAllUsersAndPopulate = async () => {
      try {
        const response = await api.get('/users/sub-users');
        const allUsers = response.data || [];

        // Identify dealers
        let dealerList = [];
        if (role === 'ADMIN') {
          const listFromDb = allUsers.filter(
            (item) => item.userType === 'Dealer' || item.userType === '' || item.role === 'partner'
          );
          if (user && !listFromDb.some((u) => u._id === user._id)) {
            listFromDb.unshift(user);
          }
          dealerList = listFromDb;
        } else {
          dealerList = user ? [user] : [];
        }

        // Identify sub-dealers
        const subDealerList = allUsers.filter((item) => item.userType === 'Sub Dealer');

        setDealers(dealerList);
        setSubDealers(subDealerList);

        if (dealerList.length === 1) {
          setFormData(createEmptyForm(dealerList[0], ''));
        } else {
          setFormData(createEmptyForm(null, ''));
        }
      } catch (error) {
        showToast('error', error.response?.data?.message || 'Failed to load users.');
      }
    };

    fetchAllUsersAndPopulate();
  }, [role, user]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDealerDropdownOpen(false);
      }
      if (subDealerDropdownRef.current && !subDealerDropdownRef.current.contains(event.target)) {
        setSubDealerDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredDealers = dealers.filter((dealer) => (
    getName(dealer).toLowerCase().includes(dealerSearch.toLowerCase())
  ));

  const updateFormField = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }));
    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: '' }));
    }
  };

  const selectDealer = (dealer) => {
    setFormData((current) => ({
      ...current,
      dealerId: dealer._id,
      dealerName: getName(dealer),
      subDealerId: '',
      subDealerName: '',
    }));
    setDealerSearch('');
    setDealerDropdownOpen(false);
    if (errors.dealerId || errors.dealerName) {
      setErrors((current) => ({ ...current, dealerId: '', dealerName: '' }));
    }
  };

  const selectSubDealer = (subDealer) => {
    setFormData((current) => ({
      ...current,
      subDealerId: subDealer ? subDealer._id : '',
      subDealerName: subDealer ? getName(subDealer) : '',
    }));
    setSubDealerSearch('');
    setSubDealerDropdownOpen(false);
  };

  const validate = () => {
    const nextErrors = {};
    if (!formData.dealerId && !formData.dealerName) nextErrors.dealerId = 'Dealer is required';
    if (!formData.vendor) nextErrors.vendor = 'Model is required';
    if (!formData.imei) nextErrors.imei = 'IMEI is required';
    else if (!/^\d{15}$/.test(formData.imei)) nextErrors.imei = 'IMEI must be exactly 15 digits';
    if (!formData.iccid) nextErrors.iccid = 'ICCID is required';
    if (!formData.serialNo) nextErrors.serialNo = 'Serial No is required';

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      if (editingDeviceId) {
        if (user?.role !== 'partner') {
          showToast('error', 'Access denied: Only the Admin ID is allowed to edit devices.');
          setSubmitting(false);
          return;
        }
        await api.put(`/devices/${editingDeviceId}`, {
          ...formData,
          serialNo: formData.serialNo || formData.imei
        });
        showToast('success', 'Device updated successfully!');
      } else {
        await api.post('/devices', {
          ...formData,
          serialNo: formData.serialNo || formData.imei
        });
        showToast('success', 'Device added successfully!');
      }
      handleReset();
      setPage(1);
      await fetchDevices(debouncedSearch, filterFromDate, filterToDate, 1, limit);
    } catch (error) {
      const message = error.response?.data?.message || `Failed to ${editingDeviceId ? 'update' : 'add'} device. Please try again.`;
      showToast('error', message);

      const nextErrors = {};
      if (message.toLowerCase().includes('imei')) nextErrors.imei = message;
      if (message.toLowerCase().includes('iccid')) nextErrors.iccid = message;
      setErrors((current) => ({ ...current, ...nextErrors }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDevice = async (deviceId, imei) => {
    if (user?.role !== 'partner') {
      showToast('error', 'Access denied: Only the Admin ID is allowed to delete devices.');
      return;
    }
    if (window.confirm(`Are you sure you want to permanently delete device with IMEI "${imei}"?`)) {
      try {
        const res = await api.delete(`/devices/${deviceId}`);
        showToast('success', res.data.message || 'Device deleted successfully.');
        let newPage = page;
        if (devices.length === 1 && page > 1) {
          newPage = page - 1;
          setPage(newPage);
        }
        await fetchDevices(debouncedSearch, filterFromDate, filterToDate, newPage, limit);
      } catch (error) {
        showToast('error', error.response?.data?.message || 'Failed to delete device.');
      }
    }
  };

  const handleReset = () => {
    const defaultDealer = dealers.length === 1 ? dealers[0] : dealers.find((d) => d._id === formData.dealerId);
    setFormData(createEmptyForm(defaultDealer || selectedDealer, ''));
    setErrors({});
    setDealerSearch('');
    setSubDealerSearch('');
    setEditingDeviceId(null);
  };

  const handleEditStart = (device) => {
    setEditingDeviceId(device._id);
    setFormData({
      dealerId: device.dealerId?._id || device.dealerId || '',
      dealerName: getLinkedName(device.dealerId, device.dealerName),
      subDealerId: device.subDealerId?._id || device.subDealerId || '',
      subDealerName: getLinkedName(device.subDealerId, device.subDealerName),
      vendor: device.vendor || 'iTriangle',
      imei: device.imei || '',
      iccid: device.iccid || '',
      serialNo: device.serialNo || '',
      msisdn1: device.msisdn1 || '',
      msisdn2: device.msisdn2 || '',
      itrNo: device.itrNo || '',
      billAmount: device.billAmount || '',
      validity: device.validity || '1 Year',
      status: device.status || 'Active',
      presentDate: device.presentDate ? getLocalDateString(device.presentDate) : getLocalDateString(),
    });
    setDealerSearch(getLinkedName(device.dealerId, device.dealerName));
    setSubDealerSearch(getLinkedName(device.subDealerId, device.subDealerName));
    setErrors({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalPages = Math.ceil(totalDevices / limit);

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

  // --- Top Up Modal Handlers ---
  const handleTopUpOpen = (device) => {
    setTopUpDevice(device);
    setTopUpForm({
      topUpAmount: '',
    });
    setTopUpModalOpen(true);
  };

  const handleTopUpClose = () => {
    setTopUpModalOpen(false);
    setTopUpDevice(null);
  };

  const handleTopUpSubmit = async (e) => {
    e.preventDefault();
    if (!topUpDevice) return;

    const amount = Number(topUpForm.topUpAmount);
    if (!amount || amount <= 0) {
      showToast('error', 'Top Up Amount must be greater than 0.');
      return;
    }

    setTopUpSubmitting(true);
    try {
      await api.put(`/devices/${topUpDevice._id}/topup`, {
        topUpAmount: amount,
      });

      showToast('success', 'Top Up added successfully!');
      handleTopUpClose();
      setPage(1);
      await fetchDevices(debouncedSearch, filterFromDate, filterToDate, 1, limit);
    } catch (error) {
      const msg = error.response?.data?.message || 'Failed to submit top-up request.';
      showToast('error', msg);
    } finally {
      setTopUpSubmitting(false);
    }
  };



  return (
    <div className="add-device-container">
      {toast.show && (
        <div className={`toast-notification ${toast.type}`}>
          {toast.type === 'success' ? <FaCheckCircle /> : <FaTimesCircle />}
          <span>{toast.message}</span>
        </div>
      )}

      {user?.userType !== 'Dealer' && (
        <div className="add-device-card">
        <div className="add-device-header">
          <FaMobileAlt className="header-icon" />
          <span>{editingDeviceId ? 'EDIT DEVICE' : (role === 'DEALER' ? 'ASSIGN DEVICE TO SUB DEALER' : 'ADD NEW DEVICE')}</span>
        </div>

        <form className="add-device-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            {role === 'ADMIN' && (
              <div className={`form-group ${errors.dealerId ? 'has-error' : ''}`}>
                <label>Dealer Name <span className="required">*</span></label>
                <div className="searchable-dropdown" ref={dropdownRef}>
                  <div
                    className="dropdown-trigger"
                    onClick={() => dealers.length > 1 && setDealerDropdownOpen(!dealerDropdownOpen)}
                  >
                    <span className={formData.dealerName ? '' : 'placeholder'}>
                      {formData.dealerName || 'Select Dealer'}
                    </span>
                    <FaChevronDown className={`dropdown-arrow ${dealerDropdownOpen ? 'open' : ''}`} />
                  </div>
                  {dealerDropdownOpen && (
                    <div className="dropdown-menu">
                      <div className="dropdown-search">
                        <FaSearch className="search-icon" />
                        <input
                          type="text"
                          placeholder="Search dealer..."
                          value={dealerSearch}
                          onChange={(event) => setDealerSearch(event.target.value)}
                          autoFocus
                        />
                      </div>
                      <ul className="dropdown-list">
                        {filteredDealers.length > 0 ? (
                          filteredDealers.map((dealer) => (
                            <li key={dealer._id} onClick={() => selectDealer(dealer)}>
                              {getName(dealer)}
                            </li>
                          ))
                        ) : (
                          <li className="no-results">No dealers found</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
                {errors.dealerId && <span className="error-text">{errors.dealerId}</span>}
              </div>
            )}

            {(role === 'ADMIN' || role === 'DEALER') && (
              <div className="form-group">
                <label>Sub Dealer Name</label>
                <div className="searchable-dropdown" ref={subDealerDropdownRef}>
                  <div
                    className="dropdown-trigger"
                    onClick={() => {
                      if (!formData.dealerId) {
                        showToast('error', 'Please select a Dealer first.');
                        return;
                      }
                      if (availableSubDealers.length === 0) {
                        showToast('error', 'No sub dealers found for this dealer.');
                        return;
                      }
                      setSubDealerDropdownOpen(!subDealerDropdownOpen);
                    }}
                  >
                    <span className={formData.subDealerName ? '' : 'placeholder'}>
                      {formData.subDealerName || (formData.dealerId ? 'Select Sub Dealer' : 'Select Dealer First')}
                    </span>
                    <FaChevronDown className={`dropdown-arrow ${subDealerDropdownOpen ? 'open' : ''}`} />
                  </div>
                  {subDealerDropdownOpen && (
                    <div className="dropdown-menu">
                      <div className="dropdown-search">
                        <FaSearch className="search-icon" />
                        <input
                          type="text"
                          placeholder="Search sub dealer..."
                          value={subDealerSearch}
                          onChange={(event) => setSubDealerSearch(event.target.value)}
                          autoFocus
                        />
                      </div>
                      <ul className="dropdown-list">
                        <li onClick={() => selectSubDealer(null)}>
                          <em>None (No Sub Dealer)</em>
                        </li>
                        {filteredSubDealers.length > 0 ? (
                          filteredSubDealers.map((subDealer) => (
                            <li key={subDealer._id} onClick={() => selectSubDealer(subDealer)}>
                              {getName(subDealer)}
                            </li>
                          ))
                        ) : (
                          <li className="no-results">No sub dealers found</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className={`form-group ${errors.vendor ? 'has-error' : ''}`}>
              <label>Model <span className="required">*</span></label>
              <select name="vendor" value={formData.vendor} onChange={(event) => updateFormField('vendor', event.target.value)}>
                <option value="">Select Model</option>
                {role === 'ADMIN' && <option value="iTriangle">iTriangle</option>}
                <option value="Acute">Acute</option>
                <option value="Markon">Markon</option>
                <option value="RDM">RDM</option>
                <option value="BB">BB</option>
                <option value="TrackNow">TrackNow</option>
                <option value="Road point">Road point</option>
              </select>
              {errors.vendor && <span className="error-text">{errors.vendor}</span>}
            </div>

            <div className={`form-group ${errors.imei ? 'has-error' : ''}`}>
              <label>IMEI No. <span className="required">*</span></label>
              <input
                type="text"
                name="imei"
                value={formData.imei}
                onChange={(event) => updateFormField('imei', event.target.value)}
                placeholder="Enter 15-digit IMEI"
                maxLength={15}
              />
              {errors.imei && <span className="error-text">{errors.imei}</span>}
            </div>

            <div className={`form-group ${errors.serialNo ? 'has-error' : ''}`}>
              <label>Serial No. <span className="required"></span></label>
              <input
                type="text"
                name="serialNo"
                value={formData.serialNo}
                onChange={(event) => updateFormField('serialNo', event.target.value)}
                placeholder="Enter Serial Number"
              />
              {errors.serialNo && <span className="error-text">{errors.serialNo}</span>}
            </div>

            <div className={`form-group ${errors.iccid ? 'has-error' : ''}`}>
              <label>ICCID No. <span className="required"></span></label>
              <input
                type="text"
                name="iccid"
                value={formData.iccid}
                onChange={(event) => updateFormField('iccid', event.target.value)}
                placeholder="Enter ICCID"
              />
              {errors.iccid && <span className="error-text">{errors.iccid}</span>}
            </div>

            <div className="form-group">
              <label>MSISDN 1</label>
              <input
                type="text"
                name="msisdn1"
                value={formData.msisdn1}
                onChange={(event) => updateFormField('msisdn1', event.target.value)}
                placeholder="Enter MSISDN 1"
              />
            </div>



            <div className="form-group">
              <label>MSISDN 2</label>
              <input
                type="text"
                name="msisdn2"
                value={formData.msisdn2}
                onChange={(event) => updateFormField('msisdn2', event.target.value)}
                placeholder="Enter MSISDN 2"
              />
            </div>

            <div className="form-group">
              <label>ITR No.</label>
              <input
                type="text"
                name="itrNo"
                value={formData.itrNo || ''}
                onChange={(event) => updateFormField('itrNo', event.target.value)}
                placeholder="Enter ITR Number"
              />
            </div>

            <div className="form-group">
              <label>Validity</label>
              <select name="validity" value={formData.validity} onChange={(event) => updateFormField('validity', event.target.value)}>
                <option value="1 Year">1 Year</option>
                <option value="2 Years">2 Year</option>
              </select>
            </div>

            {role !== 'SUB_DEALER' && (
              <div className="form-group">
                <label>Bill Amount</label>
                <input
                  type="number"
                  name="billAmount"
                  value={formData.billAmount}
                  onChange={(event) => updateFormField('billAmount', event.target.value)}
                  placeholder="Enter Bill Amount"
                />
              </div>
            )}

            <div className="form-group">
              <label>Activation Date</label>
              <input
                type="date"
                name="presentDate"
                value={formData.presentDate}
                onChange={(event) => updateFormField('presentDate', event.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Expiry Date</label>
              <input type="text" value={formatDate(expiryDate)} readOnly className="readonly-field" />
            </div>


          </div>

          <div className="form-actions">
            {editingDeviceId && (
              <button type="button" className="btn-reset" onClick={handleReset}>
                Cancel
              </button>
            )}
            <button type="submit" className="btn-save" disabled={submitting}>
              <FaSave /> {submitting ? 'Saving...' : editingDeviceId ? 'Update Device' : (role === 'DEALER' ? 'Assign Device' : 'Save Device')}
            </button>
            {(role === 'ADMIN' || role === 'DEALER') && (
              <button
                type="button"
                className="btn-bulk-upload"
                onClick={() => setBulkModalOpen(true)}
              >
                <FaCloudUploadAlt /> Bulk Upload
              </button>
            )}
          </div>
        </form>
      </div>
      )}

      <div className="add-device-card device-list-card">
        <div className="add-device-header">
          <FaFilter className="header-icon" />
          <span>DEVICE TABLE</span>
          <div className="table-header-search-wrap">
            <FaSearch className="search-box-icon" />
            <input
              type="text"
              placeholder="Search IMEI, ICCID, Serial..."
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              className="table-header-search-input"
            />
            {tableSearch && (
              <FaTimesCircle
                onClick={() => setTableSearch('')}
                className="search-box-clear-icon"
              />
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', padding: '16px 24px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--text-dark)' }}>Show:</label>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                style={{ padding: '6px 10px', fontSize: '12.5px', border: '1.5px solid var(--border-color)', borderRadius: '6px', background: '#ffffff', color: 'var(--text-dark)', outline: 'none', cursor: 'pointer' }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--text-dark)' }}>Activation Date:</label>
              <select 
                value={filterDateMode} 
                onChange={(e) => handleDateModeChange(e.target.value)}
                style={{ padding: '6px 10px', fontSize: '12.5px', border: '1.5px solid var(--border-color)', borderRadius: '6px', background: '#ffffff', color: 'var(--text-dark)', outline: 'none', cursor: 'pointer' }}
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="custom">Custom Range</option>
              </select>
              {filterDateMode === 'custom' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input 
                    type="date" 
                    value={filterFromDate} 
                    onChange={(e) => { setFilterFromDate(e.target.value); setPage(1); }}
                    style={{ padding: '5px 8px', fontSize: '12.5px', border: '1.5px solid var(--border-color)', borderRadius: '6px', outline: 'none' }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>to</span>
                  <input 
                    type="date" 
                    value={filterToDate} 
                    onChange={(e) => { setFilterToDate(e.target.value); setPage(1); }}
                    style={{ padding: '5px 8px', fontSize: '12.5px', border: '1.5px solid var(--border-color)', borderRadius: '6px', outline: 'none' }}
                  />
                </div>
              )}
            </div>

            <span style={{ padding: '4px 12px', background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)', color: '#ffffff', borderRadius: '20px', fontSize: '11px', fontWeight: '800', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
              {totalDevices} Devices
            </span>
          </div>
          <div className="device-table-meta" style={{ padding: 0 }}>
            <span>{devices.length} shown</span>
            <span>{totalDevices} total</span>
          </div>
        </div>

        <div className="add-device-table-wrap">
          <table className="add-device-table">
            <thead>
              <tr>
                <th>Dealer Name</th>
                <th>Sub Dealer Name</th>
                <th>IMEI</th>
                <th>ICCID</th>
                <th>Serial Number</th>
                <th>MSISDN 1</th>
                <th>MSISDN 2</th>
                <th>Validity</th>
                {role !== 'SUB_DEALER' && <th>Bill Amount</th>}
                {role !== 'SUB_DEALER' && <th>Top Up Amount</th>}
                <th>Activation Date</th>
                <th>Expiry Date</th>
                <th>Created By</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {devicesLoading ? (
                <tr>
                  <td colSpan={tableColSpan} className="table-empty">Loading devices...</td>
                </tr>
              ) : devices.length > 0 ? (
                devices.map((device) => (
                  <tr key={device._id}>
                    <td>{getLinkedName(device.dealerId, device.dealerName)}</td>
                    <td>{getLinkedName(device.subDealerId, device.subDealerName)}</td>
                    <td className="strong-cell">{device.imei}</td>
                    <td>{device.iccid || '-'}</td>
                    <td>{device.serialNo || '-'}</td>
                    <td>{device.msisdn1 || '-'}</td>
                    <td>{device.msisdn2 || '-'}</td>
                    <td>{device.validity || '-'}</td>
                    {role !== 'SUB_DEALER' && <td>₹{device.billAmount || 0}</td>}
                    {role !== 'SUB_DEALER' && <td>₹{device.renewalAmount || 0}</td>}
                    <td>{formatDate(device.presentDate)}</td>
                    <td>{formatDate(device.expiryDate)}</td>
                    <td>{getLinkedName(device.createdBy)}</td>
                    <td><span className={`device-status status-${String(device.status || 'active').toLowerCase()}`}>{device.status || 'Active'}</span></td>
                    <td>
                      <div className="action-buttons-cell">
                        <button
                          type="button"
                          className="btn-action-topup"
                          onClick={() => handleTopUpOpen(device)}
                          title="Top Up / Recharge"
                        >
                          <FaSync /> Top Up
                        </button>
                        {user?.role === 'partner' && (
                          <>
                            <button
                              type="button"
                              className="btn-action-edit"
                              onClick={() => handleEditStart(device)}
                              title="Edit Device"
                            >
                              <FaEdit /> Edit
                            </button>
                            <button
                              type="button"
                              className="btn-action-delete"
                              onClick={() => handleDeleteDevice(device._id, device.imei)}
                              title="Delete Device"
                            >
                              <FaTrash /> Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={tableColSpan} className="table-empty">No device records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Row */}
        <div className="table-pagination-row">
          <div className="pagination-info">
            Showing {totalDevices > 0 ? ((page - 1) * limit) + 1 : 0} to {Math.min(page * limit, totalDevices)} of {totalDevices} records
          </div>
          
          {totalPages > 1 && (
            <div className="pagination-controls">
              <button 
                type="button"
                disabled={page === 1} 
                onClick={() => setPage(page - 1)}
                className="btn-page-arrow"
              >
                &lt;
              </button>
              
              {getPageNumbers().map((p, idx) => (
                p === '...' ? (
                  <span key={`ell-${idx}`} className="pagination-ellipsis">
                    ...
                  </span>
                ) : (
                  <button 
                    type="button"
                    key={p}
                    onClick={() => setPage(p)}
                    className={`btn-page-number ${page === p ? 'active' : ''}`}
                  >
                    {p}
                  </button>
                )
              ))}
              
              <button 
                type="button"
                disabled={page === totalPages} 
                onClick={() => setPage(page + 1)}
                className="btn-page-arrow"
              >
                &gt;
              </button>
            </div>
          )}
        </div>
      </div>

      <BulkUploadDevices
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        onUploadSuccess={() => {
          setPage(1);
          fetchDevices(debouncedSearch, filterFromDate, filterToDate, 1, limit);
        }}
        dealers={dealers}
        subDealers={subDealers}
        role={role}
        user={user}
      />

      {/* Top Up Modal */}
      {topUpModalOpen && (
        <div className="topup-modal-backdrop" onClick={handleTopUpClose}>
          <div className="topup-modal" onClick={(e) => e.stopPropagation()}>
            <div className="topup-modal-header">
              <h4><FaSync style={{ marginRight: '8px' }} /> Top Up / Recharge Device</h4>
              <button className="topup-close-btn" onClick={handleTopUpClose}><FaTimes /></button>
            </div>
            <form onSubmit={handleTopUpSubmit}>
              <div className="topup-modal-body">
                <div className="topup-device-info">
                  <span><strong>IMEI:</strong> {topUpDevice?.imei}</span>
                  <span><strong>Model:</strong> {topUpDevice?.vendor || '-'}</span>
                </div>

                <div className="topup-form-group" style={{ marginTop: '10px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '8px' }}>Top Up Amount (₹) *</label>
                  <input
                    type="number"
                    value={topUpForm.topUpAmount || ''}
                    onChange={(e) => setTopUpForm({ topUpAmount: e.target.value })}
                    placeholder="Enter Top Up Amount"
                    required
                    min="1"
                    style={{
                      padding: '12px',
                      fontSize: '14.5px',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '8px',
                      outline: 'none',
                      transition: 'border-color 0.15s',
                    }}
                  />
                </div>
              </div>
              <div className="topup-modal-footer">
                <button type="button" className="topup-btn-cancel" onClick={handleTopUpClose}>Cancel</button>
                <button type="submit" className="topup-btn-submit" disabled={topUpSubmitting}>
                  <FaSync /> {topUpSubmitting ? 'Submitting...' : 'Submit Top Up'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddDevice;
