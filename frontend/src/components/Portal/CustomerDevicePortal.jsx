import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  FaAddressCard,
  FaCalendarAlt,
  FaCheck,
  FaCloudUploadAlt,
  FaDownload,
  FaEdit,
  FaExchangeAlt,
  FaFileAlt,
  FaHistory,
  FaKey,
  FaMobileAlt,
  FaPlus,
  FaRedo,
  FaSave,
  FaSearch,
  FaSimCard,
  FaTimes,
  FaUserShield,
  FaUsers,
  FaUserTie,
} from 'react-icons/fa';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import './CustomerDevicePortal.css';

const emptyUserForm = {
  userType: 'End Customer',
  displayName: '',
  companyName: '',
  contactPerson: '',
  mobileNo: '',
  email: '',
  username: '',
  password: '',
  parentId: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
};

const emptyDeviceForm = {
  dealerId: '',
  dealerName: '',
  subDealerId: '',
  subDealerName: '',
  imei: '',
  iccid: '',
  serialNo: '',
  msisdn1: '',
  msisdn2: '',
  validity: '1 Year',
  status: 'Active',
};

const viewTitles = {
  dashboard: 'Dashboard',
  dealers: 'Dealer Management',
  subdealers: 'Sub Dealer Management',
  users: 'User Management',
  devices: 'Device Management',
  customers: 'Customer Database',
  reports: 'Reports',
  profile: 'My Profile',
  mydevices: 'My Devices',
  renewals: 'Renewal Requests',
};

const statCatalog = {
  totalDealers: { label: 'Total Dealers', icon: FaUserTie, tone: 'blue' },
  totalSubDealers: { label: 'Total Sub Dealers', icon: FaUsers, tone: 'green' },
  totalCustomers: { label: 'Total Customers', icon: FaAddressCard, tone: 'violet' },
  totalDevices: { label: 'Total Devices', icon: FaMobileAlt, tone: 'slate' },
  activeDevices: { label: 'Active Devices', icon: FaCheck, tone: 'green' },
  expiredDevices: { label: 'Expired Devices', icon: FaTimes, tone: 'red' },
  devicesAddedToday: { label: 'Devices Added Today', icon: FaPlus, tone: 'amber' },
  renewalDueDevices: { label: 'Renewal Due Devices', icon: FaCalendarAlt, tone: 'red' },
  assignedDevices: { label: 'Assigned Devices', icon: FaExchangeAlt, tone: 'blue' },
  availableDevices: { label: 'Available Devices', icon: FaSimCard, tone: 'amber' },
  activeCustomers: { label: 'Active Customers', icon: FaUsers, tone: 'green' },
  pendingRenewals: { label: 'Pending Renewals', icon: FaRedo, tone: 'violet' },
};

const statKeysByRole = {
  ADMIN: [
    'totalDealers',
    'totalSubDealers',
    'totalCustomers',
    'totalDevices',
    'activeDevices',
    'expiredDevices',
    'devicesAddedToday',
    'renewalDueDevices',
  ],
  DEALER: [
    'assignedDevices',
    'activeCustomers',
    'totalSubDealers',
    'renewalDueDevices',
    'availableDevices',
    'totalDevices',
  ],
  SUB_DEALER: [
    'totalCustomers',
    'availableDevices',
    'renewalDueDevices',
    'assignedDevices',
  ],
  CUSTOMER: [
    'totalDevices',
    'activeDevices',
    'renewalDueDevices',
    'pendingRenewals',
  ],
};

const getName = (item) => (
  item?.displayName
  || item?.companyName
  || item?.customerName
  || item?.username
  || 'N/A'
);

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

const getExpiryDate = (validity) => {
  const date = new Date();
  date.setFullYear(date.getFullYear() + (validity === '2 Years' ? 2 : 1));
  return date;
};

const parseBulkDevices = (rawText) => {
  const rows = rawText
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean);

  if (rows.length === 0) return [];

  const firstCells = rows[0].split(',').map((cell) => cell.trim());
  const hasHeader = firstCells.some((cell) => /imei|iccid|serial/i.test(cell));
  const headers = hasHeader
    ? firstCells.map((cell) => cell.trim())
    : ['imei', 'iccid', 'serialNo', 'msisdn1', 'msisdn2', 'dealerName', 'validity', 'status'];

  return rows.slice(hasHeader ? 1 : 0).map((row) => {
    const cells = row.split(',').map((cell) => cell.trim());
    return headers.reduce((record, header, index) => {
      record[header] = cells[index] || '';
      return record;
    }, {});
  });
};

const CustomerDevicePortal = () => {
  const { user, updateProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const activeView = params.get('view') || 'dashboard';
  const initialSearch = params.get('search') || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [summary, setSummary] = useState(null);
  const [dealers, setDealers] = useState([]);
  const [deviceDealerOptions, setDeviceDealerOptions] = useState([]);
  const [subDealers, setSubDealers] = useState([]);
  const [users, setUsers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [devices, setDevices] = useState([]);
  const [renewals, setRenewals] = useState([]);
  const [reports, setReports] = useState(null);
  const [loginLogs, setLoginLogs] = useState([]);
  const [search, setSearch] = useState(initialSearch);
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [editUser, setEditUser] = useState(null);
  const [deviceForm, setDeviceForm] = useState(emptyDeviceForm);
  const [bulkText, setBulkText] = useState('');
  const [transferForm, setTransferForm] = useState({ deviceId: '', targetUserId: '', note: '' });
  const [renewalForm, setRenewalForm] = useState({ deviceId: '', imei: '', customerId: '', validity: '1 Year', remarks: '' });
  const [resetForm, setResetForm] = useState({ userId: '', password: '' });
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const userRole = user?.role === 'partner' ? 'ADMIN' : user?.userType === 'Sub Dealer' ? 'SUB_DEALER' : user?.userType === 'End Customer' ? 'CUSTOMER' : 'DEALER';
  const role = summary?.role || userRole;
  const isAdmin = role === 'ADMIN';
  const isCustomer = role === 'CUSTOMER';
  const assignableUsers = useMemo(() => (
    [...dealers, ...subDealers, ...users].filter((item, index, list) => (
      item?._id && list.findIndex((other) => other._id === item._id) === index
    ))
  ), [dealers, subDealers, users]);

  const availableSubDealers = useMemo(() => {
    if (!deviceForm.dealerId) return [];

    const selectedDealerObj = deviceDealerOptions.find((d) => d._id === deviceForm.dealerId);
    const isSelectedDealerAdmin = selectedDealerObj?.role === 'partner' || selectedDealerObj?.userType === '';

    return subDealers.filter((sd) => {
      if (isSelectedDealerAdmin) {
        const parentUser = deviceDealerOptions.find((d) => d._id === sd.parentId) || 
                           subDealers.find((s) => s._id === sd.parentId);
        return !sd.parentId || parentUser?.role === 'partner' || parentUser?.userType === '';
      } else {
        return sd.parentId === deviceForm.dealerId;
      }
    });
  }, [subDealers, deviceDealerOptions, deviceForm.dealerId]);

  const selectedDevice = useMemo(() => (
    devices.find((device) => device._id === transferForm.deviceId)
  ), [devices, transferForm.deviceId]);

  const filteredDevices = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return devices;
    return devices.filter((device) => (
      device.imei?.toLowerCase().includes(query)
      || device.iccid?.toLowerCase().includes(query)
      || device.serialNo?.toLowerCase().includes(query)
      || device.msisdn1?.toLowerCase().includes(query)
      || device.msisdn2?.toLowerCase().includes(query)
      || device.dealerName?.toLowerCase().includes(query)
      || device.subDealerName?.toLowerCase().includes(query)
      || device.status?.toLowerCase().includes(query)
      || getName(device.assignedTo).toLowerCase().includes(query)
      || getLinkedName(device.createdBy).toLowerCase().includes(query)
    ));
  }, [devices, search]);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter((customer) => (
      customer.customerName?.toLowerCase().includes(query)
      || customer.mobileNo?.toLowerCase().includes(query)
      || customer.email?.toLowerCase().includes(query)
      || customer.imei?.toLowerCase().includes(query)
      || customer.iccid?.toLowerCase().includes(query)
      || customer.vehicleNo?.toLowerCase().includes(query)
    ));
  }, [customers, search]);

  const showNotice = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3500);
  };

  const loadPortalData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const canManageUsers = userRole !== 'CUSTOMER';
      const [
        summaryRes,
        dealersRes,
        subDealersRes,
        usersRes,
        customersRes,
        devicesRes,
        renewalsRes,
        reportsRes,
        loginLogsRes,
        deviceDealersRes,
      ] = await Promise.all([
        api.get('/portal/summary'),
        canManageUsers ? api.get('/portal/users', { params: { type: 'dealer' } }) : Promise.resolve({ data: [] }),
        canManageUsers ? api.get('/portal/users', { params: { type: 'subDealer' } }) : Promise.resolve({ data: [] }),
        canManageUsers ? api.get('/portal/users', { params: { type: 'all' } }) : Promise.resolve({ data: [] }),
        api.get('/portal/customers'),
        api.get('/portal/devices', { params: { limit: 250 } }),
        api.get('/portal/renewals'),
        api.get('/portal/reports'),
        canManageUsers ? api.get('/portal/login-logs').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        canManageUsers ? api.get('/users/dealers').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      ]);

      setSummary(summaryRes.data);
      setDealers(dealersRes.data || []);
      setUsers(usersRes.data || []);
      setCustomers(customersRes.data || []);
      setDevices(devicesRes.data?.devices || []);
      setRenewals(renewalsRes.data || []);
      setReports(reportsRes.data || null);
      setLoginLogs(loginLogsRes.data || []);

      const allUsers = usersRes.data || [];
      
      // Identify dealers
      let dealerList = [];
      if (userRole === 'ADMIN') {
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
      setDeviceDealerOptions(dealerList);

      // Identify sub-dealers
      const subDealerList = allUsers.filter((item) => item.userType === 'Sub Dealer');
      setSubDealers(subDealerList);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load portal data.');
    } finally {
      setLoading(false);
    }
  }, [userRole]);

  useEffect(() => {
    loadPortalData();
  }, [loadPortalData]);

  useEffect(() => {
    setSearch(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    if (!deviceForm.dealerId && deviceDealerOptions.length === 1) {
      const dealer = deviceDealerOptions[0];
      setDeviceForm((current) => ({
        ...current,
        dealerId: dealer._id,
        dealerName: getName(dealer),
      }));
    }
  }, [deviceDealerOptions, deviceForm.dealerId]);

  const openView = (view) => {
    navigate(`/dashboard?view=${view}`);
  };

  const updateUserForm = (field, value) => {
    setUserForm((current) => ({ ...current, [field]: value }));
  };

  const updateDeviceForm = (field, value) => {
    setDeviceForm((current) => ({ ...current, [field]: value }));
  };

  const submitUser = async (event, forcedUserType) => {
    event.preventDefault();
    const payload = {
      ...userForm,
      userType: forcedUserType || userForm.userType,
    };

    await api.post('/portal/users', payload);
    setUserForm(emptyUserForm);
    showNotice(`${payload.userType} added successfully.`);
    await loadPortalData();
  };

  const saveUserEdit = async (event) => {
    event.preventDefault();
    if (!editUser?._id) return;
    const payload = {
      userType: editUser.userType,
      displayName: editUser.displayName,
      companyName: editUser.companyName,
      contactPerson: editUser.contactPerson,
      mobileNo: editUser.mobileNo,
      email: editUser.email,
      address: editUser.address,
      city: editUser.city,
      state: editUser.state,
      pincode: editUser.pincode,
      status: editUser.status,
    };

    const response = await api.put(`/portal/users/${editUser._id}`, payload);
    if (editUser._id === user?._id) {
      updateProfile({ ...user, ...response.data });
    }
    setEditUser(null);
    showNotice('Record updated successfully.');
    await loadPortalData();
  };

  const setUserStatus = async (targetUser, nextStatus) => {
    await api.put(`/portal/users/${targetUser._id}`, { status: nextStatus });
    showNotice(`${getName(targetUser)} marked ${nextStatus}.`);
    await loadPortalData();
  };

  const resetPassword = async (event) => {
    event.preventDefault();
    if (!resetForm.userId || !resetForm.password) return;
    await api.post(`/portal/users/${resetForm.userId}/reset-password`, { password: resetForm.password });
    setResetForm({ userId: '', password: '' });
    showNotice('Password reset successfully.');
  };

  const addDevice = async (event) => {
    event.preventDefault();
    await api.post('/devices', deviceForm);
    setDeviceForm(emptyDeviceForm);
    showNotice('Device added successfully.');
    await loadPortalData();
  };

  const bulkUploadDevices = async (event) => {
    event.preventDefault();
    const parsedDevices = parseBulkDevices(bulkText);
    if (parsedDevices.length === 0) {
      showNotice('No device records found.');
      return;
    }

    const response = await api.post('/portal/devices/bulk', { devices: parsedDevices });
    setBulkText('');
    showNotice(response.data?.message || 'Bulk upload completed.');
    await loadPortalData();
  };

  const transferDevice = async (event) => {
    event.preventDefault();
    if (!transferForm.deviceId) return;
    await api.post(`/portal/devices/${transferForm.deviceId}/transfer`, {
      targetUserId: transferForm.targetUserId || null,
      note: transferForm.note,
    });
    setTransferForm({ deviceId: '', targetUserId: '', note: '' });
    showNotice('Device assignment updated.');
    await loadPortalData();
  };

  const createRenewal = async (event) => {
    event.preventDefault();
    const device = devices.find((item) => item._id === renewalForm.deviceId);
    await api.post('/portal/renewals', {
      ...renewalForm,
      imei: renewalForm.imei || device?.imei,
    });
    setRenewalForm({ deviceId: '', imei: '', customerId: '', validity: '1 Year', remarks: '' });
    showNotice('Renewal request created.');
    await loadPortalData();
  };

  const downloadDeviceReport = () => {
    const headers = ['Device ID', 'Dealer', 'Sub Dealer', 'IMEI', 'ICCID', 'Serial No', 'MSISDN 1', 'MSISDN 2', 'Validity', 'Present Date', 'Expiry Date', 'Created By', 'Status'];
    const rows = filteredDevices.map((device) => [
      device._id || '',
      device.dealerName || '',
      device.subDealerName || '',
      device.imei || '',
      device.iccid || '',
      device.serialNo || '',
      device.msisdn1 || '',
      device.msisdn2 || '',
      device.validity || '',
      formatDate(device.presentDate),
      formatDate(device.expiryDate),
      getLinkedName(device.createdBy, ''),
      device.status || '',
    ]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'device-report.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderStatus = (status) => (
    <span className={`portal-status status-${String(status || 'active').toLowerCase().replace(/\s+/g, '-')}`}>
      {status || 'Active'}
    </span>
  );

  const renderStats = () => {
    const keys = statKeysByRole[role] || statKeysByRole.DEALER;
    return (
      <div className="portal-stats-grid">
        {keys.map((key) => {
          const item = statCatalog[key];
          const Icon = item.icon;
          return (
            <div className={`portal-stat stat-${item.tone}`} key={key}>
              <div>
                <span className="portal-stat-value">{summary?.[key] ?? 0}</span>
                <span className="portal-stat-label">{item.label}</span>
              </div>
              <Icon className="portal-stat-icon" />
            </div>
          );
        })}
      </div>
    );
  };

  const renderDashboard = () => (
    <div className="portal-stack">
      {renderStats()}

      {!isCustomer && (
        <div className="portal-dashboard-actions">
          <Link className="portal-dashboard-card" to="/add-device">
            <FaPlus className="portal-dashboard-card-icon" />
            <strong>Add Device</strong>
            <span>IMEI / ICCID / Serial No</span>
          </Link>
        </div>
      )}

      <div className="portal-split">
        <section className="portal-panel">
          <div className="portal-panel-header">
            <div>
              <h2>{role === 'CUSTOMER' ? 'My Device Status' : 'Renewal Due Devices'}</h2>
              <span>Role: {role.replace('_', ' ')}</span>
            </div>
            <button className="portal-icon-button" type="button" onClick={() => openView('devices')} title="Open devices">
              <FaMobileAlt />
            </button>
          </div>
          <div className="portal-table-wrap">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>IMEI</th>
                  <th>ICCID</th>
                  <th>Assigned To</th>
                  <th>Expiry Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {devices.slice(0, 8).map((device) => (
                  <tr key={device._id}>
                    <td className="strong">{device.imei}</td>
                    <td>{device.iccid || '-'}</td>
                    <td>{getName(device.assignedTo)}</td>
                    <td>{formatDate(device.expiryDate)}</td>
                    <td>{renderStatus(device.status)}</td>
                  </tr>
                ))}
                {devices.length === 0 && (
                  <tr>
                    <td colSpan={5} className="portal-empty">No devices found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="portal-panel">
          <div className="portal-panel-header">
            <div>
              <h2>Hierarchy</h2>
              <span>Admin - Dealer - Sub Dealer - End User</span>
            </div>
            <FaUserShield className="portal-panel-icon" />
          </div>
          <div className="portal-hierarchy">
            {['ADMIN', 'DEALER', 'SUB DEALER', 'END USER'].map((item, index) => (
              <div className={`hierarchy-step ${role.replace('_', ' ') === item ? 'current' : ''}`} key={item}>
                <span>{index + 1}</span>
                <strong>{item}</strong>
              </div>
            ))}
          </div>
          <div className="portal-quick-actions">
            {!isCustomer && (
              <>
                <button type="button" onClick={() => openView(role === 'ADMIN' ? 'dealers' : 'subdealers')}>
                  <FaPlus /> Add Channel User
                </button>
                <button type="button" onClick={() => openView('customers')}>
                  <FaSearch /> Search Customer
                </button>
              </>
            )}
            <button type="button" onClick={() => openView('renewals')}>
              <FaRedo /> Renewal Requests
            </button>
          </div>
        </section>
      </div>
    </div>
  );

  const renderUserForm = (forcedUserType) => (
    <form className="portal-form" onSubmit={(event) => submitUser(event, forcedUserType)}>
      <div className="portal-form-grid">
        <label>
          <span>Role</span>
          <select value={forcedUserType || userForm.userType} onChange={(event) => updateUserForm('userType', event.target.value)} disabled={Boolean(forcedUserType)}>
            <option value="Dealer">Dealer</option>
            <option value="Sub Dealer">Sub Dealer</option>
            <option value="End Customer">End User Customer</option>
          </select>
        </label>
        {(forcedUserType === 'Sub Dealer' || userForm.userType === 'Sub Dealer' || forcedUserType === 'End Customer' || userForm.userType === 'End Customer') && isAdmin && (
          <label>
            <span>Dealer / Parent</span>
            <select value={userForm.parentId} onChange={(event) => updateUserForm('parentId', event.target.value)}>
              <option value="">Current User</option>
              {[...dealers, ...subDealers].map((item) => (
                <option value={item._id} key={item._id}>{getName(item)}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span>Name</span>
          <input value={userForm.displayName} onChange={(event) => updateUserForm('displayName', event.target.value)} required />
        </label>
        <label>
          <span>Company</span>
          <input value={userForm.companyName} onChange={(event) => updateUserForm('companyName', event.target.value)} />
        </label>
        <label>
          <span>Contact Person</span>
          <input value={userForm.contactPerson} onChange={(event) => updateUserForm('contactPerson', event.target.value)} />
        </label>
        <label>
          <span>Mobile No</span>
          <input value={userForm.mobileNo} onChange={(event) => updateUserForm('mobileNo', event.target.value)} />
        </label>
        <label>
          <span>Email</span>
          <input type="email" value={userForm.email} onChange={(event) => updateUserForm('email', event.target.value)} />
        </label>
        <label>
          <span>Username</span>
          <input value={userForm.username} onChange={(event) => updateUserForm('username', event.target.value)} required />
        </label>
        <label>
          <span>Password</span>
          <input type="password" value={userForm.password} onChange={(event) => updateUserForm('password', event.target.value)} required />
        </label>
        <label className="span-2">
          <span>Address</span>
          <input value={userForm.address} onChange={(event) => updateUserForm('address', event.target.value)} />
        </label>
        <label>
          <span>City</span>
          <input value={userForm.city} onChange={(event) => updateUserForm('city', event.target.value)} />
        </label>
        <label>
          <span>State</span>
          <input value={userForm.state} onChange={(event) => updateUserForm('state', event.target.value)} />
        </label>
        <label>
          <span>Pincode</span>
          <input value={userForm.pincode} onChange={(event) => updateUserForm('pincode', event.target.value)} />
        </label>
      </div>
      <div className="portal-actions">
        <button className="portal-primary" type="submit"><FaSave /> Save</button>
        <button type="button" onClick={() => setUserForm(emptyUserForm)}><FaRedo /> Reset</button>
      </div>
    </form>
  );

  const renderUserTable = (records, title, showDealerActions = false) => (
    <section className="portal-panel">
      <div className="portal-panel-header">
        <div>
          <h2>{title}</h2>
          <span>{records.length} records</span>
        </div>
        <FaUsers className="portal-panel-icon" />
      </div>
      <div className="portal-table-wrap">
        <table className="portal-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Mobile</th>
              <th>Email</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record._id}>
                <td className="strong">{getName(record)}</td>
                <td>{record.userType || 'Dealer'}</td>
                <td>{record.mobileNo || '-'}</td>
                <td>{record.email || '-'}</td>
                <td>{renderStatus(record.status)}</td>
                <td>
                  <div className="portal-row-actions">
                    <button type="button" title="Edit" onClick={() => setEditUser(record)}><FaEdit /></button>
                    {record.status === 'Inactive' ? (
                      <button type="button" title="Activate" onClick={() => setUserStatus(record, 'Active')}><FaCheck /></button>
                    ) : (
                      <button type="button" title={showDealerActions ? 'Suspend' : 'Deactivate'} onClick={() => setUserStatus(record, 'Inactive')}><FaTimes /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={6} className="portal-empty">No records found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderDealerManagement = (subDealerMode = false) => {
    const targetType = subDealerMode ? 'Sub Dealer' : 'Dealer';
    const list = subDealerMode ? subDealers : dealers;

    return (
      <div className="portal-stack">
        <section className="portal-panel">
          <div className="portal-panel-header">
            <div>
              <h2>Add {targetType}</h2>
              <span>{targetType} profile and login details</span>
            </div>
            <FaUserTie className="portal-panel-icon" />
          </div>
          {renderUserForm(targetType)}
        </section>
        {renderUserTable(list, `${targetType} List`, !subDealerMode)}
      </div>
    );
  };

  const renderUserManagement = () => (
    <div className="portal-stack">
      <section className="portal-panel">
        <div className="portal-panel-header">
          <div>
            <h2>Add User</h2>
            <span>Role Management</span>
          </div>
          <FaUserShield className="portal-panel-icon" />
        </div>
        {renderUserForm()}
      </section>

      {renderUserTable(users, 'User List')}

      <div className="portal-split">
        <section className="portal-panel">
          <div className="portal-panel-header">
            <div>
              <h2>Reset Password</h2>
              <span>{users.length} users available</span>
            </div>
            <FaKey className="portal-panel-icon" />
          </div>
          <form className="portal-form" onSubmit={resetPassword}>
            <div className="portal-form-grid compact">
              <label>
                <span>User</span>
                <select value={resetForm.userId} onChange={(event) => setResetForm((current) => ({ ...current, userId: event.target.value }))} required>
                  <option value="">Select user</option>
                  {users.map((item) => (
                    <option value={item._id} key={item._id}>{getName(item)}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>New Password</span>
                <input type="password" value={resetForm.password} onChange={(event) => setResetForm((current) => ({ ...current, password: event.target.value }))} required />
              </label>
            </div>
            <div className="portal-actions">
              <button className="portal-primary" type="submit"><FaKey /> Reset</button>
            </div>
          </form>
        </section>

        <section className="portal-panel">
          <div className="portal-panel-header">
            <div>
              <h2>Login Logs</h2>
              <span>{loginLogs.length} recent entries</span>
            </div>
            <FaHistory className="portal-panel-icon" />
          </div>
          <div className="portal-table-wrap small-table">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Action</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {loginLogs.slice(0, 8).map((log) => (
                  <tr key={log._id}>
                    <td>{getName(log.userId) || log.details?.username || '-'}</td>
                    <td>{log.action}</td>
                    <td>{formatDate(log.timestamp)}</td>
                  </tr>
                ))}
                {loginLogs.length === 0 && (
                  <tr>
                    <td colSpan={3} className="portal-empty">No login logs found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );

  const renderDeviceForm = () => {
    const presentDate = new Date();
    const expiryDate = getExpiryDate(deviceForm.validity);

    return (
      <form className="portal-form" onSubmit={addDevice}>
        <div className="portal-form-grid device-grid">
          <label>
            <span>Dealer Name</span>
            <select
              value={deviceForm.dealerId}
              onChange={(event) => {
                const dealer = deviceDealerOptions.find((item) => item._id === event.target.value);
                setDeviceForm((current) => ({
                  ...current,
                  dealerId: dealer?._id || '',
                  dealerName: dealer ? getName(dealer) : '',
                  subDealerId: '',
                  subDealerName: '',
                }));
              }}
              required
            >
              <option value="">Select dealer</option>
              {deviceDealerOptions.map((dealer) => (
                <option value={dealer._id} key={dealer._id}>{getName(dealer)}</option>
              ))}
            </select>
          </label>
          {(role === 'ADMIN' || role === 'DEALER') && (
            <label>
              <span>Sub Dealer Name</span>
              <select
                value={deviceForm.subDealerId}
                onChange={(event) => {
                  const subDealer = subDealers.find((item) => item._id === event.target.value);
                  setDeviceForm((current) => ({
                    ...current,
                    subDealerId: subDealer?._id || '',
                    subDealerName: subDealer ? getName(subDealer) : '',
                  }));
                }}
                disabled={!deviceForm.dealerId || availableSubDealers.length === 0}
              >
                <option value="">
                  {!deviceForm.dealerId
                    ? 'Select dealer first'
                    : availableSubDealers.length === 0
                    ? 'No sub dealers found'
                    : 'Select sub dealer (optional)'}
                </option>
                {availableSubDealers.map((subDealer) => (
                  <option value={subDealer._id} key={subDealer._id}>{getName(subDealer)}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span>IMEI No.</span>
            <input value={deviceForm.imei} onChange={(event) => updateDeviceForm('imei', event.target.value)} maxLength={15} required />
          </label>
          <label>
            <span>ICCID No.</span>
            <input value={deviceForm.iccid} onChange={(event) => updateDeviceForm('iccid', event.target.value)} required />
          </label>
          <label>
            <span>Serial No.</span>
            <input value={deviceForm.serialNo} onChange={(event) => updateDeviceForm('serialNo', event.target.value)} required />
          </label>
          <label>
            <span>MSISDN 1</span>
            <input value={deviceForm.msisdn1} onChange={(event) => updateDeviceForm('msisdn1', event.target.value)} />
          </label>
          <label>
            <span>MSISDN 2</span>
            <input value={deviceForm.msisdn2} onChange={(event) => updateDeviceForm('msisdn2', event.target.value)} />
          </label>
          <label>
            <span>Validity</span>
            <select value={deviceForm.validity} onChange={(event) => updateDeviceForm('validity', event.target.value)}>
              <option value="1 Year">1 Year</option>
              <option value="2 Years">2 Years</option>
            </select>
          </label>
          <label>
            <span>Present Date</span>
            <input value={formatDate(presentDate)} readOnly />
          </label>
          <label>
            <span>Expiry Date</span>
            <input value={formatDate(expiryDate)} readOnly />
          </label>
          <label>
            <span>Status</span>
            <select value={deviceForm.status} onChange={(event) => updateDeviceForm('status', event.target.value)}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </label>
        </div>
        <div className="portal-actions">
          <button className="portal-primary" type="submit"><FaSave /> Save Device</button>
          <button type="button" onClick={() => setDeviceForm(emptyDeviceForm)}><FaRedo /> Reset</button>
        </div>
      </form>
    );
  };

  const renderDevicesTable = (records = filteredDevices, title = 'Device List') => (
    <section className="portal-panel">
      <div className="portal-panel-header">
        <div>
          <h2>{title}</h2>
          <span>{records.length} records</span>
        </div>
        <div className="portal-header-actions">
          <div className="portal-search">
            <FaSearch />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search device" />
          </div>
          <button className="portal-icon-button" type="button" onClick={downloadDeviceReport} title="Download report">
            <FaDownload />
          </button>
        </div>
      </div>
      <div className="portal-table-wrap">
        <table className="portal-table wide">
          <thead>
            <tr>
              <th>Dealer Name</th>
              <th>Sub Dealer Name</th>
              <th>IMEI</th>
              <th>ICCID</th>
              <th>Serial No</th>
              <th>MSISDN 1</th>
              <th>MSISDN 2</th>
              <th>Validity</th>
              <th>Present Date</th>
              <th>Expiry Date</th>
              <th>Created By</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {records.map((device) => (
              <tr key={device._id}>
                <td>{getLinkedName(device.dealerId, device.dealerName)}</td>
                <td>{getLinkedName(device.subDealerId, device.subDealerName)}</td>
                <td className="strong">{device.imei}</td>
                <td>{device.iccid || '-'}</td>
                <td>{device.serialNo || '-'}</td>
                <td>{device.msisdn1 || '-'}</td>
                <td>{device.msisdn2 || '-'}</td>
                <td>{device.validity || '-'}</td>
                <td>{formatDate(device.presentDate)}</td>
                <td>{formatDate(device.expiryDate)}</td>
                <td>{getLinkedName(device.createdBy)}</td>
                <td>{renderStatus(device.status)}</td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={12} className="portal-empty">No device records found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderDeviceManagement = () => (
    <div className="portal-stack">
      {!isCustomer && (
        <section className="portal-panel">
          <div className="portal-panel-header">
            <div>
              <h2>Add Device</h2>
              <span>SIM and validity details</span>
            </div>
            <FaMobileAlt className="portal-panel-icon" />
          </div>
          {renderDeviceForm()}
        </section>
      )}

      {renderDevicesTable()}

      {!isCustomer && (
        <div className="portal-split">
          <section className="portal-panel">
            <div className="portal-panel-header">
              <div>
                <h2>Bulk Upload Devices</h2>
                <span>CSV rows with IMEI, ICCID, Serial No</span>
              </div>
              <FaCloudUploadAlt className="portal-panel-icon" />
            </div>
            <form className="portal-form" onSubmit={bulkUploadDevices}>
              <label className="portal-textarea-label">
                <span>CSV Data</span>
                <textarea value={bulkText} onChange={(event) => setBulkText(event.target.value)} rows={7} placeholder="imei,iccid,serialNo,msisdn1,msisdn2,dealerName,validity,status" />
              </label>
              <div className="portal-actions">
                <button className="portal-primary" type="submit"><FaCloudUploadAlt /> Upload</button>
              </div>
            </form>
          </section>

          <section className="portal-panel">
            <div className="portal-panel-header">
              <div>
                <h2>Transfer Device</h2>
                <span>Device assignment history</span>
              </div>
              <FaExchangeAlt className="portal-panel-icon" />
            </div>
            <form className="portal-form" onSubmit={transferDevice}>
              <div className="portal-form-grid compact">
                <label>
                  <span>Device</span>
                  <select value={transferForm.deviceId} onChange={(event) => setTransferForm((current) => ({ ...current, deviceId: event.target.value }))} required>
                    <option value="">Select device</option>
                    {devices.map((device) => (
                      <option value={device._id} key={device._id}>{device.imei} - {device.serialNo}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Assign To</span>
                  <select value={transferForm.targetUserId} onChange={(event) => setTransferForm((current) => ({ ...current, targetUserId: event.target.value }))}>
                    <option value="">Unassigned</option>
                    {assignableUsers.map((item) => (
                      <option value={item._id} key={item._id}>{getName(item)} ({item.userType || 'Dealer'})</option>
                    ))}
                  </select>
                </label>
                <label className="span-2">
                  <span>Note</span>
                  <input value={transferForm.note} onChange={(event) => setTransferForm((current) => ({ ...current, note: event.target.value }))} />
                </label>
              </div>
              <div className="portal-actions">
                <button className="portal-primary" type="submit"><FaExchangeAlt /> Transfer</button>
              </div>
            </form>

            <div className="portal-history-list">
              {(selectedDevice?.assignmentHistory || []).slice().reverse().slice(0, 5).map((entry) => (
                <div className="history-entry" key={entry._id || entry.changedAt}>
                  <strong>{entry.action}</strong>
                  <span>{getName(entry.fromUser)} - {getName(entry.toUser)}</span>
                  <small>{formatDate(entry.changedAt)}</small>
                </div>
              ))}
              {transferForm.deviceId && !selectedDevice?.assignmentHistory?.length && (
                <div className="portal-empty compact-empty">No assignment history found.</div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );

  const renderCustomers = () => {
    const selectedRenewals = selectedCustomer?.imei
      ? renewals.filter((item) => item.imei === selectedCustomer.imei)
      : renewals.filter((item) => item.customerName === selectedCustomer?.customerName);
    const selectedDevices = selectedCustomer?.imei
      ? devices.filter((device) => device.imei === selectedCustomer.imei)
      : devices.filter((device) => getName(device.assignedTo) === selectedCustomer?.customerName);

    return (
      <div className="portal-stack">
        {!isCustomer && (
          <section className="portal-panel">
            <div className="portal-panel-header">
              <div>
                <h2>Add Customer</h2>
                <span>End user customer record</span>
              </div>
              <FaAddressCard className="portal-panel-icon" />
            </div>
            {renderUserForm('End Customer')}
          </section>
        )}

        <section className="portal-panel">
          <div className="portal-panel-header">
            <div>
              <h2>All Customers</h2>
              <span>{filteredCustomers.length} records</span>
            </div>
            <div className="portal-search">
              <FaSearch />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer" />
            </div>
          </div>
          <div className="portal-table-wrap">
            <table className="portal-table wide">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Mobile</th>
                  <th>Device</th>
                  <th>ICCID</th>
                  <th>Vehicle</th>
                  <th>Expiry</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer) => (
                  <tr key={customer._id}>
                    <td className="strong">{customer.customerName}</td>
                    <td>{customer.mobileNo || '-'}</td>
                    <td>{customer.imei || '-'}</td>
                    <td>{customer.iccid || '-'}</td>
                    <td>{customer.vehicleNo || '-'}</td>
                    <td>{formatDate(customer.expiryDate)}</td>
                    <td>{renderStatus(customer.status)}</td>
                    <td>
                      <div className="portal-row-actions">
                        <button type="button" title="View" onClick={() => setSelectedCustomer(customer)}><FaSearch /></button>
                        {customer.source === 'User' && (
                          <button type="button" title="Edit" onClick={() => setEditUser(users.find((item) => item._id === customer._id))}><FaEdit /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredCustomers.length === 0 && (
                  <tr>
                    <td colSpan={8} className="portal-empty">No customer records found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {selectedCustomer && (
          <div className="portal-split">
            <section className="portal-panel">
              <div className="portal-panel-header">
                <div>
                  <h2>Customer Device History</h2>
                  <span>{selectedCustomer.customerName}</span>
                </div>
                <button className="portal-icon-button" type="button" onClick={() => setSelectedCustomer(null)} title="Close">
                  <FaTimes />
                </button>
              </div>
              <div className="portal-detail-grid">
                <span>Mobile</span><strong>{selectedCustomer.mobileNo || '-'}</strong>
                <span>Address</span><strong>{selectedCustomer.address || '-'}</strong>
                <span>Device</span><strong>{selectedCustomer.imei || '-'}</strong>
                <span>Vehicle</span><strong>{selectedCustomer.vehicleNo || '-'}</strong>
              </div>
              <div className="portal-history-list">
                {selectedDevices.map((device) => (
                  <div className="history-entry" key={device._id}>
                    <strong>{device.imei}</strong>
                    <span>{device.iccid || '-'} / {device.serialNo || '-'}</span>
                    <small>{formatDate(device.expiryDate)}</small>
                  </div>
                ))}
                {selectedDevices.length === 0 && <div className="portal-empty compact-empty">No device history found.</div>}
              </div>
            </section>

            <section className="portal-panel">
              <div className="portal-panel-header">
                <div>
                  <h2>Renewal History</h2>
                  <span>{selectedRenewals.length} records</span>
                </div>
                <FaRedo className="portal-panel-icon" />
              </div>
              <div className="portal-history-list">
                {selectedRenewals.map((renewal) => (
                  <div className="history-entry" key={renewal._id}>
                    <strong>{renewal.requestId}</strong>
                    <span>{renewal.validity} / {renewal.status}</span>
                    <small>{formatDate(renewal.createdAt)}</small>
                  </div>
                ))}
                {selectedRenewals.length === 0 && <div className="portal-empty compact-empty">No renewal history found.</div>}
              </div>
            </section>
          </div>
        )}
      </div>
    );
  };

  const renderRenewals = () => (
    <div className="portal-stack">
      <section className="portal-panel">
        <div className="portal-panel-header">
          <div>
            <h2>Create Renewal Request</h2>
            <span>Validity extension</span>
          </div>
          <FaRedo className="portal-panel-icon" />
        </div>
        <form className="portal-form" onSubmit={createRenewal}>
          <div className="portal-form-grid compact">
            <label>
              <span>Device</span>
              <select value={renewalForm.deviceId} onChange={(event) => setRenewalForm((current) => ({ ...current, deviceId: event.target.value }))}>
                <option value="">Select device</option>
                {devices.map((device) => (
                  <option value={device._id} key={device._id}>{device.imei} - {getName(device.assignedTo)}</option>
                ))}
              </select>
            </label>
            <label>
              <span>IMEI</span>
              <input value={renewalForm.imei} onChange={(event) => setRenewalForm((current) => ({ ...current, imei: event.target.value }))} />
            </label>
            <label>
              <span>Validity</span>
              <select value={renewalForm.validity} onChange={(event) => setRenewalForm((current) => ({ ...current, validity: event.target.value }))}>
                <option value="1 Year">1 Year</option>
                <option value="2 Years">2 Years</option>
              </select>
            </label>
            <label>
              <span>Remarks</span>
              <input value={renewalForm.remarks} onChange={(event) => setRenewalForm((current) => ({ ...current, remarks: event.target.value }))} />
            </label>
          </div>
          <div className="portal-actions">
            <button className="portal-primary" type="submit"><FaRedo /> Create</button>
          </div>
        </form>
      </section>

      <section className="portal-panel">
        <div className="portal-panel-header">
          <div>
            <h2>Renewal History</h2>
            <span>{renewals.length} records</span>
          </div>
          <FaHistory className="portal-panel-icon" />
        </div>
        <div className="portal-table-wrap">
          <table className="portal-table">
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Customer</th>
                <th>IMEI</th>
                <th>Validity</th>
                <th>Current Expiry</th>
                <th>Requested Expiry</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {renewals.map((renewal) => (
                <tr key={renewal._id}>
                  <td className="strong">{renewal.requestId}</td>
                  <td>{renewal.customerName || getName(renewal.customerId)}</td>
                  <td>{renewal.imei}</td>
                  <td>{renewal.validity}</td>
                  <td>{formatDate(renewal.currentExpiryDate)}</td>
                  <td>{formatDate(renewal.requestedExpiryDate)}</td>
                  <td>{renderStatus(renewal.status)}</td>
                </tr>
              ))}
              {renewals.length === 0 && (
                <tr>
                  <td colSpan={7} className="portal-empty">No renewal records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  const renderReports = () => (
    <div className="portal-stack">
      <div className="portal-report-grid">
        {[
          ['Customer Reports', reports?.customerReports],
          ['Device Reports', reports?.deviceReports],
          ['Renewal Reports', reports?.renewalReports],
        ].map(([title, report]) => (
          <section className="portal-panel report-panel" key={title}>
            <div className="portal-panel-header">
              <div>
                <h2>{title}</h2>
                <span>Summary</span>
              </div>
              <FaFileAlt className="portal-panel-icon" />
            </div>
            <div className="report-metrics">
              {Object.entries(report || {}).map(([key, value]) => (
                <div key={key}>
                  <span>{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="portal-panel">
        <div className="portal-panel-header">
          <div>
            <h2>Dealer Reports</h2>
            <span>{reports?.dealerReports?.length || 0} dealers</span>
          </div>
          <FaUserTie className="portal-panel-icon" />
        </div>
        <div className="portal-table-wrap">
          <table className="portal-table">
            <thead>
              <tr>
                <th>Dealer</th>
                <th>Devices</th>
              </tr>
            </thead>
            <tbody>
              {(reports?.dealerReports || []).map((item) => (
                <tr key={item.dealerName}>
                  <td className="strong">{item.dealerName}</td>
                  <td>{item.count}</td>
                </tr>
              ))}
              {!reports?.dealerReports?.length && (
                <tr>
                  <td colSpan={2} className="portal-empty">No dealer report records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  const renderProfile = () => (
    <div className="portal-stack">
      <section className="portal-panel">
        <div className="portal-panel-header">
          <div>
            <h2>Personal Details</h2>
            <span>Contact Information and Address</span>
          </div>
          <FaAddressCard className="portal-panel-icon" />
        </div>
        <div className="portal-detail-grid profile-grid">
          <span>Name</span><strong>{user?.displayName || user?.companyName || user?.username}</strong>
          <span>Username</span><strong>{user?.username}</strong>
          <span>Contact</span><strong>{user?.mobileNo || '-'}</strong>
          <span>Role</span><strong>{role.replace('_', ' ')}</strong>
        </div>
        <div className="portal-actions">
          <Link className="portal-link-button" to="/account/edit-profile"><FaEdit /> Edit Profile</Link>
        </div>
      </section>
    </div>
  );

  const renderContent = () => {
    if (loading) return <div className="portal-loading">Loading portal data...</div>;
    if (error) return <div className="portal-error">{error}</div>;

    if (isCustomer && ['dealers', 'subdealers', 'users', 'customers', 'reports'].includes(activeView)) {
      return renderDashboard();
    }

    if (role !== 'ADMIN' && activeView === 'dealers') {
      return renderDashboard();
    }

    if (role === 'SUB_DEALER' && ['subdealers', 'users'].includes(activeView)) {
      return renderCustomers();
    }

    if (activeView === 'dealers') return renderDealerManagement(false);
    if (activeView === 'subdealers') return renderDealerManagement(true);
    if (activeView === 'users') return renderUserManagement();
    if (activeView === 'devices') return renderDeviceManagement();
    if (activeView === 'customers') return renderCustomers();
    if (activeView === 'reports') return renderReports();
    if (activeView === 'profile') return renderProfile();
    if (activeView === 'mydevices') return renderDevicesTable(filteredDevices, 'My Devices');
    if (activeView === 'renewals') return renderRenewals();
    return renderDashboard();
  };

  return (
    <div className="portal-page">
      {notice && <div className="portal-notice">{notice}</div>}

      <div className="portal-titlebar">
        <div>
          <span className="portal-kicker">Customer Database & Device Management Portal</span>
          <h1>{viewTitles[activeView] || 'Dashboard'}</h1>
        </div>
        <div className="portal-title-actions">
          <button type="button" className={activeView === 'dashboard' ? 'active' : ''} onClick={() => openView('dashboard')}>Dashboard</button>
          {!isCustomer && <button type="button" className={activeView === 'customers' ? 'active' : ''} onClick={() => openView('customers')}>Customers</button>}
          <button type="button" className={activeView === 'devices' || activeView === 'mydevices' ? 'active' : ''} onClick={() => openView(isCustomer ? 'mydevices' : 'devices')}>Devices</button>
          <button type="button" className={activeView === 'renewals' ? 'active' : ''} onClick={() => openView('renewals')}>Renewals</button>
        </div>
      </div>

      {renderContent()}

      {editUser && (
        <div className="portal-modal-backdrop">
          <section className="portal-modal">
            <div className="portal-panel-header">
              <div>
                <h2>Edit Record</h2>
                <span>{getName(editUser)}</span>
              </div>
              <button className="portal-icon-button" type="button" onClick={() => setEditUser(null)} title="Close">
                <FaTimes />
              </button>
            </div>
            <form className="portal-form" onSubmit={saveUserEdit}>
              <div className="portal-form-grid">
                <label>
                  <span>Name</span>
                  <input value={editUser.displayName || ''} onChange={(event) => setEditUser((current) => ({ ...current, displayName: event.target.value }))} />
                </label>
                <label>
                  <span>Company</span>
                  <input value={editUser.companyName || ''} onChange={(event) => setEditUser((current) => ({ ...current, companyName: event.target.value }))} />
                </label>
                <label>
                  <span>Contact Person</span>
                  <input value={editUser.contactPerson || ''} onChange={(event) => setEditUser((current) => ({ ...current, contactPerson: event.target.value }))} />
                </label>
                <label>
                  <span>Mobile</span>
                  <input value={editUser.mobileNo || ''} onChange={(event) => setEditUser((current) => ({ ...current, mobileNo: event.target.value }))} />
                </label>
                <label>
                  <span>Email</span>
                  <input value={editUser.email || ''} onChange={(event) => setEditUser((current) => ({ ...current, email: event.target.value }))} />
                </label>
                <label>
                  <span>Status</span>
                  <select value={editUser.status || 'Active'} onChange={(event) => setEditUser((current) => ({ ...current, status: event.target.value }))}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </label>
                <label className="span-2">
                  <span>Address</span>
                  <input value={editUser.address || ''} onChange={(event) => setEditUser((current) => ({ ...current, address: event.target.value }))} />
                </label>
                <label>
                  <span>City</span>
                  <input value={editUser.city || ''} onChange={(event) => setEditUser((current) => ({ ...current, city: event.target.value }))} />
                </label>
                <label>
                  <span>State</span>
                  <input value={editUser.state || ''} onChange={(event) => setEditUser((current) => ({ ...current, state: event.target.value }))} />
                </label>
                <label>
                  <span>Pincode</span>
                  <input value={editUser.pincode || ''} onChange={(event) => setEditUser((current) => ({ ...current, pincode: event.target.value }))} />
                </label>
              </div>
              <div className="portal-actions">
                <button className="portal-primary" type="submit"><FaSave /> Save</button>
                <button type="button" onClick={() => setEditUser(null)}><FaTimes /> Cancel</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};

export default CustomerDevicePortal;
