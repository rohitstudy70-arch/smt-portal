import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FaCheckCircle,
  FaChevronDown,
  FaFilter,
  FaMobileAlt,
  FaRedo,
  FaSave,
  FaSearch,
  FaTimesCircle,
  FaEdit,
} from 'react-icons/fa';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import './AddDevice.css';

const getRole = (user) => {
  if (user?.role === 'partner') return 'ADMIN';
  if (user?.userType === 'Administration') return 'ADMIN';
  if (user?.userType === 'Sub Dealer') return 'SUB_DEALER';
  if (user?.userType === 'End Customer') return 'CUSTOMER';
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

const createEmptyForm = (dealer) => ({
  dealerId: dealer?._id || '',
  dealerName: dealer ? getName(dealer) : '',
  subDealerId: '',
  subDealerName: '',
  vendor: 'iTriangle',
  imei: '',
  iccid: '',
  serialNo: '',
  msisdn1: '',
  msisdn2: '',
  itrNo: '',

  billAmount: '',
  validity: '1 Year',
  status: 'Active',
});

const AddDevice = () => {
  const { user } = useAuth();
  const role = getRole(user);
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

  const selectedDealer = useMemo(
    () => dealers.find((dealer) => dealer._id === formData.dealerId),
    [dealers, formData.dealerId]
  );

  const availableSubDealers = useMemo(() => {
    if (!formData.dealerId) return [];
    
    const selectedDealerObj = dealers.find((d) => d._id === formData.dealerId);
    const isSelectedDealerAdmin = selectedDealerObj?.role === 'partner' || selectedDealerObj?.userType === '';

    return subDealers.filter((sd) => {
      if (isSelectedDealerAdmin) {
        const parentUser = dealers.find((d) => d._id === sd.parentId) || 
                           subDealers.find((s) => s._id === sd.parentId);
        return !sd.parentId || parentUser?.role === 'partner' || parentUser?.userType === '';
      } else {
        return sd.parentId === formData.dealerId;
      }
    });
  }, [subDealers, dealers, formData.dealerId]);

  const filteredSubDealers = useMemo(() => {
    return availableSubDealers.filter((subDealer) =>
      getName(subDealer).toLowerCase().includes(subDealerSearch.toLowerCase())
    );
  }, [availableSubDealers, subDealerSearch]);

  const presentDate = useMemo(() => new Date(), []);
  const expiryDate = useMemo(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() + (formData.validity === '2 Years' ? 2 : 1));
    return date;
  }, [formData.validity]);

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    window.setTimeout(() => setToast({ show: false, type: '', message: '' }), 4000);
  };

  const fetchDevices = useCallback(async () => {
    try {
      setDevicesLoading(true);
      const response = await api.get('/devices', {
        params: {
          limit: 100,
          page: 1,
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
          setFormData(createEmptyForm(dealerList[0]));
        }
      } catch (error) {
        showToast('error', error.response?.data?.message || 'Failed to load users.');
      }
    };

    if (role !== 'CUSTOMER') {
      fetchAllUsersAndPopulate();
      fetchDevices();
    }
  }, [role, user, fetchDevices]);

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
      await fetchDevices();
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

  const handleReset = () => {
    const defaultDealer = dealers.length === 1 ? dealers[0] : dealers.find((d) => d._id === formData.dealerId);
    setFormData(createEmptyForm(defaultDealer || selectedDealer));
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
    });
    setDealerSearch(getLinkedName(device.dealerId, device.dealerName));
    setSubDealerSearch(getLinkedName(device.subDealerId, device.subDealerName));
    setErrors({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (role === 'CUSTOMER') {
    return (
      <div className="add-device-container">
        <div className="add-device-card device-list-card">
          <div className="add-device-header">
            <FaFilter className="header-icon" />
            <span>DEVICE TABLE</span>
          </div>
          <div className="add-device-denied">Forbidden: You do not have permission to view devices.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="add-device-container">
      {toast.show && (
        <div className={`toast-notification ${toast.type}`}>
          {toast.type === 'success' ? <FaCheckCircle /> : <FaTimesCircle />}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="add-device-card">
        <div className="add-device-header">
          <FaMobileAlt className="header-icon" />
          <span>{editingDeviceId ? 'EDIT DEVICE' : 'ADD NEW DEVICE'}</span>
        </div>

        <form className="add-device-form" onSubmit={handleSubmit}>
          <div className="form-grid">
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

            <div className="form-group">
              <label>Vendor Name</label>
              <select name="vendor" value={formData.vendor} onChange={(event) => updateFormField('vendor', event.target.value)}>
                <option value="iTriangle">iTriangle</option>
                <option value="Acute">Acute</option>
                <option value="Markon">Markon</option>
                <option value="RDM">RDM</option>
                <option value="BB">BB</option>
                <option value="TrackNow">TrackNow</option>
                <option value="Road point">Road point</option>
              </select>
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
              <label>Serial No. <span className="required">*</span></label>
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
              <label>ICCID No. <span className="required">*</span></label>
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

            <div className="form-group">
              <label>Present Date</label>
              <input type="text" value={formatDate(presentDate)} readOnly className="readonly-field" />
            </div>

            <div className="form-group">
              <label>Expiry Date</label>
              <input type="text" value={formatDate(expiryDate)} readOnly className="readonly-field" />
            </div>

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


          </div>

          <div className="form-actions">
            {editingDeviceId && (
              <button type="button" className="btn-reset" onClick={handleReset}>
                Cancel
              </button>
            )}
            <button type="submit" className="btn-save" disabled={submitting}>
              <FaSave /> {submitting ? 'Saving...' : editingDeviceId ? 'Update Device' : 'Save Device'}
            </button>
          </div>
        </form>
      </div>

      <div className="add-device-card device-list-card">
        <div className="add-device-header">
          <FaFilter className="header-icon" />
          <span>DEVICE TABLE</span>
        </div>

        <div className="device-table-meta">
          <span>{devices.length} shown</span>
          <span>{totalDevices} total</span>
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
                <th>Bill Amount</th>
                <th>Present Date</th>
                <th>Expiry Date</th>
                <th>Created By</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {devicesLoading ? (
                <tr>
                  <td colSpan={14} className="table-empty">Loading devices...</td>
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
                    <td>₹{device.billAmount || 0}</td>
                    <td>{formatDate(device.presentDate)}</td>
                    <td>{formatDate(device.expiryDate)}</td>
                    <td>{getLinkedName(device.createdBy)}</td>
                    <td><span className={`device-status status-${String(device.status || 'active').toLowerCase()}`}>{device.status || 'Active'}</span></td>
                    <td>
                      <button
                        type="button"
                        className="btn-action-edit"
                        onClick={() => handleEditStart(device)}
                        title="Edit Device"
                      >
                        <FaEdit /> Edit
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={14} className="table-empty">No device records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AddDevice;
