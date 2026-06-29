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
  FaFileInvoiceDollar,
  FaRupeeSign,
  FaChartLine,
  FaBoxOpen,
  FaCoins,
} from 'react-icons/fa';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import './CustomerDevicePortal.css';
import RevenueBreakdownModal from './RevenueBreakdownModal';


const emptyUserForm = {
  userType: 'Sub Dealer',
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

const getLocalDateString = (dateObj) => {
  const d = dateObj ? new Date(dateObj) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const emptyDeviceForm = {
  dealerId: '',
  dealerName: '',
  subDealerId: '',
  subDealerName: '',
  assignedTo: '',
  imei: '',
  iccid: '',
  serialNo: '',
  msisdn1: '',
  msisdn2: '',
  validity: '1 Year',
  status: 'Active',
  presentDate: getLocalDateString(),
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
  totalProducts: { label: 'Total Products', icon: FaBoxOpen, tone: 'blue' },
  expiringThisMonth: { label: 'Expiring This Month', icon: FaCalendarAlt, tone: 'violet' },
  totalDues: { label: 'Total Dues', icon: FaRupeeSign, tone: 'red' },
  totalRenewalDues: { label: 'Total Renewal Dues', icon: FaRupeeSign, tone: 'orange' },
};

const statKeysByRole = {
  ADMIN: [
    'totalDealers',
    'totalSubDealers',
    'totalDevices',
    'activeDevices',
    'expiredDevices',
    'devicesAddedToday',
    'renewalDueDevices',
  ],
  DEALER: [
    'assignedDevices',
    'totalSubDealers',
    'renewalDueDevices',
    'availableDevices',
    'totalDevices',
    'expiringThisMonth',
    'totalDues',
    'totalRenewalDues',
  ],
  SUB_DEALER: [
    'availableDevices',
    'renewalDueDevices',
    'assignedDevices',
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

const getExpiryDate = (presentDateStr, validity) => {
  if (!presentDateStr) return new Date();
  const date = new Date(presentDateStr);
  if (isNaN(date.getTime())) return new Date();
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
    : ['imei', 'iccid', 'serialNo', 'msisdn1', 'msisdn2', 'dealerName', 'validity', 'status', 'itrNo', 'vendor'];

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
  const initialImei = params.get('imei') || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [summary, setSummary] = useState(null);
  const [dueSummary, setDueSummary] = useState(null);
  const [renewalDueSummary, setRenewalDueSummary] = useState(null);
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
  const [selectedDealerFilter, setSelectedDealerFilter] = useState('');
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [editUser, setEditUser] = useState(null);
  const [deviceForm, setDeviceForm] = useState(emptyDeviceForm);
  const [bulkText, setBulkText] = useState('');
  const [transferForm, setTransferForm] = useState({ deviceId: '', targetUserId: '', note: '' });
  const [renewalForm, setRenewalForm] = useState({
    dealerId: '',
    customerName: '',
    customerMobile: '',
    imei: '',
    vehicleNumber: '',
    deviceModel: '',
    activationType: 'NIC',
    productDescription: '',
    validity: '1 Year',
    renewalDate: new Date().toISOString().split('T')[0],
    newExpiryDate: '',
    billAmount: '',
    paymentMode: 'Cash',
    remarks: '',
  });
  const [renewalStats, setRenewalStats] = useState(null);
  const [renewalFilters, setRenewalFilters] = useState({
    dealerId: '',
    status: '',
    customerName: '',
    imei: initialImei,
    vehicleNumber: '',
    fromDate: '',
    toDate: '',
  });
  const [renewalPage, setRenewalPage] = useState(1);
  const [renewalLimit, setRenewalLimit] = useState(10);
  const [editingRenewalId, setEditingRenewalId] = useState(null);
  const [viewingRenewal, setViewingRenewal] = useState(null);
  const [reportPaymentRenewal, setReportPaymentRenewal] = useState(null);
  const [renewalPaymentForm, setRenewalPaymentForm] = useState({
    receivedAmount: '',
    paymentMode: 'UPI',
    transactionId: '',
    paymentDate: new Date().toISOString().split('T')[0],
    remarks: '',
  });
  const [renewalScreenshot, setRenewalScreenshot] = useState(null);
  const [submittingRenewalPayment, setSubmittingRenewalPayment] = useState(false);
  const [selectedRenewalIds, setSelectedRenewalIds] = useState([]);
  const [isBulkPaymentModalOpen, setIsBulkPaymentModalOpen] = useState(false);
  const [bulkPaymentForm, setBulkPaymentForm] = useState({
    receivedAmount: '',
    paymentMode: 'UPI',
    transactionId: '',
    paymentDate: new Date().toISOString().split('T')[0],
    remarks: '',
  });
  const [bulkScreenshot, setBulkScreenshot] = useState(null);
  const [submittingBulkPayment, setSubmittingBulkPayment] = useState(false);
  const [resetForm, setResetForm] = useState({ userId: '', password: '' });
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [portalDateMode, setPortalDateMode] = useState('all');
  const [portalFromDate, setPortalFromDate] = useState('');
  const [portalToDate, setPortalToDate] = useState('');
  const [deviceTab, setDeviceTab] = useState('list'); // 'list' or 'history'

  // Revenue Breakdown Modal State
  const [isRevenueModalOpen, setIsRevenueModalOpen] = useState(false);
  const [revenueModalTab, setRevenueModalTab] = useState('today');

  const userRole = user?.role === 'partner' ? 'ADMIN' : user?.userType === 'Administration' ? 'ADMIN' : user?.userType === 'Sub Dealer' ? 'SUB_DEALER' : 'DEALER';
  const role = summary?.role || userRole;
  const isAdmin = role === 'ADMIN';
  const isCustomer = false;
  const assignableUsers = useMemo(() => (
    [...dealers, ...subDealers, ...users].filter((item, index, list) => (
      item?._id && list.findIndex((other) => other._id === item._id) === index
    ))
  ), [dealers, subDealers, users]);

  const availableSubDealers = useMemo(() => {
    if (!deviceForm.dealerId) return [];
    return subDealers.filter((sd) => sd.parentId === deviceForm.dealerId);
  }, [subDealers, deviceForm.dealerId]);



  const selectedDevice = useMemo(() => (
    devices.find((device) => device._id === transferForm.deviceId)
  ), [devices, transferForm.deviceId]);

  const dealersWithCounts = useMemo(() => {
    const counts = {};
    
    dealers.forEach((d) => {
      if (d && d._id) {
        counts[d._id] = {
          id: d._id,
          name: getName(d) || d.username || 'Unknown Dealer',
          count: 0
        };
      }
    });

    devices.forEach((device) => {
      const dealer = device.dealerId;
      if (dealer) {
        const id = dealer._id || dealer;
        const name = getLinkedName(dealer, device.dealerName);
        if (id) {
          if (!counts[id]) {
            counts[id] = { id, name, count: 0 };
          }
          counts[id].count += 1;
        }
      }
    });

    return Object.values(counts).sort((a, b) => a.name.localeCompare(b.name));
  }, [dealers, devices]);

  const filteredDevices = useMemo(() => {
    const query = search.trim().toLowerCase();
    let result = devices;

    if (selectedDealerFilter) {
      result = result.filter((device) => {
        const dealerId = device.dealerId?._id || device.dealerId;
        return dealerId === selectedDealerFilter;
      });
    }

    if (portalFromDate || portalToDate) {
      result = result.filter((device) => {
        if (!device.presentDate) return false;
        const devDate = new Date(device.presentDate);
        if (portalFromDate) {
          const fromD = new Date(portalFromDate);
          fromD.setHours(0, 0, 0, 0);
          if (devDate < fromD) return false;
        }
        if (portalToDate) {
          const toD = new Date(portalToDate);
          toD.setHours(23, 59, 59, 999);
          if (devDate > toD) return false;
        }
        return true;
      });
    }

    if (!query) return result;
    return result.filter((device) => (
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
  }, [devices, search, portalFromDate, portalToDate, selectedDealerFilter]);

  const filteredAssignments = useMemo(() => {
    let result = [];
    devices.forEach((device) => {
      (device.assignmentHistory || []).forEach((entry) => {
        result.push({
          _id: entry._id || `${device._id}-${entry.changedAt}`,
          device,
          entry,
        });
      });
    });

    // Sort by changedAt descending
    result.sort((a, b) => new Date(b.entry.changedAt) - new Date(a.entry.changedAt));

    // Filter by Date
    if (portalFromDate || portalToDate) {
      result = result.filter((item) => {
        if (!item.entry.changedAt) return false;
        const entryDate = new Date(item.entry.changedAt);
        if (portalFromDate) {
          const fromD = new Date(portalFromDate);
          fromD.setHours(0, 0, 0, 0);
          if (entryDate < fromD) return false;
        }
        if (portalToDate) {
          const toD = new Date(portalToDate);
          toD.setHours(23, 59, 59, 999);
          if (entryDate > toD) return false;
        }
        return true;
      });
    }

    // Filter by Search Query
    const query = search.trim().toLowerCase();
    if (!query) return result;

    return result.filter((item) => (
      item.device.imei?.toLowerCase().includes(query)
      || item.device.serialNo?.toLowerCase().includes(query)
      || getLinkedName(item.entry.fromUser).toLowerCase().includes(query)
      || getLinkedName(item.entry.toUser).toLowerCase().includes(query)
      || getLinkedName(item.entry.changedBy).toLowerCase().includes(query)
      || item.entry.action?.toLowerCase().includes(query)
      || item.entry.note?.toLowerCase().includes(query)
    ));
  }, [devices, search, portalFromDate, portalToDate]);

  const handlePortalDateModeChange = (mode) => {
    setPortalDateMode(mode);
    const todayStr = getLocalDateString();
    
    if (mode === 'all') {
      setPortalFromDate('');
      setPortalToDate('');
    } else if (mode === 'today') {
      setPortalFromDate(todayStr);
      setPortalToDate(todayStr);
    } else if (mode === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = getLocalDateString(yesterday);
      setPortalFromDate(yesterdayStr);
      setPortalToDate(yesterdayStr);
    } else if (mode === 'custom') {
      // Keep empty or let them change
    }
  };

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
      const canManageUsers = userRole === 'ADMIN' || userRole === 'DEALER';
      const isOps = userRole === 'ADMIN' || userRole === 'DEALER' || userRole === 'SUB_DEALER';
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
        dueSummaryRes,
        renewalDueSummaryRes,
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
        isOps ? api.get('/due-dashboard/summary').catch(() => ({ data: null })) : Promise.resolve({ data: null }),
        api.get('/portal/renewals/due-summary').catch(() => ({ data: null })),
      ]);

      setSummary(summaryRes.data);
      setDueSummary(dueSummaryRes?.data || null);
      setRenewalDueSummary(renewalDueSummaryRes?.data || null);
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
    const interval = setInterval(() => {
      loadPortalData();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadPortalData]);

  useEffect(() => {
    setSearch(initialSearch);
  }, [initialSearch]);

  const calculateNewExpiryDate = (rDateStr, val) => {
    if (!rDateStr) return '';
    const date = new Date(rDateStr);
    if (isNaN(date.getTime())) return '';
    const years = val === '2 Years' ? 2 : 1;
    date.setFullYear(date.getFullYear() + years);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleRenewalFormChange = (field, value) => {
    setRenewalForm(current => {
      const next = { ...current, [field]: value };
      if (field === 'renewalDate' || field === 'validity') {
        next.newExpiryDate = calculateNewExpiryDate(next.renewalDate, next.validity);
      }
      return next;
    });
  };

  const fetchRenewalsData = async () => {
    try {
      const [renewalsRes, statsRes] = await Promise.all([
        api.get('/portal/renewals', { params: renewalFilters }),
        api.get('/portal/renewals/stats'),
      ]);
      setRenewals(renewalsRes.data || []);
      setRenewalStats(statsRes.data || null);
    } catch (err) {
      console.error('Error fetching renewals:', err);
    }
  };

  useEffect(() => {
    if (activeView === 'renewals') {
      fetchRenewalsData();
    }
  }, [activeView, renewalFilters]);

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
    if (userRole !== 'ADMIN') {
      showNotice('Access denied: Only Admins can edit users.');
      return;
    }
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
    if (userRole !== 'ADMIN') {
      showNotice('Access denied: Only Admins can change user status.');
      return;
    }
    await api.put(`/portal/users/${targetUser._id}`, { status: nextStatus });
    showNotice(`${getName(targetUser)} marked ${nextStatus}.`);
    await loadPortalData();
  };

  const resetPassword = async (event) => {
    event.preventDefault();
    if (userRole !== 'ADMIN') {
      showNotice('Access denied: Only Admins can reset user passwords.');
      return;
    }
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

  const handleSaveRenewal = async (event) => {
    event.preventDefault();

    // Validations
    if (!renewalForm.dealerId) { alert('Dealer Name is required'); return; }
    if (!renewalForm.customerName) { alert('Customer Name is required'); return; }
    if (!renewalForm.customerMobile) { alert('Customer Mobile is required'); return; }
    if (!renewalForm.imei) { alert('IMEI is required'); return; }
    if (!/^\d{15}$/.test(renewalForm.imei)) { alert('IMEI must contain exactly 15 digits.'); return; }
    if (!renewalForm.vehicleNumber) { alert('Vehicle Number is required'); return; }
    if (!renewalForm.deviceModel) { alert('Device Model is required'); return; }
    if (!renewalForm.activationType) { alert('Activation Type is required'); return; }
    if (!renewalForm.productDescription) { alert('Product Description is required'); return; }
    if (!renewalForm.renewalDate) { alert('Renewal Date is required'); return; }
    if (!renewalForm.billAmount) { alert('Bill Amount is required'); return; }
    if (Number(renewalForm.billAmount) <= 0) { alert('Bill Amount cannot be zero or negative.'); return; }

    try {
      if (editingRenewalId) {
        await api.put(`/portal/renewals/${editingRenewalId}`, renewalForm);
        showNotice('Renewal Request Updated Successfully.');
        setEditingRenewalId(null);
      } else {
        await api.post('/portal/renewals', renewalForm);
        showNotice('Renewal Request Created Successfully.');
      }
      
      setRenewalForm({
        dealerId: '',
        customerName: '',
        customerMobile: '',
        imei: '',
        vehicleNumber: '',
        deviceModel: '',
        activationType: 'NIC',
        productDescription: '',
        validity: '1 Year',
        renewalDate: new Date().toISOString().split('T')[0],
        newExpiryDate: calculateNewExpiryDate(new Date().toISOString().split('T')[0], '1 Year'),
        billAmount: '',
        paymentMode: 'Cash',
        remarks: '',
      });
      fetchRenewalsData();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to save renewal request.');
    }
  };

  const handleEditRenewalClick = (renewal) => {
    setEditingRenewalId(renewal._id);
    setRenewalForm({
      dealerId: renewal.dealerId || '',
      customerName: renewal.customerName || '',
      customerMobile: renewal.customerMobile || '',
      imei: renewal.imei || '',
      vehicleNumber: renewal.vehicleNumber || '',
      deviceModel: renewal.deviceModel || '',
      activationType: renewal.activationType || 'NIC',
      productDescription: renewal.productDescription || '',
      validity: renewal.validity || '1 Year',
      renewalDate: renewal.renewalDate ? new Date(renewal.renewalDate).toISOString().split('T')[0] : '',
      newExpiryDate: renewal.newExpiryDate ? new Date(renewal.newExpiryDate).toISOString().split('T')[0] : '',
      billAmount: renewal.billAmount || '',
      paymentMode: renewal.paymentMode || 'Cash',
      remarks: renewal.remarks || '',
    });
  };

  const handleStatusChange = async (renewalId, nextStatus) => {
    try {
      await api.put(`/portal/renewals/${renewalId}`, { status: nextStatus });
      showNotice(`Status updated to ${nextStatus}.`);
      fetchRenewalsData();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to update status.');
    }
  };

  const handleDeleteRenewal = async (renewalId) => {
    if (window.confirm('Are you sure you want to delete this renewal request?')) {
      try {
        await api.delete(`/portal/renewals/${renewalId}`);
        showNotice('Renewal Request Deleted Successfully.');
        fetchRenewalsData();
      } catch (err) {
        console.error(err);
        alert(err.response?.data?.message || 'Failed to delete renewal request.');
      }
    }
  };

  const handleSelectRenewal = (id) => {
    setSelectedRenewalIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllRenewals = (e) => {
    const isChecked = e.target.checked;
    const visibleRenewals = renewals.slice((renewalPage - 1) * renewalLimit, renewalPage * renewalLimit);
    const visiblePayable = visibleRenewals.filter(r => r.paymentStatus !== 'Paid' && r.status !== 'Rejected');
    
    if (isChecked) {
      const ids = visiblePayable.map(r => r._id);
      setSelectedRenewalIds(prev => Array.from(new Set([...prev, ...ids])));
    } else {
      const idsToRemove = visiblePayable.map(r => r._id);
      setSelectedRenewalIds(prev => prev.filter(id => !idsToRemove.includes(id)));
    }
  };

  const handleOpenBulkPayment = () => {
    if (selectedRenewalIds.length === 0) {
      alert('Please select at least one renewal request.');
      return;
    }
    const selectedRequests = renewals.filter(r => selectedRenewalIds.includes(r._id));
    const totalDue = selectedRequests.reduce((sum, r) => sum + (r.remainingDue || 0), 0);
    
    setBulkPaymentForm({
      receivedAmount: totalDue,
      paymentMode: 'UPI',
      transactionId: '',
      paymentDate: new Date().toISOString().split('T')[0],
      remarks: '',
    });
    setBulkScreenshot(null);
    setIsBulkPaymentModalOpen(true);
  };

  const handleSaveBulkPayment = async (e) => {
    e.preventDefault();
    if (!bulkPaymentForm.receivedAmount || Number(bulkPaymentForm.receivedAmount) <= 0) {
      alert('Valid payment amount is required.');
      return;
    }
    if (bulkPaymentForm.paymentMode === 'UPI') {
      if (!bulkPaymentForm.transactionId || !bulkPaymentForm.transactionId.trim()) {
        alert('Transaction ID / Reference Number is required for UPI payments.');
        return;
      }
      const cleanedTxId = bulkPaymentForm.transactionId.trim();
      if (!/^\d{12}$/.test(cleanedTxId)) {
        alert('For UPI payments, the Transaction ID / Reference number must be exactly 12 numeric digits.');
        return;
      }
      if (!bulkScreenshot) {
        alert('Screenshot proof is required for UPI payments.');
        return;
      }
    }

    setSubmittingBulkPayment(true);
    try {
      const formData = new FormData();
      formData.append('requestIdsJson', JSON.stringify(selectedRenewalIds));
      formData.append('receivedAmount', bulkPaymentForm.receivedAmount);
      formData.append('paymentMode', bulkPaymentForm.paymentMode);
      formData.append('transactionId', bulkPaymentForm.transactionId);
      formData.append('paymentDate', bulkPaymentForm.paymentDate);
      formData.append('remarks', bulkPaymentForm.remarks);
      if (bulkScreenshot) {
        formData.append('screenshot', bulkScreenshot);
      }

      await api.put('/portal/renewals/report-bulk-payment', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      showNotice('Bulk payment submitted successfully for verification.');
      setIsBulkPaymentModalOpen(false);
      setSelectedRenewalIds([]);
      fetchRenewalsData();
      loadPortalData();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to submit bulk payment.');
    } finally {
      setSubmittingBulkPayment(false);
    }
  };

  const handleOpenReportPayment = (renewal) => {
    const remaining = renewal.billAmount - (renewal.receivedAmount || 0);
    setReportPaymentRenewal(renewal);
    setRenewalPaymentForm({
      receivedAmount: remaining,
      paymentMode: 'UPI',
      transactionId: '',
      paymentDate: new Date().toISOString().split('T')[0],
      remarks: '',
    });
    setRenewalScreenshot(null);
  };

  const handleRenewalPaymentSubmit = async (e) => {
    e.preventDefault();
    if (!renewalPaymentForm.receivedAmount || Number(renewalPaymentForm.receivedAmount) <= 0) {
      alert('Please enter a valid amount.');
      return;
    }
    const remaining = reportPaymentRenewal.billAmount - (reportPaymentRenewal.receivedAmount || 0);
    if (Number(renewalPaymentForm.receivedAmount) > remaining) {
      alert(`Payment amount cannot exceed remaining outstanding due (₹${remaining}).`);
      return;
    }
    if (renewalPaymentForm.paymentMode === 'UPI') {
      if (!renewalPaymentForm.transactionId || !renewalPaymentForm.transactionId.trim()) {
        alert('Transaction ID / Reference Number is required for UPI payments.');
        return;
      }
      const cleanedTxId = renewalPaymentForm.transactionId.trim();
      if (!/^\d{12}$/.test(cleanedTxId)) {
        alert('For UPI payments, the Transaction ID / Reference number must be exactly 12 numeric digits.');
        return;
      }
      if (!renewalScreenshot) {
        alert('Please upload a payment screenshot/proof for UPI payments.');
        return;
      }
    }

    try {
      setSubmittingRenewalPayment(true);
      const formDataObj = new FormData();
      formDataObj.append('receivedAmount', Number(renewalPaymentForm.receivedAmount));
      formDataObj.append('paymentMode', renewalPaymentForm.paymentMode);
      formDataObj.append('transactionId', renewalPaymentForm.transactionId);
      formDataObj.append('paymentDate', renewalPaymentForm.paymentDate);
      formDataObj.append('remarks', renewalPaymentForm.remarks);
      if (renewalScreenshot) {
        formDataObj.append('screenshot', renewalScreenshot);
      }

      await api.put(`/portal/renewals/${reportPaymentRenewal._id}/report-payment`, formDataObj, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      showNotice('Payment proof submitted successfully for verification.');
      setReportPaymentRenewal(null);
      setRenewalScreenshot(null);
      fetchRenewalsData();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to submit payment proof.');
    } finally {
      setSubmittingRenewalPayment(false);
    }
  };

  const handlePrintInvoice = (renewal) => {
    const printWindow = window.open('', '_blank');
    const renewalDateFormatted = new Date(renewal.renewalDate).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
    const expiryDateFormatted = new Date(renewal.newExpiryDate).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
    const createdDateFormatted = new Date(renewal.createdAt).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });

    const htmlContent = `
      <html>
      <head>
        <title>Invoice - ${renewal.requestId}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; margin: 40px; }
          .invoice-box { max-width: 800px; margin: auto; border: 1px solid #eee; box-shadow: 0 0 10px rgba(0, 0, 0, 0.15); padding: 30px; font-size: 14px; line-height: 24px; }
          .invoice-header { display: flex; justify-content: space-between; border-bottom: 2px solid #3b82f6; padding-bottom: 20px; margin-bottom: 20px; }
          .company-details h1 { margin: 0; color: #3b82f6; font-size: 24px; }
          .invoice-title { text-align: right; }
          .invoice-title h2 { margin: 0; color: #1e293b; }
          .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 40px; }
          .details-card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; }
          .details-card h3 { margin-top: 0; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px; color: #475569; }
          .details-card div { display: flex; justify-content: space-between; margin-bottom: 5px; }
          .details-card span { color: #64748b; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { background: #f1f5f9; color: #475569; font-weight: 600; text-align: left; padding: 10px; border-bottom: 2px solid #cbd5e1; }
          td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
          .totals-table { width: 40%; margin-left: auto; margin-right: 0; }
          .totals-table td { border: none; padding: 5px 10px; }
          .totals-table tr.grand-total td { font-weight: 700; border-top: 2px solid #cbd5e1; font-size: 16px; color: #3b82f6; }
          .footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
          @media print {
            body { margin: 0; }
            .invoice-box { border: none; box-shadow: none; padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="invoice-box">
          <div class="invoice-header">
            <div class="company-details">
              <h1>ARSHI ENTERPRISES</h1>
              <p>GPS Tracking & IoT Solutions</p>
            </div>
            <div class="invoice-title">
              <h2>INVOICE</h2>
              <p><strong>Request ID:</strong> ${renewal.requestId}</p>
              <p><strong>Date:</strong> ${createdDateFormatted}</p>
            </div>
          </div>

          <div class="details-grid">
            <div class="details-card">
              <h3>Billed To (Dealer)</h3>
              <div><span>Name:</span> <strong>${renewal.dealerName}</strong></div>
              <div><span>Mobile:</span> <strong>${renewal.customerMobile || '-'}</strong></div>
            </div>
            <div class="details-card">
              <h3>Customer Details</h3>
              <div><span>Name:</span> <strong>${renewal.customerName}</strong></div>
              <div><span>Vehicle No:</span> <strong>${renewal.vehicleNumber}</strong></div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Item Description</th>
                <th>IMEI</th>
                <th>Model</th>
                <th>Validity</th>
                <th>Renewal Date</th>
                <th>Expiry Date</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${renewal.productDescription}</td>
                <td>${renewal.imei}</td>
                <td>${renewal.deviceModel}</td>
                <td>${renewal.validity}</td>
                <td>${renewalDateFormatted}</td>
                <td>${expiryDateFormatted}</td>
              </tr>
            </tbody>
          </table>

          <table class="totals-table">
            <tr>
              <td>Subtotal</td>
              <td style="text-align: right;">₹${(renewal.billAmount / 1.18).toFixed(2)}</td>
            </tr>
            <tr>
              <td>GST (18%)</td>
              <td style="text-align: right;">₹${(renewal.billAmount - (renewal.billAmount / 1.18)).toFixed(2)}</td>
            </tr>
            <tr class="grand-total">
              <td>Total Paid (${renewal.paymentMode})</td>
              <td style="text-align: right;">₹${renewal.billAmount.toFixed(2)}</td>
            </tr>
          </table>

          <div class="footer">
            <p>Thank you for your business!</p>
            <p>This is a computer-generated invoice and does not require a physical signature.</p>
          </div>
        </div>
        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const downloadDeviceReport = () => {
    if (deviceTab === 'history') {
      const headers = ['Date', 'IMEI', 'Serial No', 'Action', 'From User', 'To User', 'Changed By', 'Note'];
      const rows = filteredAssignments.map((item) => [
        formatDate(item.entry.changedAt),
        item.device.imei || '',
        item.device.serialNo || '',
        item.entry.action || '',
        getLinkedName(item.entry.fromUser, ''),
        getLinkedName(item.entry.toUser, ''),
        getLinkedName(item.entry.changedBy, ''),
        item.entry.note || '',
      ]);
      const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'device-assignment-history-report.csv');
      link.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = ['Device ID', 'Dealer', 'Sub Dealer', 'Assigned Customer', 'IMEI', 'ICCID', 'Serial No', 'MSISDN 1', 'MSISDN 2', 'Validity', 'Activation Date', 'Expiry Date', 'Created By', 'Status'];
      const rows = filteredDevices.map((device) => [
        device._id || '',
        device.dealerName || '',
        device.subDealerName || '',
        getLinkedName(device.assignedTo, ''),
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
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const renderStatus = (status) => (
    <span className={`portal-status status-${String(status || 'active').toLowerCase().replace(/\s+/g, '-')}`}>
      {status || 'Active'}
    </span>
  );

  const handleStatClick = (key) => {
    switch (key) {
      case 'totalDealers':
        if (role === 'ADMIN') {
          openView('dealers');
        }
        break;
      case 'totalSubDealers':
        openView('subdealers');
        break;

      case 'totalDevices':
        openView('devices');
        break;
      case 'activeDevices':
        openView('devices');
        setSearch('active');
        break;
      case 'expiredDevices':
        openView('devices');
        setSearch('inactive');
        break;
      case 'devicesAddedToday':
        openView('devices');
        break;
      case 'renewalDueDevices':
      case 'pendingRenewals':
        openView('renewals');
        break;
      case 'assignedDevices':
        openView('devices');
        break;
      case 'availableDevices':
        openView('devices');
        break;
      case 'totalProducts':
        navigate('/add-product');
        break;
      case 'totalDues':
      case 'totalRenewalDues':
        navigate('/due-dashboard');
        break;
      case 'expiringThisMonth':
        navigate('/due-dashboard?tab=renewals&filter=expiringThisMonth');
        break;
      default:
        break;
    }
  };

  const renderStats = () => {
    const keys = statKeysByRole[role] || statKeysByRole.DEALER;
    return (
      <div className="portal-stats-grid">
        {keys.map((key) => {
          const item = statCatalog[key];
          const Icon = item.icon;
          const isCurrency = ['totalDues', 'totalRenewalDues'].includes(key);
          const rawValue = summary?.[key] ?? 0;
          const displayValue = isCurrency 
            ? `₹${Number(rawValue).toLocaleString('en-IN')}` 
            : rawValue;
          return (
            <div 
              className={`portal-stat stat-${item.tone}`} 
              key={key}
              onClick={() => handleStatClick(key)}
              style={{ cursor: 'pointer' }}
            >
              <div>
                <span className="portal-stat-value">{displayValue}</span>
                <span className="portal-stat-label">{item.label}</span>
              </div>
              <Icon className="portal-stat-icon" />
            </div>
          );
        })}
      </div>
    );
  };

  const renderDashboard = () => {
    const isOps = ['ADMIN', 'DEALER', 'SUB_DEALER'].includes(role);
    return (
      <div className="portal-stack" key="view-dashboard">
        {renderStats()}

        {isAdmin ? (
          <>
            {dueSummary && (
              <div className="portal-panel" style={{ marginTop: '10px' }} key="due-summary-panel">
                <div className="portal-panel-header">
                  <div>
                    <h2>Due & Financial Overview</h2>
                    <span>Outstanding dues and collections</span>
                  </div>
                  <FaFileInvoiceDollar className="portal-panel-icon" />
                </div>
                <div style={{ padding: '16px' }}>
                  <div className="portal-stats-grid">
                    <div 
                      className="portal-stat stat-red" 
                      onClick={() => navigate('/due-dashboard?tab=dues&filter=PendingDues')} 
                      style={{ cursor: 'pointer' }}
                    >
                      <div>
                        <span className="portal-stat-value">₹{(dueSummary.totalOutstandingAmount || 0).toLocaleString()}</span>
                        <span className="portal-stat-label">Total Outstanding Amount</span>
                      </div>
                      <FaRupeeSign className="portal-stat-icon" />
                    </div>

                    <div 
                      className="portal-stat stat-amber" 
                      onClick={() => navigate('/due-dashboard?tab=dues&filter=PendingDues')} 
                      style={{ cursor: 'pointer' }}
                    >
                      <div>
                        <span className="portal-stat-value">₹{(dueSummary.totalDueAmount || 0).toLocaleString()}</span>
                        <span className="portal-stat-label">Total Due Amount (Over 30 Days)</span>
                      </div>
                      <FaRupeeSign className="portal-stat-icon" />
                    </div>

                    <div 
                      className="portal-stat stat-green"
                      onClick={() => navigate('/due-dashboard?tab=verifications&filter=today')}
                      style={{ cursor: 'pointer' }}
                    >
                      <div>
                        <span className="portal-stat-value">₹{(dueSummary.todaysCollection || 0).toLocaleString()}</span>
                        <span className="portal-stat-label">Today's Collection</span>
                      </div>
                      <FaRupeeSign className="portal-stat-icon" />
                    </div>

                    <div 
                      className="portal-stat stat-blue"
                      onClick={() => navigate('/due-dashboard?tab=verifications&filter=month')}
                      style={{ cursor: 'pointer' }}
                    >
                      <div>
                        <span className="portal-stat-value">₹{(dueSummary.monthlyCollection || 0).toLocaleString()}</span>
                        <span className="portal-stat-label">Monthly Collection</span>
                      </div>
                      <FaCoins className="portal-stat-icon" />
                    </div>

                    <div 
                      className="portal-stat stat-violet" 
                      onClick={() => { setRevenueModalTab('today'); setIsRevenueModalOpen(true); }}
                      style={{ cursor: 'pointer' }}
                    >
                      <div>
                        <span className="portal-stat-value">₹{(dueSummary.todaysRevenue || 0).toLocaleString()}</span>
                        <span className="portal-stat-label">Today's Revenue</span>
                      </div>
                      <FaChartLine className="portal-stat-icon" />
                    </div>

                    <div 
                      className="portal-stat stat-slate"
                      onClick={() => { setRevenueModalTab('month'); setIsRevenueModalOpen(true); }}
                      style={{ cursor: 'pointer' }}
                    >
                      <div>
                        <span className="portal-stat-value">₹{(dueSummary.monthlyRevenue || 0).toLocaleString()}</span>
                        <span className="portal-stat-label">Monthly Revenue</span>
                      </div>
                      <FaChartLine className="portal-stat-icon" />
                    </div>

                    <div 
                      className="portal-stat stat-amber" 
                      onClick={() => navigate('/due-dashboard?tab=renewals')} 
                      style={{ cursor: 'pointer' }}
                    >
                      <div style={{ width: '100%' }}>
                        <span className="portal-stat-value">{summary?.renewalDueDevices ?? 0}</span>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                          <span className="portal-stat-label">Renewal Due Devices</span>
                        </div>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate('/due-dashboard?tab=renewals');
                          }}
                          style={{
                            marginTop: '8px',
                            background: 'var(--primary-blue)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '11px',
                            fontWeight: '700',
                            cursor: 'pointer'
                          }}
                        >
                          View All
                        </button>
                      </div>
                      <FaCalendarAlt className="portal-stat-icon" />
                    </div>

                    <div 
                      className="portal-stat stat-violet"
                      onClick={() => navigate('/due-dashboard?tab=renewals&filter=expiringThisMonth')}
                      style={{ cursor: 'pointer' }}
                    >
                      <div>
                        <span className="portal-stat-value">{summary?.expiringThisMonth ?? 0}</span>
                        <span className="portal-stat-label">Expiring This Month</span>
                      </div>
                      <FaHistory className="portal-stat-icon" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {renewalDueSummary && (
              <div className="portal-panel" style={{ marginTop: '20px' }} key="renewal-due-summary-panel">
                <div className="portal-panel-header" style={{ borderTop: '4px solid #8b5cf6' }}>
                  <div>
                    <h2>Renewal Due Overview</h2>
                    <span>Outstanding renewal dues and collection records</span>
                  </div>
                  <FaFileInvoiceDollar className="portal-panel-icon" style={{ color: '#8b5cf6' }} />
                </div>
                <div style={{ padding: '16px' }}>
                  <div className="portal-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px' }}>
                    <div 
                      className="portal-stat stat-red" 
                      onClick={() => navigate('/renewal-due-management')} 
                      style={{ cursor: 'pointer' }}
                    >
                      <div>
                        <span className="portal-stat-value">₹{(renewalDueSummary.totalDue || 0).toLocaleString()}</span>
                        <span className="portal-stat-label">Total Renewal Due</span>
                      </div>
                      <FaRupeeSign className="portal-stat-icon" />
                    </div>

                    <div 
                      className="portal-stat stat-blue" 
                      onClick={() => navigate('/renewal-due-management')} 
                      style={{ cursor: 'pointer' }}
                    >
                      <div>
                        <span className="portal-stat-value">{(renewalDueSummary.pendingRequestsCount || 0)}</span>
                        <span className="portal-stat-label">Pending Renewal Requests</span>
                      </div>
                      <FaFileInvoiceDollar className="portal-stat-icon" />
                    </div>

                    <div 
                      className="portal-stat stat-green" 
                      onClick={() => navigate('/renewal-due-management')} 
                      style={{ cursor: 'pointer' }}
                    >
                      <div>
                        <span className="portal-stat-value">{(renewalDueSummary.paidRequestsCount || 0)}</span>
                        <span className="portal-stat-label">Paid Renewal Requests</span>
                      </div>
                      <FaFileInvoiceDollar className="portal-stat-icon" />
                    </div>

                    <div 
                      className="portal-stat stat-violet" 
                      onClick={() => navigate('/renewal-due-management')} 
                      style={{ cursor: 'pointer' }}
                    >
                      <div>
                        <span className="portal-stat-value">{(renewalDueSummary.overdueRequestsCount || 0)}</span>
                        <span className="portal-stat-label">Overdue Requests</span>
                      </div>
                      <FaFileInvoiceDollar className="portal-stat-icon" />
                    </div>

                    <div 
                      className="portal-stat stat-amber" 
                      onClick={() => navigate('/renewal-due-management')} 
                      style={{ cursor: 'pointer' }}
                    >
                      <div>
                        <span className="portal-stat-value">₹{(renewalDueSummary.pendingDue || 0).toLocaleString()}</span>
                        <span className="portal-stat-label">Pending Renewal Amount</span>
                      </div>
                      <FaRupeeSign className="portal-stat-icon" />
                    </div>

                    <div 
                      className="portal-stat stat-green" 
                      onClick={() => navigate('/renewal-due-management')} 
                      style={{ cursor: 'pointer' }}
                    >
                      <div>
                        <span className="portal-stat-value">₹{(renewalDueSummary.paidAmount || 0).toLocaleString()}</span>
                        <span className="portal-stat-label">Paid Renewal Amount</span>
                      </div>
                      <FaRupeeSign className="portal-stat-icon" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          isOps && dueSummary ? (
            <div className="portal-panel" style={{ marginTop: '10px' }} key="due-summary-panel">
              <div className="portal-panel-header">
                <div>
                  <h2>Due & Financial Overview</h2>
                  <span>Outstanding dues and collections</span>
                </div>
                <FaFileInvoiceDollar className="portal-panel-icon" />
              </div>
              <div style={{ padding: '16px' }}>
                <div className="portal-stats-grid">
                  <div 
                    className="portal-stat stat-red" 
                    onClick={() => navigate('/due-dashboard?tab=dues&filter=PendingDues')} 
                    style={{ cursor: 'pointer', position: 'relative' }}
                  >
                    <div>
                      <span className="portal-stat-value">₹{(dueSummary.totalOutstandingAmount || 0).toLocaleString()}</span>
                      <span className="portal-stat-label">My Total Outstanding</span>
                      {dueSummary.totalOutstandingAmount > 0 && (
                        <button
                          type="button"
                          className="portal-primary"
                          style={{
                            marginTop: '8px',
                            padding: '4px 10px',
                            fontSize: '11px',
                            background: '#22c55e',
                            border: 'none',
                            color: '#ffffff',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: '600'
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate('/due-dashboard?action=pay-outstanding');
                          }}
                        >
                          Pay Now
                        </button>
                      )}
                    </div>
                    <FaRupeeSign className="portal-stat-icon" />
                  </div>

                  <div 
                    className="portal-stat stat-amber" 
                    onClick={() => navigate('/due-dashboard?tab=dues&filter=PendingDues')} 
                    style={{ cursor: 'pointer' }}
                  >
                    <div>
                      <span className="portal-stat-value">₹{(dueSummary.totalDueAmount || 0).toLocaleString()}</span>
                      <span className="portal-stat-label">My Current Due (Over 30 Days)</span>
                    </div>
                    <FaRupeeSign className="portal-stat-icon" />
                  </div>

                  <div 
                    className="portal-stat stat-violet" 
                    onClick={() => { setRevenueModalTab('today'); setIsRevenueModalOpen(true); }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div>
                      <span className="portal-stat-value">₹{(dueSummary.todaysRevenue || 0).toLocaleString()}</span>
                      <span className="portal-stat-label">Today's Revenue</span>
                    </div>
                    <FaChartLine className="portal-stat-icon" />
                  </div>
                </div>
              </div>
            </div>
          ) : null
        )}

        {(role === 'ADMIN' || role === 'SUB_DEALER') ? (
          <div className="portal-dashboard-actions" key="add-device-actions">
            <Link className="portal-dashboard-card" to="/add-device">
              <FaPlus className="portal-dashboard-card-icon" />
              <strong>Add Device</strong>
              <span>IMEI / ICCID / Serial No</span>
            </Link>
          </div>
        ) : null}

      <div className="portal-split">
        <section className="portal-panel">
          <div className="portal-panel-header">
            <div>
              <h2>Renewal Due Devices</h2>
              <span>Role: {role.replace('_', ' ')}</span>
            </div>
            <button className="portal-icon-button" type="button" onClick={() => openView('devices')} title="Open devices">
              <FaMobileAlt />
            </button>
          </div>
          <div className="portal-table-wrap dashboard-scrollable-table">
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
                {devices.map((device) => (
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
              <span>
                {user?.userType === 'Administration' ? 'Administration - Dealer - Sub Dealer' :
                 role === 'DEALER' ? 'Dealer - Sub Dealer' :
                 role === 'SUB_DEALER' ? 'Sub Dealer' :
                 'Admin - Dealer - Sub Dealer'}
              </span>
            </div>
            <FaUserShield className="portal-panel-icon" />
          </div>
          <div className="portal-hierarchy">
            {(user?.userType === 'Administration' ? ['ADMINISTRATION', 'DEALER', 'SUB DEALER'] :
              role === 'DEALER' ? ['DEALER', 'SUB DEALER'] :
              role === 'SUB_DEALER' ? ['SUB DEALER'] :
              ['ADMIN', 'DEALER', 'SUB DEALER']
            ).map((item, index) => {
              const isCurrent = 
                (user?.userType === 'Administration' && item === 'ADMINISTRATION') ||
                (user?.userType !== 'Administration' && (role.replace('_', ' ') === item));
              return (
                <div className={`hierarchy-step ${isCurrent ? 'current' : ''}`} key={item}>
                  <span>{index + 1}</span>
                  <strong>{item}</strong>
                </div>
              );
            })}
          </div>
          <div className="portal-quick-actions">
            <button type="button" onClick={() => openView(role === 'ADMIN' ? 'dealers' : 'subdealers')}>
              <FaPlus /> Add Channel User
            </button>
            <button type="button" onClick={() => openView('renewals')}>
              <FaRedo /> Renewal Requests
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

  const renderUserForm = (forcedUserType) => (
    <form className="portal-form" onSubmit={(event) => submitUser(event, forcedUserType)}>
      <div className="portal-form-grid">
        <label>
          <span>Role</span>
          <select value={forcedUserType || userForm.userType} onChange={(event) => updateUserForm('userType', event.target.value)} disabled={Boolean(forcedUserType)}>
            {isAdmin && <option value="Dealer">Dealer</option>}
            {(isAdmin || role === 'DEALER') && <option value="Sub Dealer">Sub Dealer</option>}
          </select>
        </label>
        {(forcedUserType === 'Sub Dealer' || userForm.userType === 'Sub Dealer') && isAdmin && (
          <label>
            <span>Dealer / Parent *</span>
            <select value={userForm.parentId} onChange={(event) => updateUserForm('parentId', event.target.value)} required>
              <option value="">-- Select Dealer --</option>
              {dealers.map((item) => (
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
              <th>Devices</th>
              <th>Mobile</th>
              <th>Email</th>
              <th>Status</th>
              {userRole === 'ADMIN' && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record._id}>
                <td className="strong">{getName(record)}</td>
                <td>{record.userType || 'Dealer'}</td>
                <td>
                  <span className="portal-badge secondary" style={{ fontWeight: '600' }}>
                    {record.deviceCount ?? 0}
                  </span>
                </td>
                <td>{record.mobileNo || '-'}</td>
                <td>{record.email || '-'}</td>
                <td>{renderStatus(record.status)}</td>
                {userRole === 'ADMIN' && (
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
                )}
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={userRole === 'ADMIN' ? 7 : 6} className="portal-empty">No records found.</td>
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
    const expiryDate = getExpiryDate(deviceForm.presentDate, deviceForm.validity);

    return (
      <form className="portal-form" onSubmit={addDevice}>
        <div className="portal-form-grid device-grid">
          {role === 'ADMIN' && (
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
                    assignedTo: '',
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
          )}
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
                  assignedTo: '',
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
            <span>Activation Date</span>
            <input
              type="date"
              value={deviceForm.presentDate || getLocalDateString()}
              onChange={(event) => updateDeviceForm('presentDate', event.target.value)}
              required
            />
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
          <button className="portal-primary" type="submit"><FaSave /> {role === 'DEALER' ? 'Assign Device' : 'Save Device'}</button>
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
          <span>{deviceTab === 'list' ? `${records.length} records` : `${filteredAssignments.length} records`}</span>
        </div>
        <div className="portal-header-actions">
          <div className="portal-search">
            <FaSearch />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search..." />
          </div>
          <button className="portal-icon-button" type="button" onClick={downloadDeviceReport} title="Download report">
            <FaDownload />
          </button>
        </div>
      </div>

      {/* Sub-tabs for Devices section */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', padding: '0 20px', background: 'var(--bg-card)' }}>
        <button
          type="button"
          onClick={() => setDeviceTab('list')}
          style={{
            padding: '12px 20px',
            fontSize: '13px',
            fontWeight: '700',
            border: 'none',
            background: 'none',
            color: deviceTab === 'list' ? 'var(--primary-color)' : 'var(--text-muted)',
            borderBottom: deviceTab === 'list' ? '3px solid var(--primary-color)' : '3px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          Device List
        </button>
        <button
          type="button"
          onClick={() => setDeviceTab('history')}
          style={{
            padding: '12px 20px',
            fontSize: '13px',
            fontWeight: '700',
            border: 'none',
            background: 'none',
            color: deviceTab === 'history' ? 'var(--primary-color)' : 'var(--text-muted)',
            borderBottom: deviceTab === 'history' ? '3px solid var(--primary-color)' : '3px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          Assignment History
        </button>
      </div>
      
      {/* Date Filter Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '16px 20px', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>Filter by Date:</label>
        <select 
          value={portalDateMode} 
          onChange={(e) => handlePortalDateModeChange(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '1.5px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-card)', color: 'var(--text-dark)', outline: 'none' }}
        >
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="custom">Custom Range</option>
        </select>
        {portalDateMode === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input 
              type="date" 
              value={portalFromDate} 
              onChange={(e) => setPortalFromDate(e.target.value)}
              style={{ padding: '5px 8px', fontSize: '12px', border: '1.5px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-card)', color: 'var(--text-dark)', outline: 'none' }}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>to</span>
            <input 
              type="date" 
              value={portalToDate} 
              onChange={(e) => setPortalToDate(e.target.value)}
              style={{ padding: '5px 8px', fontSize: '12px', border: '1.5px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-card)', color: 'var(--text-dark)', outline: 'none' }}
            />
          </div>
        )}
        {deviceTab === 'list' && (
          <>
            <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', marginLeft: '16px' }}>Filter by Dealer:</label>
            <select 
              value={selectedDealerFilter} 
              onChange={(e) => setSelectedDealerFilter(e.target.value)}
              style={{ padding: '6px 10px', fontSize: '12px', border: '1.5px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-card)', color: 'var(--text-dark)', outline: 'none' }}
            >
              <option value="">All Dealers</option>
              {dealersWithCounts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.count} {d.count === 1 ? 'Device' : 'Devices'})
                </option>
              ))}
            </select>
          </>
        )}
        <span style={{ marginLeft: '12px', padding: '4px 12px', background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)', color: '#ffffff', borderRadius: '20px', fontSize: '11px', fontWeight: '800', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          {deviceTab === 'list' ? `${records.length} Devices` : `${filteredAssignments.length} Assignments`}
        </span>
      </div>

      <div className="portal-table-wrap">
        {deviceTab === 'list' ? (
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
                <th>Activation Date</th>
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
        ) : (
          <table className="portal-table wide">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>IMEI</th>
                <th>Serial No</th>
                <th>Action</th>
                <th>From User</th>
                <th>To User</th>
                <th>Changed By</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssignments.map((item) => (
                <tr key={item._id}>
                  <td>{formatDate(item.entry.changedAt)}</td>
                  <td className="strong">{item.device.imei}</td>
                  <td>{item.device.serialNo || '-'}</td>
                  <td>
                    <span className={`portal-badge ${
                      item.entry.action === 'Assigned' ? 'success' :
                      item.entry.action === 'Transferred' ? 'warning' : 'danger'
                    }`}>
                      {item.entry.action}
                    </span>
                  </td>
                  <td>{getLinkedName(item.entry.fromUser) || '-'}</td>
                  <td>{getLinkedName(item.entry.toUser) || '-'}</td>
                  <td>{getLinkedName(item.entry.changedBy) || '-'}</td>
                  <td>{item.entry.note || '-'}</td>
                </tr>
              ))}
              {filteredAssignments.length === 0 && (
                <tr>
                  <td colSpan={8} className="portal-empty">No assignment records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );

  const renderDeviceManagement = () => (
    <div className="portal-stack" key="view-devices">
      {(role === 'ADMIN' || role === 'DEALER') && (
        <section className="portal-panel">
          <div className="portal-panel-header">
            <div>
              <h2>{role === 'DEALER' ? 'Assign Device to Sub Dealer' : 'Add Device'}</h2>
              <span>{role === 'DEALER' ? 'Enter device details to assign to sub dealer' : 'SIM and validity details'}</span>
            </div>
            <FaMobileAlt className="portal-panel-icon" />
          </div>
          {renderDeviceForm()}
        </section>
      )}

      {renderDevicesTable()}

      {(role === 'ADMIN' || role === 'DEALER') && (
        <div className="portal-split">
          <section className="portal-panel">
            <div className="portal-panel-header">
              <div>
                <h2>{role === 'DEALER' ? 'Bulk Assign Devices' : 'Bulk Upload Devices'}</h2>
                <span>CSV rows with IMEI, ICCID, Serial No</span>
              </div>
              <FaCloudUploadAlt className="portal-panel-icon" />
            </div>
            <form className="portal-form" onSubmit={bulkUploadDevices}>
              <label className="portal-textarea-label">
                <span>CSV Data</span>
                <textarea value={bulkText} onChange={(event) => setBulkText(event.target.value)} rows={7} placeholder="imei,iccid,serialNo,msisdn1,msisdn2,dealerName,validity,status,itrNo,vendor,presentDate" />
              </label>
              <div className="portal-actions">
                <button className="portal-primary" type="submit"><FaCloudUploadAlt /> Upload</button>
              </div>
            </form>
          </section>

          <section className="portal-panel">
            <div className="portal-panel-header">
              <div>
                <h2>{role === 'DEALER' ? 'Reassign / Transfer Device' : 'Transfer Device'}</h2>
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
              {(selectedDevice?.assignmentHistory || []).slice().reverse().slice(0, 5).map((entry, index) => (
                <div className="history-entry" key={entry._id || `history-${entry.changedAt || index}-${index}`}>
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



  const renderStatsHeader = () => {
    if (!renewalStats) return null;
    return (
      <div className="portal-report-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '20px', gap: '15px' }}>
        {[
          { label: 'Total Renewal Requests', val: renewalStats.total, color: '#3b82f6' },
          { label: 'Pending Requests', val: renewalStats.pending, color: '#f59e0b' },
          { label: 'Approved Requests', val: renewalStats.approved, color: '#10b981' },
          { label: 'Rejected Requests', val: renewalStats.rejected, color: '#ef4444' },
          { label: 'Activated Renewals', val: renewalStats.activated, color: '#8b5cf6' },
          { label: "Today's Revenue", val: `₹${renewalStats.todayRevenue}`, color: '#06b6d4' },
          { label: 'Monthly Revenue', val: `₹${renewalStats.monthlyRevenue}`, color: '#ec4899' },
        ].map(card => (
          <div key={card.label} style={{ background: '#fff', borderLeft: `5px solid ${card.color}`, padding: '15px 20px', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', display: 'block', textTransform: 'uppercase', marginBottom: '5px' }}>{card.label}</span>
            <strong style={{ fontSize: '22px', color: '#1e293b', fontWeight: '700' }}>{card.val}</strong>
          </div>
        ))}
      </div>
    );
  };

  const renderRenewals = () => (
    <div className="portal-stack" key="view-renewals">
      {renderStatsHeader()}

      {userRole === 'ADMIN' && (
        <section className="portal-panel">
        <div className="portal-panel-header">
          <div>
            <h2>{editingRenewalId ? 'Edit Renewal Request' : 'Create Renewal Request'}</h2>
            <span>Manual Entry Form</span>
          </div>
          <FaRedo className="portal-panel-icon" />
        </div>
        <form className="portal-form" onSubmit={handleSaveRenewal}>
          <div className="portal-form-grid compact" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px' }}>
            <label>
              <span>Dealer Name *</span>
              <select 
                value={renewalForm.dealerId} 
                onChange={(e) => handleRenewalFormChange('dealerId', e.target.value)}
              >
                <option value="">Select Dealer</option>
                {deviceDealerOptions.map(d => (
                  <option key={d._id} value={d._id}>{d.displayName || d.companyName || d.username}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Customer Name *</span>
              <input 
                type="text" 
                value={renewalForm.customerName} 
                onChange={(e) => handleRenewalFormChange('customerName', e.target.value)} 
                required 
              />
            </label>

            <label>
              <span>Customer Mobile Number *</span>
              <input 
                type="number" 
                value={renewalForm.customerMobile} 
                onChange={(e) => handleRenewalFormChange('customerMobile', e.target.value)} 
                required 
              />
            </label>

            <label>
              <span>IMEI Number *</span>
              <input 
                type="number" 
                value={renewalForm.imei} 
                onChange={(e) => handleRenewalFormChange('imei', e.target.value)} 
                required 
              />
            </label>

            <label>
              <span>Vehicle Number *</span>
              <input 
                type="text" 
                value={renewalForm.vehicleNumber} 
                onChange={(e) => handleRenewalFormChange('vehicleNumber', e.target.value)} 
                required 
              />
            </label>

            <label>
              <span>Device Model *</span>
              <select 
                value={renewalForm.deviceModel} 
                onChange={(e) => handleRenewalFormChange('deviceModel', e.target.value)}
              >
                <option value="">Select Model</option>
                {(userRole === 'ADMIN') && <option value="iTriangle">iTriangle</option>}
                <option value="Acute">Acute</option>
                <option value="Markon">Markon</option>
                <option value="RDM">RDM</option>
                <option value="BB">BB</option>
                <option value="TrackNow">TrackNow</option>
                <option value="Road point">Road point</option>
              </select>
            </label>

            <label>
              <span>Activation Type *</span>
              <select 
                value={renewalForm.activationType} 
                onChange={(e) => handleRenewalFormChange('activationType', e.target.value)}
                required
              >
                <option value="NIC">NIC</option>
                <option value="MINING">MINING</option>
              </select>
            </label>

            <label>
              <span>Product Description *</span>
              <select 
                value={renewalForm.productDescription} 
                onChange={(e) => handleRenewalFormChange('productDescription', e.target.value)}
              >
                <option value="">Select Product</option>
                <option value="VLTD RENEWAL">VLTD RENEWAL</option>
                <option value="GPS RENEWAL">GPS RENEWAL</option>
                <option value="Renewal">Renewal</option>
              </select>
            </label>

            <label>
              <span>Validity *</span>
              <select 
                value={renewalForm.validity} 
                onChange={(e) => handleRenewalFormChange('validity', e.target.value)}
              >
                <option value="1 Year">1 Year</option>
                <option value="2 Years">2 Years</option>
              </select>
            </label>

            <label>
              <span>Renewal Date *</span>
              <input 
                type="date" 
                value={renewalForm.renewalDate} 
                onChange={(e) => handleRenewalFormChange('renewalDate', e.target.value)} 
                required 
              />
            </label>

            <label>
              <span>New Expiry Date (calculated)</span>
              <input 
                type="text" 
                value={renewalForm.newExpiryDate} 
                readOnly 
                style={{ background: '#f1f5f9', cursor: 'not-allowed' }}
              />
            </label>

            <label>
              <span>Bill Amount *</span>
              <input 
                type="number" 
                value={renewalForm.billAmount} 
                onChange={(e) => handleRenewalFormChange('billAmount', e.target.value)} 
                required 
              />
            </label>

            <label style={{ gridColumn: 'span 2' }}>
              <span>Remarks</span>
              <textarea 
                value={renewalForm.remarks} 
                onChange={(e) => handleRenewalFormChange('remarks', e.target.value)} 
                style={{ width: '100%', minHeight: '60px', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
              />
            </label>
          </div>
          <div className="portal-actions" style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
            <button className="portal-primary" type="submit">
              <FaRedo /> {editingRenewalId ? 'SAVE CHANGES' : 'SAVE RENEWAL REQUEST'}
            </button>
            {editingRenewalId && (
              <button 
                type="button" 
                onClick={() => {
                  setEditingRenewalId(null);
                  setRenewalForm({
                    dealerId: '',
                    customerName: '',
                    customerMobile: '',
                    imei: '',
                    vehicleNumber: '',
                    deviceModel: '',
                    productDescription: '',
                    validity: '1 Year',
                    renewalDate: new Date().toISOString().split('T')[0],
                    newExpiryDate: calculateNewExpiryDate(new Date().toISOString().split('T')[0], '1 Year'),
                    billAmount: '',
                    paymentMode: 'Cash',
                    remarks: '',
                  });
                }}
                style={{ background: '#64748b', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}
              >
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </section>
      )}

      <section className="portal-panel" style={{ borderTop: '4px solid #3b82f6', background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05), 0 4px 6px -2px rgba(0,0,0,0.02)', borderRadius: '12px', marginBottom: '20px' }}>
        <div className="portal-panel-header" style={{ background: 'transparent', borderBottom: '1px solid #e2e8f0', padding: '18px 24px' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px' }}>Filters & Search</h2>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>Refine your renewal list dynamically</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {Object.values(renewalFilters).some(v => v !== '') && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#ecfdf5', color: '#059669', fontSize: '11px', fontWeight: '600', padding: '4px 10px', borderRadius: '9999px', border: '1px solid #a7f3d0' }}>
                <span style={{ display: 'inline-block', width: '6px', height: '6px', background: '#10b981', borderRadius: '50%', animation: 'pulse 1.5s infinite' }}></span>
                Filters Active
              </span>
            )}
            <FaSearch style={{ width: '18px', height: '18px', color: '#3b82f6' }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', padding: '24px' }}>
          {[
            ...(userRole === 'ADMIN' ? [{
              label: 'Dealer',
              element: (
                <select 
                  value={renewalFilters.dealerId}
                  onChange={(e) => setRenewalFilters(current => ({ ...current, dealerId: e.target.value }))}
                  className="fancy-filter-input"
                >
                  <option value="">All Dealers</option>
                  {deviceDealerOptions.map(d => (
                    <option key={d._id} value={d._id}>{d.displayName || d.companyName || d.username}</option>
                  ))}
                </select>
              )
            }] : []),
            {
              label: 'Status',
              element: (
                <select 
                  value={renewalFilters.status}
                  onChange={(e) => setRenewalFilters(current => ({ ...current, status: e.target.value }))}
                  className="fancy-filter-input"
                >
                  <option value="">All Statuses</option>
                  <option value="Requested">Requested</option>
                  <option value="Under Review">Under Review</option>
                  <option value="Approved">Approved</option>
                  <option value="Activated">Activated</option>
                  <option value="Completed">Completed</option>
                  <option value="Rejected">Rejected</option>
                </select>
              )
            },
            {
              label: 'Customer Name',
              element: (
                <input 
                  type="text" 
                  value={renewalFilters.customerName}
                  onChange={(e) => setRenewalFilters(current => ({ ...current, customerName: e.target.value }))}
                  placeholder="Search customer..."
                  className="fancy-filter-input"
                />
              )
            },
            {
              label: 'IMEI',
              element: (
                <input 
                  type="text" 
                  value={renewalFilters.imei}
                  onChange={(e) => setRenewalFilters(current => ({ ...current, imei: e.target.value }))}
                  placeholder="Search IMEI..."
                  className="fancy-filter-input"
                />
              )
            },
            {
              label: 'Vehicle Number',
              element: (
                <input 
                  type="text" 
                  value={renewalFilters.vehicleNumber}
                  onChange={(e) => setRenewalFilters(current => ({ ...current, vehicleNumber: e.target.value }))}
                  placeholder="Search vehicle..."
                  className="fancy-filter-input"
                />
              )
            },
            {
              label: 'From Date',
              element: (
                <input 
                  type="date" 
                  value={renewalFilters.fromDate}
                  onChange={(e) => setRenewalFilters(current => ({ ...current, fromDate: e.target.value }))}
                  className="fancy-filter-input"
                />
              )
            },
            {
              label: 'To Date',
              element: (
                <input 
                  type="date" 
                  value={renewalFilters.toDate}
                  onChange={(e) => setRenewalFilters(current => ({ ...current, toDate: e.target.value }))}
                  className="fancy-filter-input"
                />
              )
            }
          ].map(field => (
            <div key={field.label} style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#475569', letterSpacing: '0.05em', marginBottom: '8px' }}>{field.label}</span>
              {field.element}
            </div>
          ))}
        </div>
        <div style={{ padding: '0 24px 24px 24px', display: 'flex', justifyContent: 'flex-start' }}>
          <button 
            type="button" 
            onClick={() => setRenewalFilters({
              dealerId: '',
              status: '',
              customerName: '',
              imei: '',
              vehicleNumber: '',
              fromDate: '',
              toDate: '',
            })}
            style={{ 
              background: '#ffffff', 
              border: '1px solid #cbd5e1', 
              color: '#475569', 
              padding: '10px 20px', 
              fontWeight: '600', 
              borderRadius: '8px', 
              fontSize: '13px', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '8px', 
              transition: 'all 0.2s ease', 
              cursor: 'pointer',
              boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#f8fafc';
              e.currentTarget.style.color = '#0f172a';
              e.currentTarget.style.borderColor = '#94a3b8';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = '#ffffff';
              e.currentTarget.style.color = '#475569';
              e.currentTarget.style.borderColor = '#cbd5e1';
            }}
          >
            <FaTimes /> Reset Filters
          </button>
        </div>
      </section>

      <section className="portal-panel">
        <div className="portal-panel-header">
          <div>
            <h2>Renewal Requests</h2>
            <span>{renewals.length} records found</span>
          </div>
          <FaHistory className="portal-panel-icon" />
        </div>
        {selectedRenewalIds.length > 0 && (
          <div style={{
            background: '#eff6ff',
            borderBottom: '1px solid #bfdbfe',
            padding: '12px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#1e40af' }}>
              {selectedRenewalIds.length} Renewal Requests selected for bulk payment
            </span>
            <button
              type="button"
              onClick={handleOpenBulkPayment}
              style={{
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}
            >
              Pay Selected Dues
            </button>
          </div>
        )}
        <div className="portal-table-wrap" style={{ overflowX: 'auto' }}>
          <table className="portal-table" style={{ width: '100%', minWidth: '1600px' }}>
            <thead>
              <tr>
                {userRole !== 'ADMIN' && (
                  <th style={{ width: '40px', textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      onChange={handleSelectAllRenewals} 
                      checked={
                        renewals.slice((renewalPage - 1) * renewalLimit, renewalPage * renewalLimit)
                          .filter(r => r.paymentStatus !== 'Paid' && r.status !== 'Rejected').length > 0 &&
                        renewals.slice((renewalPage - 1) * renewalLimit, renewalPage * renewalLimit)
                          .filter(r => r.paymentStatus !== 'Paid' && r.status !== 'Rejected')
                          .every(r => selectedRenewalIds.includes(r._id))
                      } 
                    />
                  </th>
                )}
                <th>Request ID</th>
                {userRole === 'ADMIN' && <th>Dealer</th>}
                <th>Customer Name</th>
                <th>IMEI</th>
                <th>Vehicle Number</th>
                <th>Device Model</th>
                {userRole === 'ADMIN' && <th>Activation Type</th>}
                {userRole === 'ADMIN' && <th>Product</th>}
                <th>Validity</th>
                <th>Bill Amount</th>
                <th>Received Amount</th>
                <th>Remaining Due</th>
                <th>Payment Status</th>
                <th>Renewal Status</th>
                <th>Renewal Date</th>
                <th>New Expiry Date</th>
                <th>Remarks</th>
                {userRole === 'ADMIN' && <th>Created By</th>}
                {userRole === 'ADMIN' && <th>Created Date</th>}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {renewals.slice((renewalPage - 1) * renewalLimit, renewalPage * renewalLimit).map((renewal) => (
                <tr key={renewal._id}>
                  {userRole !== 'ADMIN' && (
                    <td style={{ textAlign: 'center' }}>
                      {renewal.paymentStatus !== 'Paid' && renewal.status !== 'Rejected' ? (
                        <input 
                          type="checkbox" 
                          checked={selectedRenewalIds.includes(renewal._id)} 
                          onChange={() => handleSelectRenewal(renewal._id)} 
                        />
                      ) : (
                        '-'
                      )}
                    </td>
                  )}
                  <td className="strong" style={{ color: '#3b82f6' }}>{renewal.requestId}</td>
                  {userRole === 'ADMIN' && <td>{renewal.dealerName}</td>}
                  <td>{renewal.customerName}</td>
                  <td>{renewal.imei}</td>
                  <td>{renewal.vehicleNumber}</td>
                  <td>{renewal.deviceModel}</td>
                  {userRole === 'ADMIN' && <td>{renewal.activationType || '-'}</td>}
                  {userRole === 'ADMIN' && <td>{renewal.productDescription}</td>}
                  <td>{renewal.validity}</td>
                  <td className="strong">₹{(renewal.billAmount || 0).toLocaleString()}</td>
                  <td>₹{(renewal.receivedAmount || 0).toLocaleString()}</td>
                  <td className="strong" style={{ color: (renewal.remainingDue || 0) > 0 ? '#ef4444' : '#10b981' }}>₹{(renewal.remainingDue || 0).toLocaleString()}</td>
                  <td>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      background: renewal.paymentStatus === 'Paid' ? '#d1fae5' : renewal.paymentStatus === 'Partially Paid' ? '#fef3c7' : '#fee2e2',
                      color: renewal.paymentStatus === 'Paid' ? '#065f46' : renewal.paymentStatus === 'Partially Paid' ? '#92400e' : '#991b1b',
                    }}>
                      {renewal.paymentStatus || 'Pending'}
                    </span>
                  </td>
                  <td>
                    {userRole === 'ADMIN' ? (
                      <select 
                        value={renewal.status} 
                        onChange={(e) => handleStatusChange(renewal._id, e.target.value)}
                        style={{ padding: '4px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: '600' }}
                      >
                        <option value="Requested">Requested</option>
                        <option value="Under Review">Under Review</option>
                        <option value="Approved">Approved</option>
                        <option value="Activated">Activated</option>
                        <option value="Completed">Completed</option>
                        <option value="Rejected">Rejected</option>
                      </select>
                    ) : (
                      renderStatus(renewal.status)
                    )}
                  </td>
                  <td>{formatDate(renewal.renewalDate)}</td>
                  <td>{formatDate(renewal.newExpiryDate)}</td>
                  <td>{renewal.remarks || '-'}</td>
                  {userRole === 'ADMIN' && <td>{renewal.userId?.displayName || renewal.userId?.username || 'System'}</td>}
                  {userRole === 'ADMIN' && <td>{formatDate(renewal.createdAt)}</td>}
                  <td>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button 
                        type="button" 
                        title="View Details" 
                        onClick={() => setViewingRenewal(renewal)}
                        style={{ padding: '6px 8px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}
                      >
                        View
                      </button>
                      {userRole !== 'ADMIN' && renewal.paymentStatus !== 'Paid' && renewal.status !== 'Rejected' && (
                        <button 
                          type="button" 
                          title="Report Payment" 
                          onClick={() => handleOpenReportPayment(renewal)}
                          style={{ padding: '6px 8px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}
                        >
                          Pay
                        </button>
                      )}
                      {renewal.screenshotUrl && (
                        <a 
                          href={`${(api.defaults.baseURL || '').replace(/\/api$/, '')}${renewal.screenshotUrl}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ 
                            padding: '6px 8px', 
                            background: '#8b5cf6', 
                            color: '#fff', 
                            textDecoration: 'none', 
                            borderRadius: '4px', 
                            fontSize: '11px', 
                            fontWeight: '600',
                            display: 'inline-flex',
                            alignItems: 'center'
                          }}
                        >
                          Proof
                        </a>
                      )}
                      {userRole === 'ADMIN' && (
                        <>
                          <button 
                            type="button" 
                            title="Edit" 
                            onClick={() => handleEditRenewalClick(renewal)}
                            style={{ padding: '6px 8px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}
                          >
                            Edit
                          </button>
                          <button 
                            type="button" 
                            title="Delete" 
                            onClick={() => handleDeleteRenewal(renewal._id)}
                            style={{ padding: '6px 8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                      <button 
                        type="button" 
                        title="Print Invoice" 
                        onClick={() => handlePrintInvoice(renewal)}
                        style={{ padding: '6px 8px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}
                      >
                        Print Invoice
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {renewals.length === 0 && (
                <tr>
                  <td colSpan={16} className="portal-empty">No renewal records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {renewals.length > 0 && (
          <div style={{ padding: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #cbd5e1' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Show</span>
              <select 
                value={renewalLimit} 
                onChange={(e) => { setRenewalLimit(Number(e.target.value)); setRenewalPage(1); }}
                style={{ padding: '4px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span>entries</span>
            </div>
            <div style={{ display: 'flex', gap: '5px' }}>
              <button 
                type="button" 
                disabled={renewalPage === 1}
                onClick={() => setRenewalPage(p => p - 1)}
                style={{ padding: '6px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: renewalPage === 1 ? 'not-allowed' : 'pointer' }}
              >
                Previous
              </button>
              <span style={{ padding: '6px 12px' }}>Page {renewalPage} of {Math.ceil(renewals.length / renewalLimit)}</span>
              <button 
                type="button" 
                disabled={renewalPage >= Math.ceil(renewals.length / renewalLimit)}
                onClick={() => setRenewalPage(p => p + 1)}
                style={{ padding: '6px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: renewalPage >= Math.ceil(renewals.length / renewalLimit) ? 'not-allowed' : 'pointer' }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );

  const renderReports = () => (
    <div className="portal-stack" key="view-reports">
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
    <div className="portal-stack" key="view-profile">
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

      </section>
    </div>
  );

  const renderContent = () => {
    if (loading) return <div className="portal-loading">Loading portal data...</div>;
    if (error) return <div className="portal-error">{error}</div>;

    if (role === 'SUB_DEALER' && ['subdealers', 'users', 'dealers', 'customers', 'devices'].includes(activeView)) {
      return renderDashboard();
    }

    if (role !== 'ADMIN' && activeView === 'dealers') {
      return renderDashboard();
    }

    if (activeView === 'dealers') return renderDealerManagement(false);
    if (activeView === 'subdealers') return renderDealerManagement(true);
    if (activeView === 'users') return renderUserManagement();
    if (activeView === 'devices') return renderDeviceManagement();
    if (activeView === 'reports') return renderReports();
    if (activeView === 'profile') return renderProfile();
    if (activeView === 'renewals') return renderRenewals();
    return renderDashboard();
  };

  return (
    <div className="portal-page">
      {notice ? <div className="portal-notice">{notice}</div> : null}

      <div className="portal-titlebar">
        <div>
          <span className="portal-kicker">Customer Database &amp; Device Management Portal</span>
          <h1>{viewTitles[activeView] || 'Dashboard'}</h1>
        </div>
        <div className="portal-title-actions">
          <button type="button" className={activeView === 'dashboard' ? 'active' : ''} onClick={() => openView('dashboard')}>Dashboard</button>
          {role !== 'SUB_DEALER' && (
            <button type="button" className={activeView === 'devices' ? 'active' : ''} onClick={() => openView('devices')}>Devices</button>
          )}
          <button type="button" className={activeView === 'renewals' ? 'active' : ''} onClick={() => openView('renewals')}>Renewals</button>
        </div>
      </div>

      <div key={activeView} className="portal-view-container">
        {renderContent()}
      </div>

      {editUser ? (
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
      ) : null}

      <RevenueBreakdownModal 
        isOpen={isRevenueModalOpen}
        onClose={() => setIsRevenueModalOpen(false)}
        initialTab={revenueModalTab}
      />

      {viewingRenewal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0, 0, 0, 0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '500px', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1', paddingBottom: '10px', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>Renewal Request Details</h3>
              <button 
                type="button" 
                onClick={() => setViewingRenewal(null)} 
                style={{ background: 'none', border: 'none', fontSize: '24px', lineHeight: '1', cursor: 'pointer', color: '#64748b' }}
              >
                &times;
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
              {[
                ['Request ID', viewingRenewal.requestId],
                ['Dealer Name', viewingRenewal.dealerName],
                ['Customer Name', viewingRenewal.customerName],
                ['Customer Mobile', viewingRenewal.customerMobile],
                ['IMEI Number', viewingRenewal.imei],
                ['Vehicle Number', viewingRenewal.vehicleNumber],
                ['Device Model', viewingRenewal.deviceModel],
                ['Activation Type', viewingRenewal.activationType || '-'],
                ['Product Description', viewingRenewal.productDescription],
                ['Validity', viewingRenewal.validity],
                ['Renewal Date', formatDate(viewingRenewal.renewalDate)],
                ['New Expiry Date', formatDate(viewingRenewal.newExpiryDate)],
                ['Bill Amount', `₹${viewingRenewal.billAmount}`],
                ['Received Amount', `₹${viewingRenewal.receivedAmount || 0}`],
                ['Remaining Due', `₹${viewingRenewal.billAmount - (viewingRenewal.receivedAmount || 0)}`],
                ['Payment Mode', viewingRenewal.paymentMode || '-'],
                ['Transaction ID', viewingRenewal.transactionId || '-'],
                ['Payment Date', viewingRenewal.paymentDate ? formatDate(viewingRenewal.paymentDate) : '-'],
                ['Status', viewingRenewal.status],
                ['Remarks', viewingRenewal.remarks || '-'],
                ['Created Date', formatDate(viewingRenewal.createdAt)],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '5px' }}>
                  <span style={{ color: '#64748b', fontSize: '13px' }}>{label}:</span>
                  <strong style={{ color: '#1e293b', fontSize: '13px' }}>{val}</strong>
                </div>
              ))}
              
              {viewingRenewal.screenshotUrl && (
                <div style={{ marginTop: '15px', borderTop: '1px solid #cbd5e1', paddingTop: '15px' }}>
                  <strong style={{ fontSize: '13px', color: '#475569', display: 'block', marginBottom: '8px' }}>Uploaded Screenshot Proof:</strong>
                  <a 
                    href={`${(api.defaults.baseURL || '').replace(/\/api$/, '')}${viewingRenewal.screenshotUrl}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ display: 'block', width: '100%', textAlign: 'center' }}
                  >
                    <img 
                      src={`${(api.defaults.baseURL || '').replace(/\/api$/, '')}${viewingRenewal.screenshotUrl}`} 
                      alt="Payment Receipt Screenshot" 
                      style={{ maxWidth: '100%', maxHeight: '220px', borderRadius: '6px', border: '1px solid #cbd5e1', objectFit: 'contain', cursor: 'pointer' }}
                      title="Click to view full size"
                    />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dealer Report Payment Modal for Renewal Requests */}
      {reportPaymentRenewal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0, 0, 0, 0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '500px', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1', paddingBottom: '10px', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>Report Renewal Payment</h3>
              <button 
                type="button" 
                onClick={() => setReportPaymentRenewal(null)} 
                style={{ background: 'none', border: 'none', fontSize: '24px', lineHeight: '1', cursor: 'pointer', color: '#64748b' }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleRenewalPaymentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Request ID</span>
                  <strong style={{ fontSize: '14px', color: '#1e293b' }}>{reportPaymentRenewal.requestId}</strong>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Outstanding Due</span>
                  <strong style={{ fontSize: '16px', color: '#ef4444' }}>
                    ₹{(reportPaymentRenewal.billAmount - (reportPaymentRenewal.receivedAmount || 0)).toLocaleString()}
                  </strong>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Paid Amount *</span>
                <input 
                  type="number" 
                  value={renewalPaymentForm.receivedAmount} 
                  onChange={(e) => setRenewalPaymentForm(current => ({ ...current, receivedAmount: e.target.value }))}
                  placeholder="Enter amount paid..."
                  style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 12px', fontSize: '13px' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Payment Mode *</span>
                <select 
                  value={renewalPaymentForm.paymentMode} 
                  onChange={(e) => setRenewalPaymentForm(current => ({ ...current, paymentMode: e.target.value }))}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 12px', fontSize: '13px' }}
                  required
                >
                  <option value="UPI">UPI</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="NEFT">NEFT</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>
                  Transaction ID / Reference Number {renewalPaymentForm.paymentMode === 'UPI' ? '*' : '(Optional)'}
                </span>
                <input 
                  type="text" 
                  value={renewalPaymentForm.transactionId} 
                  onChange={(e) => setRenewalPaymentForm(current => ({ 
                    ...current, 
                    transactionId: renewalPaymentForm.paymentMode === 'UPI' ? e.target.value.replace(/\D/g, '') : e.target.value 
                  }))}
                  placeholder={renewalPaymentForm.paymentMode === 'UPI' ? "Enter 12-digit UPI UTR / Reference No." : "Enter transaction or reference ID..."}
                  maxLength={renewalPaymentForm.paymentMode === 'UPI' ? 12 : undefined}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 12px', fontSize: '13px' }}
                  required={renewalPaymentForm.paymentMode === 'UPI'}
                />
                {renewalPaymentForm.paymentMode === 'UPI' && (
                  <span style={{ fontSize: '10px', color: '#dc2626', marginTop: '2px', fontWeight: '600' }}>
                    UPI reference number (UTR) must be exactly 12 numeric digits.
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Payment Date *</span>
                <input 
                  type="date" 
                  value={renewalPaymentForm.paymentDate} 
                  onChange={(e) => setRenewalPaymentForm(current => ({ ...current, paymentDate: e.target.value }))}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 12px', fontSize: '13px' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>
                  Upload Screenshot Proof {renewalPaymentForm.paymentMode === 'UPI' && <span style={{ color: 'red' }}>*</span>}
                </span>
                <input 
                  type="file" 
                  accept="image/*,application/pdf"
                  onChange={(e) => setRenewalScreenshot(e.target.files[0])}
                  style={{ fontSize: '12px' }}
                  required={renewalPaymentForm.paymentMode === 'UPI'}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Remarks</span>
                <textarea 
                  value={renewalPaymentForm.remarks} 
                  onChange={(e) => setRenewalPaymentForm(current => ({ ...current, remarks: e.target.value }))}
                  placeholder="Add payment reference details..."
                  style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', minHeight: '60px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="submit" disabled={submittingRenewalPayment} style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: '600', cursor: submittingRenewalPayment ? 'not-allowed' : 'pointer' }}>
                  {submittingRenewalPayment ? 'Submitting...' : 'Submit Payment Proof'}
                </button>
                <button type="button" onClick={() => setReportPaymentRenewal(null)} style={{ flex: 1, background: '#64748b', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dealer Bulk Report Payment Modal */}
      {isBulkPaymentModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0, 0, 0, 0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '500px', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1', paddingBottom: '10px', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>Report Bulk Renewal Payment</h3>
              <button 
                type="button" 
                onClick={() => setIsBulkPaymentModalOpen(false)} 
                style={{ background: 'none', border: 'none', fontSize: '24px', lineHeight: '1', cursor: 'pointer', color: '#64748b' }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleSaveBulkPayment} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Selected Requests</span>
                  <strong style={{ fontSize: '14px', color: '#1e293b' }}>{selectedRenewalIds.length} Requests</strong>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Total Outstanding</span>
                  <strong style={{ fontSize: '16px', color: '#ef4444' }}>
                    ₹{(renewals.filter(r => selectedRenewalIds.includes(r._id)).reduce((sum, r) => sum + (r.remainingDue || 0), 0)).toLocaleString()}
                  </strong>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Paid Amount *</span>
                <input 
                  type="number" 
                  value={bulkPaymentForm.receivedAmount} 
                  onChange={(e) => setBulkPaymentForm(current => ({ ...current, receivedAmount: e.target.value }))}
                  placeholder="Enter amount paid..."
                  style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 12px', fontSize: '13px' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Payment Mode *</span>
                <select 
                  value={bulkPaymentForm.paymentMode} 
                  onChange={(e) => setBulkPaymentForm(current => ({ ...current, paymentMode: e.target.value }))}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 12px', fontSize: '13px' }}
                  required
                >
                  <option value="UPI">UPI</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="NEFT">NEFT</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>
                  Transaction ID / Reference Number {bulkPaymentForm.paymentMode === 'UPI' ? '*' : '(Optional)'}
                </span>
                <input 
                  type="text" 
                  value={bulkPaymentForm.transactionId} 
                  onChange={(e) => setBulkPaymentForm(current => ({ 
                    ...current, 
                    transactionId: bulkPaymentForm.paymentMode === 'UPI' ? e.target.value.replace(/\D/g, '') : e.target.value 
                  }))}
                  placeholder={bulkPaymentForm.paymentMode === 'UPI' ? "Enter 12-digit UPI UTR / Reference No." : "Enter transaction or reference ID..."}
                  maxLength={bulkPaymentForm.paymentMode === 'UPI' ? 12 : undefined}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 12px', fontSize: '13px' }}
                  required={bulkPaymentForm.paymentMode === 'UPI'}
                />
                {bulkPaymentForm.paymentMode === 'UPI' && (
                  <span style={{ fontSize: '10px', color: '#dc2626', marginTop: '2px', fontWeight: '600' }}>
                    UPI reference number (UTR) must be exactly 12 numeric digits.
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Payment Date *</span>
                <input 
                  type="date" 
                  value={bulkPaymentForm.paymentDate} 
                  onChange={(e) => setBulkPaymentForm(current => ({ ...current, paymentDate: e.target.value }))}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 12px', fontSize: '13px' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>
                  Upload Screenshot Proof {bulkPaymentForm.paymentMode === 'UPI' && <span style={{ color: 'red' }}>*</span>}
                </span>
                <input 
                  type="file" 
                  accept="image/*,application/pdf"
                  onChange={(e) => setBulkScreenshot(e.target.files[0])}
                  style={{ fontSize: '12px' }}
                  required={bulkPaymentForm.paymentMode === 'UPI'}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Remarks</span>
                <textarea 
                  value={bulkPaymentForm.remarks} 
                  onChange={(e) => setBulkPaymentForm(current => ({ ...current, remarks: e.target.value }))}
                  placeholder="Add payment reference details..."
                  style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', minHeight: '60px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="submit" disabled={submittingBulkPayment} style={{ flex: 1, background: '#2563eb', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: '600', cursor: submittingBulkPayment ? 'not-allowed' : 'pointer' }}>
                  {submittingBulkPayment ? 'Submitting...' : 'Submit Bulk Payment'}
                </button>
                <button type="button" onClick={() => setIsBulkPaymentModalOpen(false)} style={{ flex: 1, background: '#64748b', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerDevicePortal;
