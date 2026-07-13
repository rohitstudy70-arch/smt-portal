import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import {
  FaRupeeSign,
  FaUsers,
  FaCalendarAlt,
  FaHistory,
  FaCoins,
  FaDownload,
  FaSearch,
  FaFilter,
  FaChevronLeft,
  FaChevronRight,
  FaTimes,
  FaSyncAlt,
  FaUserTie,
  FaMobileAlt,
  FaFileInvoiceDollar,
} from 'react-icons/fa';
import './DueDashboard.css';

const getLocalDatetimeString = (dateObj) => {
  const d = dateObj ? new Date(dateObj) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const DueDashboard = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const activeTab = params.get('tab') || 'dues';

  const userRole = user?.role === 'partner' ? 'ADMIN' : user?.userType === 'Administration' ? 'ADMIN' : user?.userType === 'Sub Dealer' ? 'SUB_DEALER' : 'DEALER';
  const isAdmin = userRole === 'ADMIN';
  const isListView = isAdmin || userRole === 'DEALER';

  // State definitions
  const [summary, setSummary] = useState(null);
  const [renewalSummary, setRenewalSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Dues tab state
  const [duesList, setDuesList] = useState([]);
  const [totalDues, setTotalDues] = useState(0);
  const [duesPage, setDuesPage] = useState(1);
  const [duesPages, setDuesPages] = useState(1);
  const [duesFilters, setDuesFilters] = useState({
    search: '',
    status: 'all',
    accountType: 'all',
  });

  // Renewal Due tab state
  const [renewalsList, setRenewalsList] = useState([]);
  const [totalRenewals, setTotalRenewals] = useState(0);
  const [renewalsPage, setRenewalsPage] = useState(1);
  const [renewalsPages, setRenewalsPages] = useState(1);
  const [renewalsFilters, setRenewalsFilters] = useState({
    search: '',
    dealer: '',
    subDealer: '',
    customer: '',
    expiryMonth: '',
    deviceStatus: 'all',
  });

  // Received Payment Modal
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedDealerDue, setSelectedDealerDue] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentMode: 'UPI',
    paymentDate: new Date().toISOString().split('T')[0],
    remarks: '',
    referenceNumber: '',
  });
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Edit Payment Modal State
  const [editPaymentModalOpen, setEditPaymentModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [editPaymentForm, setEditPaymentForm] = useState({
    paymentDate: '',
    amount: '',
    paymentMode: 'Cash',
    referenceNumber: '',
    remarks: '',
  });

  // Dealer Details View Modal
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [detailsData, setDetailsData] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Export panel filters
  const [exportFilters, setExportFilters] = useState({
    fromDate: '',
    toDate: '',
    paymentMode: '',
  });

  // Dealer Report Payment States
  const [reportPaymentModalOpen, setReportPaymentModalOpen] = useState(false);
  const [reportForm, setReportForm] = useState({
    amount: '',
    paymentMode: 'UPI',
    referenceNumber: '',
    remarks: '',
    paymentDate: getLocalDatetimeString(),
  });
  const [selectedScreenshot, setSelectedScreenshot] = useState(null);
  const [selectedPaymentScreenshot, setSelectedPaymentScreenshot] = useState(null);
  const [submittingReportPayment, setSubmittingReportPayment] = useState(false);
  const [verificationRequests, setVerificationRequests] = useState([]);
  const [selfListTab, setSelfListTab] = useState('payments'); // 'payments' or 'requests'
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Admin Immediate Renewal States
  const [renewDevice, setRenewDevice] = useState(null);
  const [renewValidity, setRenewValidity] = useState('1 Year');
  const [renewing, setRenewing] = useState(false);

  // Admin Verification States
  const [adminVerificationRequests, setAdminVerificationRequests] = useState([]);
  const [verificationSubTab, setVerificationSubTab] = useState('requests'); // 'requests' or 'collections'
  const [adminPayments, setAdminPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [collectionsSearch, setCollectionsSearch] = useState('');
  const [verificationFilters, setVerificationFilters] = useState({
    status: 'all',
    dateRange: 'all',
    fromDate: '',
    toDate: '',
  });
  const [verifyPaymentModalOpen, setVerifyPaymentModalOpen] = useState(false);
  const [selectedVerificationRequest, setSelectedVerificationRequest] = useState(null);
  const [verifyForm, setVerifyForm] = useState({
    adminRemarks: '',
  });
  const [submittingVerify, setSubmittingVerify] = useState(false);

  const showNotice = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 4000);
  };

  // Fetch summary metrics
  const fetchSummary = useCallback(async () => {
    try {
      const [res, renewalRes] = await Promise.all([
        api.get('/due-dashboard/summary'),
        api.get('/portal/renewals/due-summary').catch(() => ({ data: null })),
      ]);
      setSummary(res.data);
      setRenewalSummary(renewalRes?.data || null);
    } catch (err) {
      console.error('Error fetching due summary:', err);
      setError('Failed to load summary statistics.');
    }
  }, []);

  // Fetch Dues List (for Admin/Dealer)
  const fetchDues = useCallback(async () => {
    if (!isListView) return;
    try {
      setLoading(true);
      const res = await api.get('/due-dashboard/dealers', {
        params: {
          page: duesPage,
          limit: 10,
          search: duesFilters.search,
          status: duesFilters.status,
          accountType: duesFilters.accountType,
        },
      });
      setDuesList(res.data.dues || []);
      setTotalDues(res.data.total || 0);
      setDuesPages(res.data.pages || 1);
    } catch (err) {
      console.error('Error fetching dues list:', err);
      setError('Failed to load dealer dues list.');
    } finally {
      setLoading(false);
    }
  }, [isListView, duesPage, duesFilters]);

  // Fetch Renewal Due Devices
  const fetchRenewals = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/due-dashboard/renewal-due-devices', {
        params: {
          page: renewalsPage,
          limit: 10,
          search: renewalsFilters.search,
          dealer: renewalsFilters.dealer,
          subDealer: renewalsFilters.subDealer,
          customer: renewalsFilters.customer,
          expiryMonth: renewalsFilters.expiryMonth,
          deviceStatus: renewalsFilters.deviceStatus,
        },
      });
      setRenewalsList(res.data.devices || []);
      setTotalRenewals(res.data.total || 0);
      setRenewalsPages(res.data.pages || 1);
    } catch (err) {
      console.error('Error fetching renewal due list:', err);
      setError('Failed to load renewal due devices.');
    } finally {
      setLoading(false);
    }
  }, [renewalsPage, renewalsFilters]);

  // Fetch Self Due Information (for Sub Dealer)
  const fetchSelfDetails = useCallback(async () => {
    if (isListView) return;
    try {
      setLoading(true);
      const res = await api.get(`/due-dashboard/dealers/${user._id}`);
      setDetailsData(res.data);
    } catch (err) {
      console.error('Error fetching self due details:', err);
      setError('Failed to load due details.');
    } finally {
      setLoading(false);
    }
  }, [isListView, user._id]);

  // Fetch Verification Requests for Sub Dealer self view
  const fetchVerificationRequests = useCallback(async () => {
    if (isListView) return;
    try {
      setLoadingRequests(true);
      const res = await api.get('/payment-verification-requests');
      setVerificationRequests(res.data || []);
    } catch (err) {
      console.error('Error fetching verification requests:', err);
    } finally {
      setLoadingRequests(false);
    }
  }, [isListView]);

  // Fetch Verification Requests for Admin view
  const fetchAdminVerificationRequests = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setLoadingRequests(true);
      const params = {};
      if (verificationFilters.status !== 'all') {
        params.status = verificationFilters.status;
      }
      const res = await api.get('/payment-verification-requests', { params });
      setAdminVerificationRequests(res.data || []);
    } catch (err) {
      console.error('Error fetching admin verification requests:', err);
      setError('Failed to load payment verification requests.');
    } finally {
      setLoadingRequests(false);
    }
  }, [isAdmin, verificationFilters.status, verificationFilters.dateRange]);

  // Fetch All Payments (Collections) for Admin view
  const fetchAdminPayments = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setLoadingPayments(true);
      const params = {};
      
      if (verificationFilters.dateRange === 'today') {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        params.fromDate = `${yyyy}-${mm}-${dd}`;
        params.toDate = `${yyyy}-${mm}-${dd}`;
      } else if (verificationFilters.dateRange === 'month') {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const lastDay = new Date(yyyy, today.getMonth() + 1, 0).getDate();
        params.fromDate = `${yyyy}-${mm}-01`;
        params.toDate = `${yyyy}-${mm}-${lastDay}`;
      } else if (verificationFilters.dateRange === 'custom') {
        if (verificationFilters.fromDate) params.fromDate = verificationFilters.fromDate;
        if (verificationFilters.toDate) params.toDate = verificationFilters.toDate;
      }

      const res = await api.get('/due-dashboard/payments', { params });
      setAdminPayments(res.data.payments || []);
    } catch (err) {
      console.error('Error fetching admin payments:', err);
      setError('Failed to load payment records.');
    } finally {
      setLoadingPayments(false);
    }
  }, [isAdmin, verificationFilters.dateRange, verificationFilters.fromDate, verificationFilters.toDate]);

  // Parse initial filters from query parameters
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const filterVal = searchParams.get('filter');
    if (filterVal) {
      if (filterVal === 'PendingDues') {
        setDuesFilters(prev => ({ ...prev, status: 'PendingDues', accountType: 'all' }));
      } else if (filterVal === 'Dealer') {
        setDuesFilters(prev => ({ ...prev, status: 'all', accountType: 'Dealer' }));
      } else if (filterVal === 'SubDealer') {
        setDuesFilters(prev => ({ ...prev, status: 'all', accountType: 'Sub Dealer' }));
      } else if (filterVal === 'today') {
        setVerificationFilters({ status: 'Approved', dateRange: 'today' });
        setVerificationSubTab('collections');
      } else if (filterVal === 'month') {
        setVerificationFilters({ status: 'Approved', dateRange: 'month' });
        setVerificationSubTab('collections');
      } else if (filterVal === 'expiringThisMonth') {
        const currentMonthStr = new Date().toISOString().slice(0, 7);
        setRenewalsFilters(prev => ({ ...prev, expiryMonth: currentMonthStr, deviceStatus: 'all' }));
        setRenewalsPage(1);
      }
      
      const tabVal = searchParams.get('tab') || 'dues';
      navigate(`/due-dashboard?tab=${tabVal}`, { replace: true });
    }
  }, [location.search, navigate]);

  // Handle action parameter from URL
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const actionVal = searchParams.get('action');
    if (actionVal === 'pay-outstanding' && summary) {
      const selfDue = duesList.find(d => d.userId?._id?.toString() === user?._id?.toString() || d.userId?.toString() === user?._id?.toString());
      const deviceDue = selfDue?.totalOutstanding || summary?.totalOutstandingAmount || 0;
      const renewalDue = renewalSummary?.totalDue || 0;
      openReportPaymentModal({ totalOutstanding: deviceDue + renewalDue });
      const tabVal = searchParams.get('tab') || 'dues';
      navigate(`/due-dashboard?tab=${tabVal}`, { replace: true });
    }
  }, [location.search, summary, duesList, user, navigate, renewalSummary]);

  // Initialize data based on active tab and role
  useEffect(() => {
    fetchSummary();
    if (activeTab === 'dues') {
      if (isListView) {
        fetchDues();
      } else {
        fetchSelfDetails();
        fetchVerificationRequests();
      }
    } else if (activeTab === 'renewals') {
      fetchRenewals();
    } else if (activeTab === 'verifications') {
      if (isAdmin) {
        fetchAdminVerificationRequests();
        fetchAdminPayments();
      }
    }
  }, [activeTab, fetchSummary, fetchDues, fetchRenewals, fetchSelfDetails, fetchVerificationRequests, fetchAdminVerificationRequests, fetchAdminPayments, isListView, isAdmin]);

  // Open Tab handler
  const handleTabChange = (tabName) => {
    navigate(`/due-dashboard?tab=${tabName}`);
  };

  // Receive Payment handler
  const openPaymentModal = (dueRecord) => {
    setSelectedDealerDue(dueRecord);
    setPaymentForm({
      amount: '',
      paymentMode: 'UPI',
      paymentDate: new Date().toISOString().split('T')[0],
      remarks: '',
      referenceNumber: `TXN-${Date.now()}`,
    });
    setSelectedPaymentScreenshot(null);
    setPaymentModalOpen(true);
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDealerDue) return;

    if (paymentForm.paymentMode === 'UPI' && !selectedPaymentScreenshot) {
      alert('Please upload the UPI screenshot.');
      return;
    }

    const targetUserId = selectedDealerDue.userId?._id || selectedDealerDue.userId;
    if (!targetUserId) return;

    try {
      setSubmittingPayment(true);
      const formDataObj = new FormData();
      formDataObj.append('amount', Number(paymentForm.amount));
      formDataObj.append('paymentMode', paymentForm.paymentMode);
      formDataObj.append('paymentDate', paymentForm.paymentDate);
      formDataObj.append('remarks', paymentForm.remarks);
      formDataObj.append('referenceNumber', paymentForm.referenceNumber);
      if (selectedPaymentScreenshot) {
        formDataObj.append('screenshot', selectedPaymentScreenshot);
      }

      await api.post(`/due-dashboard/dealers/${targetUserId}/payments`, formDataObj, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      showNotice(`Payment of ₹${Number(paymentForm.amount).toLocaleString()} received successfully for ${selectedDealerDue.dealerName}`);
      setPaymentModalOpen(false);
      setSelectedDealerDue(null);
      setSelectedPaymentScreenshot(null);
      
      // Refresh views
      fetchSummary();
      fetchDues();
      fetchAdminPayments();
    } catch (err) {
      console.error('Error submitting payment:', err);
      alert(err.response?.data?.message || 'Error occurred while recording payment.');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const openEditPaymentModal = (p) => {
    setSelectedPayment(p);
    setEditPaymentForm({
      paymentDate: p.paymentDate ? new Date(p.paymentDate).toISOString().split('T')[0] : '',
      amount: p.amount || '',
      paymentMode: p.paymentMode || 'Cash',
      referenceNumber: p.referenceNumber || '',
      remarks: p.remarks || '',
    });
    setEditPaymentModalOpen(true);
  };

  const handleEditPaymentSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await api.put(`/due-dashboard/payments/${selectedPayment._id}`, editPaymentForm);
      alert('Payment record updated successfully!');
      setEditPaymentModalOpen(false);
      
      // Refresh views
      fetchSummary();
      fetchDues();
      fetchAdminPayments();
    } catch (err) {
      console.error('Error updating payment:', err);
      alert(err.response?.data?.message || 'Failed to update payment record.');
    } finally {
      setLoading(false);
    }
  };

  const handleRenewSubmit = async (e) => {
    e.preventDefault();
    if (!renewDevice) return;
    try {
      setRenewing(true);
      const res = await api.post('/due-dashboard/renew-device', {
        deviceId: renewDevice._id,
        validity: renewValidity
      });
      alert(res.data.message || 'Device renewed successfully.');
      setRenewDevice(null);
      fetchRenewals();
      fetchSummary();
    } catch (err) {
      console.error('Error renewing device:', err);
      alert(err.response?.data?.message || 'Failed to renew device.');
    } finally {
      setRenewing(false);
    }
  };

  // Dealer Report Payment Handlers
  const openReportPaymentModal = (specificDue) => {
    const targetDue = specificDue || detailsData?.due;
    setReportForm({
      amount: targetDue?.totalOutstanding ? String(targetDue.totalOutstanding) : '',
      paymentMode: 'UPI',
      referenceNumber: '',
      remarks: '',
      paymentDate: getLocalDatetimeString(),
    });
    setSelectedScreenshot(null);
    setReportPaymentModalOpen(true);
  };

  const handleReportPaymentSubmit = async (e) => {
    e.preventDefault();
    if (reportForm.paymentMode !== 'Cash' && !selectedScreenshot) {
      alert('Please upload a payment screenshot/proof.');
      return;
    }

    if (reportForm.paymentMode === 'UPI') {
      const cleanedRef = reportForm.referenceNumber.trim();
      if (!/^\d{12}$/.test(cleanedRef)) {
        alert('For UPI payments, the Reference/UTR number must be exactly 12 numeric digits.');
        return;
      }
    }

    try {
      setSubmittingReportPayment(true);
      const formDataObj = new FormData();
      formDataObj.append('amount', reportForm.amount);
      formDataObj.append('paymentMode', reportForm.paymentMode);
      formDataObj.append('referenceNumber', reportForm.referenceNumber);
      formDataObj.append('remarks', reportForm.remarks);
      formDataObj.append('paymentDate', reportForm.paymentDate);
      if (selectedScreenshot) {
        formDataObj.append('screenshot', selectedScreenshot);
      }

      await api.post('/payment-verification-requests', formDataObj, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      showNotice('Payment proof submitted successfully for verification!');
      setReportPaymentModalOpen(false);
      setSelectedScreenshot(null);

      // Refresh self view
      fetchSelfDetails();
      fetchVerificationRequests();
    } catch (err) {
      console.error('Error submitting payment report:', err);
      alert(err.response?.data?.message || 'Failed to submit payment report.');
    } finally {
      setSubmittingReportPayment(false);
    }
  };

  // Admin Verification Handlers
  const openVerifyModal = (reqRecord) => {
    setSelectedVerificationRequest(reqRecord);
    setVerifyForm({
      adminRemarks: '',
    });
    setVerifyPaymentModalOpen(true);
  };

  const handleVerifySubmit = async (status) => {
    if (!selectedVerificationRequest) return;
    if (!window.confirm(`Are you sure you want to ${status.toLowerCase()} this payment request?`)) {
      return;
    }

    try {
      setSubmittingVerify(true);
      await api.put(`/payment-verification-requests/${selectedVerificationRequest._id}/verify`, {
        status,
        adminRemarks: verifyForm.adminRemarks,
      });

      showNotice(`Payment request successfully ${status.toLowerCase()}!`);
      setVerifyPaymentModalOpen(false);
      setSelectedVerificationRequest(null);

      // Refresh data
      fetchSummary();
      fetchAdminVerificationRequests();
      fetchAdminPayments();
    } catch (err) {
      console.error('Error verifying payment request:', err);
      alert(err.response?.data?.message || 'Failed to verify payment request.');
    } finally {
      setSubmittingVerify(false);
    }
  };

  // Dealer Details View handler
  const openDetailsModal = async (dueRecord) => {
    const targetUserId = dueRecord.userId?._id || dueRecord.userId;
    if (!targetUserId) return;

    try {
      setDetailsModalOpen(true);
      setLoadingDetails(true);
      setDetailsData(null);
      const res = await api.get(`/due-dashboard/dealers/${targetUserId}`);
      setDetailsData(res.data);
    } catch (err) {
      console.error('Error loading dealer details:', err);
      alert('Failed to load dealer details.');
      setDetailsModalOpen(false);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Export utility helper
  const triggerExport = async (type, format, filters = {}) => {
    try {
      const res = await api.get('/due-dashboard/export', {
        responseType: 'blob',
        params: {
          type,
          format,
          ...filters,
        },
      });

      const contentType = res.headers['content-type'] || 'application/octet-stream';
      const blob = new Blob([res.data], { type: contentType });
      const filename = `${type}-report-${new Date().toISOString().slice(0, 10)}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;

      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      showNotice(`Report exported successfully as ${format.toUpperCase()}`);
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to download report. Please check API connection.');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getStatusClass = (status) => {
    switch (status) {
      case 'Clear': return 'due-status-clear';
      case 'Partial': return 'due-status-partial';
      case 'Overdue': return 'due-status-overdue';
      case 'Active': return 'due-status-clear';
      case 'Expiring Soon': return 'due-status-partial';
      case 'Expired': return 'due-status-overdue';
      default: return '';
    }
  };

  const getFilteredVerificationRequests = () => {
    return adminVerificationRequests.filter((req) => {
      const pDate = new Date(req.paymentDate || req.createdAt);
      if (isNaN(pDate.getTime())) return true;
      const today = new Date();

      if (verificationFilters.dateRange === 'today') {
        return pDate.getFullYear() === today.getFullYear() &&
               pDate.getMonth() === today.getMonth() &&
               pDate.getDate() === today.getDate();
      }
      if (verificationFilters.dateRange === 'month') {
        return pDate.getFullYear() === today.getFullYear() &&
               pDate.getMonth() === today.getMonth();
      }
      if (verificationFilters.dateRange === 'custom') {
        const from = verificationFilters.fromDate ? new Date(verificationFilters.fromDate) : null;
        const to = verificationFilters.toDate ? new Date(verificationFilters.toDate) : null;

        if (from) from.setHours(0, 0, 0, 0);
        if (to) to.setHours(23, 59, 59, 999);

        if (from && pDate < from) return false;
        if (to && pDate > to) return false;
        return true;
      }
      return true;
    });
  };

  const getFilteredCollections = () => {
    if (!collectionsSearch) return adminPayments;
    const query = collectionsSearch.toLowerCase();
    return adminPayments.filter((p) => {
      const dealerName = (p.userId?.displayName || '').toLowerCase();
      const dealerCode = (p.userId?.username || '').toLowerCase();
      return dealerName.includes(query) || dealerCode.includes(query);
    });
  };

  const getFilteredCollectionsTotal = () => {
    return getFilteredCollections().reduce((sum, p) => sum + (p.amount || 0), 0);
  };

  const handleCardClick = (cardType) => {
    console.log('handleCardClick called for:', cardType, 'isListView:', isListView);
    if (!isListView) return;

    if (cardType === 'totalOutstanding' || cardType === 'totalDue' || cardType === 'pendingBills') {
      setDuesFilters({
        search: '',
        status: 'PendingDues',
        accountType: 'all',
      });
      setDuesPage(1);
      navigate(`/due-dashboard?tab=dues`);
    } else if (cardType === 'totalDealers') {
      setDuesFilters({
        search: '',
        status: 'all',
        accountType: 'Dealer',
      });
      setDuesPage(1);
      navigate(`/due-dashboard?tab=dues`);
    } else if (cardType === 'totalSubDealers') {
      setDuesFilters({
        search: '',
        status: 'all',
        accountType: 'Sub Dealer',
      });
      setDuesPage(1);
      navigate(`/due-dashboard?tab=dues`);
    } else if (cardType === 'todaysCollection') {
      setVerificationFilters({
        status: 'Approved',
        dateRange: 'today',
      });
      navigate(`/due-dashboard?tab=verifications`);
    } else if (cardType === 'monthlyCollection') {
      setVerificationFilters({
        status: 'Approved',
        dateRange: 'month',
      });
      navigate(`/due-dashboard?tab=verifications`);
    }
  };

  return (
    <div className="due-dashboard-container">
      {notice && <div className="due-notice-banner">{notice}</div>}
      {error && <div className="due-error-banner">{error}</div>}

      <div className="due-dashboard-header">
        <div className="due-tab-bar">
          <button
            className={`due-tab-btn ${activeTab === 'dues' ? 'active' : ''}`}
            onClick={() => handleTabChange('dues')}
          >
            {isListView ? (isAdmin ? 'Dealer Dues' : 'Dealer & Sub Dealer Dues') : 'My Dues'}
          </button>
          {isAdmin && (
            <>
              <button
                className={`due-tab-btn ${activeTab === 'verifications' ? 'active' : ''}`}
                onClick={() => handleTabChange('verifications')}
              >
                Payment Verifications
              </button>
              <button
                className={`due-tab-btn ${activeTab === 'exports' ? 'active' : ''}`}
                onClick={() => handleTabChange('exports')}
              >
                Export Reports
              </button>
            </>
          )}
        </div>
      </div>

      {/* METRIC SUMMARY CARDS */}
      {activeTab !== 'exports' && summary && (
        <div className="due-summary-cards">
          <div className={`due-summary-card tone-red ${isListView ? 'clickable' : ''}`} onClick={() => handleCardClick('totalOutstanding')}>
            <div className="card-info">
              <span className="card-value">₹{(summary.totalOutstandingAmount || 0).toLocaleString()}</span>
              <span className="card-label">{isListView ? 'Total Outstanding Amount' : 'My Total Outstanding'}</span>
              {!isAdmin && userRole === 'DEALER' && summary.totalOutstandingAmount > 0 && (
                <button
                  type="button"
                  className="due-action-btn success"
                  style={{ marginTop: '8px', padding: '4px 10px', fontSize: '11px', alignSelf: 'flex-start' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const selfDue = duesList.find(d => d.userId?._id?.toString() === user?._id?.toString() || d.userId?.toString() === user?._id?.toString());
                    const deviceDue = selfDue?.totalOutstanding || summary?.totalOutstandingAmount || 0;
                    const renewalDue = renewalSummary?.totalDue || 0;
                    openReportPaymentModal({ totalOutstanding: deviceDue + renewalDue });
                  }}
                >
                  Pay Outstanding
                </button>
              )}
            </div>
            <FaRupeeSign className="card-icon" />
          </div>



          {isListView && (
            <>
              {isAdmin && (
                <div className="due-summary-card tone-blue clickable" onClick={() => handleCardClick('totalDealers')}>
                  <div className="card-info">
                    <span className="card-value">{summary.totalDealers || 0}</span>
                    <span className="card-label">Total Dealers</span>
                  </div>
                  <FaUserTie className="card-icon" />
                </div>
              )}

              <div className="due-summary-card tone-green clickable" onClick={() => handleCardClick('totalSubDealers')}>
                <div className="card-info">
                  <span className="card-value">{summary.totalSubDealers || 0}</span>
                  <span className="card-label">Total Sub Dealers</span>
                </div>
                <FaUsers className="card-icon" />
              </div>

              <div className="due-summary-card tone-amber clickable" onClick={() => handleCardClick('pendingBills')}>
                <div className="card-info">
                  <span className="card-value">{summary.totalPendingDevices || 0}</span>
                  <span className="card-label">{isAdmin ? 'Dealers Pending Bills' : 'Sub Dealers Pending Bills'}</span>
                </div>
                <FaMobileAlt className="card-icon" />
              </div>

              {isAdmin && (
                <>
                  <div className="due-summary-card tone-green clickable" onClick={() => handleCardClick('todaysCollection')}>
                    <div className="card-info">
                      <span className="card-value">₹{(summary.todaysCollection || 0).toLocaleString()}</span>
                      <span className="card-label">Today's Collection</span>
                    </div>
                    <FaRupeeSign className="card-icon" />
                  </div>

                  <div className="due-summary-card tone-violet clickable" onClick={() => handleCardClick('monthlyCollection')}>
                    <div className="card-info">
                      <span className="card-value">₹{(summary.monthlyCollection || 0).toLocaleString()}</span>
                      <span className="card-label">Monthly Collection</span>
                    </div>
                    <FaCoins className="card-icon" />
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB CONTENTS */}
      <div className="due-tab-content">
        {/* TAB 1: DEALER DUES */}
        {activeTab === 'dues' && (
          isListView ? (
            /* ADMIN DUE VIEW */
            <div className="due-panel">
              <div className="due-panel-header">
                <h3>Outstanding Dealer Dues</h3>
                <div className="due-filters-bar">
                  <div className="search-box">
                    <FaSearch />
                    <input
                      type="text"
                      placeholder="Search Dealer/Code..."
                      value={duesFilters.search}
                      onChange={(e) => {
                        setDuesFilters(prev => ({ ...prev, search: e.target.value }));
                        setDuesPage(1);
                      }}
                    />
                  </div>
                  <div className="filter-select">
                    <FaFilter />
                    <select
                      value={duesFilters.accountType}
                      onChange={(e) => {
                        setDuesFilters(prev => ({ ...prev, accountType: e.target.value }));
                        setDuesPage(1);
                      }}
                    >
                      <option value="all">All Types</option>
                      <option value="Dealer">Dealers</option>
                      <option value="Sub Dealer">Sub Dealers</option>
                    </select>
                  </div>
                  <div className="filter-select">
                    <FaFilter />
                    <select
                      value={duesFilters.status}
                      onChange={(e) => {
                        setDuesFilters(prev => ({ ...prev, status: e.target.value }));
                        setDuesPage(1);
                      }}
                    >
                      <option value="all">All Status</option>
                      <option value="Clear">Clear</option>
                      <option value="Partial">Partial</option>
                      <option value="Overdue">Overdue</option>
                      <option value="PendingDues">Pending Dues</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="due-table-wrap">
                {loading ? (
                  <div className="loading-spinner">Loading Dealer Dues...</div>
                ) : (
                  <table className="due-table">
                    <thead>
                      <tr>
                        <th>Dealer Name</th>
                        <th>Dealer ID</th>
                        <th>Type</th>
                        <th>Devices Assigned</th>
                        <th>Total Purchase Revenue</th>
                        <th>Total Renewal Revenue</th>
                        <th>Total Bill Amount</th>
                        <th>Total Paid</th>
                        <th>Remaining Dues</th>
                        <th>Last Payment Date</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {duesList.map((due) => (
                        <tr key={due._id}>
                          <td>
                            <button
                              type="button"
                              className="due-link-btn"
                              onClick={() => openDetailsModal(due)}
                            >
                              {due.dealerName}
                            </button>
                          </td>
                          <td className="strong">{due.dealerCode}</td>
                          <td>{due.accountType}</td>
                          <td className="center">{due.totalDevicesAssigned}</td>
                          <td className="amount">₹{(due.totalPurchaseRevenue || 0).toLocaleString()}</td>
                          <td className="amount">₹{(due.totalRenewalRevenue || 0).toLocaleString()}</td>
                          <td className="amount">₹{(due.totalBillAmount || 0).toLocaleString()}</td>
                          <td className="amount">₹{(due.totalPaidAmount || 0).toLocaleString()}</td>
                          <td className="amount text-red" style={{ fontWeight: '600', color: '#ef4444' }}>₹{(due.totalOutstanding || 0).toLocaleString()}</td>
                          <td>{formatDate(due.lastPaymentDate)}</td>
                          <td>
                            <span className={`due-status-badge ${getStatusClass(due.status)}`}>
                              {due.status}
                            </span>
                          </td>
                          <td>
                            {isAdmin && due.totalOutstanding > 0 && (
                              <button
                                className="due-action-btn primary"
                                onClick={() => openPaymentModal(due)}
                              >
                                Receive Payment
                              </button>
                            )}
                            {!isAdmin && userRole === 'DEALER' && due.totalOutstanding > 0 && (
                              (due.userId?._id?.toString() === user?._id?.toString() || due.userId?.toString() === user?._id?.toString()) ? (
                                <button
                                  className="due-action-btn success"
                                  onClick={() => openReportPaymentModal(due)}
                                >
                                  Report Payment
                                </button>
                              ) : (
                                <button
                                  className="due-action-btn primary"
                                  onClick={() => openPaymentModal(due)}
                                >
                                  Receive Payment
                                </button>
                              )
                            )}
                          </td>
                        </tr>
                      ))}
                      {duesList.length === 0 && (
                        <tr>
                          <td colSpan={10} className="table-empty">No dealer due records found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pagination */}
              {duesPages > 1 && (
                <div className="due-pagination">
                  <button
                    disabled={duesPage === 1}
                    onClick={() => setDuesPage(p => Math.max(1, p - 1))}
                  >
                    <FaChevronLeft /> Prev
                  </button>
                  <span>Page {duesPage} of {duesPages}</span>
                  <button
                    disabled={duesPage === duesPages}
                    onClick={() => setDuesPage(p => Math.min(duesPages, p + 1))}
                  >
                    Next <FaChevronRight />
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* DEALER / SUB-DEALER SELF VIEW */
            detailsData ? (
              <div className="due-self-view">
                <div className="due-split-view">
                  {/* Left Column: Personal info & Summary stats */}
                  <div className="due-self-info-card">
                    <h3>Dealer Details</h3>
                    <div className="due-self-info-grid">
                      <div className="info-item">
                        <strong>Name:</strong>
                        <span>{detailsData.user?.displayName || 'N/A'}</span>
                      </div>
                      <div className="info-item">
                        <strong>Username:</strong>
                        <span>{detailsData.user?.username || 'N/A'}</span>
                      </div>
                      <div className="info-item">
                        <strong>Account Type:</strong>
                        <span>{detailsData.due?.accountType || 'N/A'}</span>
                      </div>
                      <div className="info-item">
                        <strong>Mobile No:</strong>
                        <span>{detailsData.user?.mobileNo || 'N/A'}</span>
                      </div>
                      <div className="info-item">
                        <strong>Email:</strong>
                        <span>{detailsData.user?.email || 'N/A'}</span>
                      </div>
                    </div>
                    <hr />
                    <div className="due-self-stats">
                      <div className="stat-row">
                        <span>Total Devices Assigned:</span>
                        <strong>{detailsData.due?.totalDevicesAssigned || 0}</strong>
                      </div>
                      <div className="stat-row">
                        <span>Total Purchase Revenue:</span>
                        <strong>₹{(detailsData.due?.totalPurchaseRevenue || 0).toLocaleString()}</strong>
                      </div>
                      <div className="stat-row">
                        <span>Total Renewal Revenue:</span>
                        <strong>₹{(detailsData.due?.totalRenewalRevenue || 0).toLocaleString()}</strong>
                      </div>
                      <div className="stat-row">
                        <span>Total Bill Amount:</span>
                        <strong>₹{(detailsData.due?.totalBillAmount || 0).toLocaleString()}</strong>
                      </div>
                      <div className="stat-row">
                        <span>Total Paid:</span>
                        <strong className="text-green">₹{(detailsData.due?.totalPaidAmount || 0).toLocaleString()}</strong>
                      </div>
                      <div className="stat-row highlight">
                        <span>Remaining Dues:</span>
                        <strong style={{ color: '#ef4444' }}>₹{(detailsData.due?.totalOutstanding || 0).toLocaleString()}</strong>
                      </div>
                      <div className="stat-row">
                        <span>Status:</span>
                        <span className={`due-status-badge ${getStatusClass(detailsData.due?.status)}`}>
                          {detailsData.due?.status}
                        </span>
                      </div>
                      {detailsData.due?.totalOutstanding > 0 && (
                        <button
                          type="button"
                          className="due-action-btn primary"
                          style={{ marginTop: '16px', width: '100%', padding: '10px' }}
                          onClick={openReportPaymentModal}
                        >
                          Report Dues Payment
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Tabbed list of payments & devices */}
                  <div className="due-self-lists-panel">
                    <div className="due-self-tabs" style={{ display: 'flex', gap: '10px', marginBottom: '15px', borderBottom: '1px solid #444', paddingBottom: '8px' }}>
                      <button
                        type="button"
                        className={`due-tab-btn compact-tab-btn ${selfListTab === 'payments' ? 'active' : ''}`}
                        onClick={() => setSelfListTab('payments')}
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                      >
                        Payment History
                      </button>
                      <button
                        type="button"
                        className={`due-tab-btn compact-tab-btn ${selfListTab === 'requests' ? 'active' : ''}`}
                        onClick={() => setSelfListTab('requests')}
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                      >
                        Verification Requests ({verificationRequests.length})
                      </button>
                    </div>

                    {selfListTab === 'payments' ? (
                      /* Payments History */
                      <div className="due-section">
                        <div className="due-table-wrap compact">
                          <table className="due-table compact">
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Amount</th>
                                <th>Payment Mode</th>
                                <th>Reference Number</th>
                                <th>Remarks</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detailsData.payments?.map((payment) => (
                                <tr key={payment._id}>
                                  <td>{formatDate(payment.paymentDate)}</td>
                                  <td className="amount">₹{(payment.amount || 0).toLocaleString()}</td>
                                  <td>{payment.paymentMode}</td>
                                  <td>
                                    <div>{payment.referenceNumber || '-'}</div>
                                    {payment.screenshotUrl && (
                                      <div style={{ marginTop: '4px' }}>
                                        <a 
                                          href={`${(api.defaults.baseURL || '').replace(/\/api$/, '')}${payment.screenshotUrl}`} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          style={{ color: '#00bcd4', fontSize: '11px', textDecoration: 'underline', fontWeight: '500', display: 'inline-block' }}
                                        >
                                          View Proof
                                        </a>
                                      </div>
                                    )}
                                  </td>
                                  <td>{payment.remarks || '-'}</td>
                                </tr>
                              ))}
                              {(!detailsData.payments || detailsData.payments.length === 0) && (
                                <tr>
                                  <td colSpan={5} className="table-empty">No payment history found.</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      /* Verification Requests */
                      <div className="due-section">
                        <div className="due-table-wrap compact">
                          <table className="due-table compact">
                            <thead>
                              <tr>
                                <th>Payment Date & Time</th>
                                <th>Amount</th>
                                <th>Mode</th>
                                <th>Reference No</th>
                                <th>Status</th>
                                <th>Verification Details</th>
                              </tr>
                            </thead>
                            <tbody>
                              {verificationRequests.map((req) => (
                                <tr key={req._id}>
                                  <td>{formatDateTime(req.paymentDate || req.createdAt)}</td>
                                  <td className="amount">₹{req.amount.toLocaleString()}</td>
                                  <td>{req.paymentMode}</td>
                                  <td>
                                    <div>{req.referenceNumber}</div>
                                    {req.screenshotUrl && (
                                      <div style={{ marginTop: '4px' }}>
                                        <a 
                                          href={`${(api.defaults.baseURL || '').replace(/\/api$/, '')}${req.screenshotUrl}`} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          style={{ color: '#00bcd4', fontSize: '11px', textDecoration: 'underline', fontWeight: '500', display: 'inline-block' }}
                                        >
                                          View Proof
                                        </a>
                                      </div>
                                    )}
                                  </td>
                                  <td>
                                    <span className={`due-status-badge req-status-${req.status.toLowerCase()}`}>
                                      {req.status}
                                    </span>
                                  </td>
                                  <td>
                                    {req.status === 'Rejected' && (
                                      <span className="text-red" title={req.adminRemarks}>
                                        Rejected: {req.adminRemarks || 'Declined'} (Rejected At: {formatDateTime(req.verifiedAt || req.updatedAt)})
                                      </span>
                                    )}
                                    {req.status === 'Approved' && (
                                      <span className="text-green" title={req.adminRemarks}>
                                        Approved: {req.adminRemarks || 'Cleared'} (Approved At: {formatDateTime(req.verifiedAt || req.updatedAt)})
                                      </span>
                                    )}
                                    {req.status === 'Pending' && (
                                      <span className="text-muted" title={`Submitted At: ${formatDateTime(req.createdAt)}`}>
                                        Awaiting Admin Verification (Reported: {formatDateTime(req.createdAt)})
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                              {verificationRequests.length === 0 && (
                                <tr>
                                  <td colSpan={6} className="table-empty">No payment reports submitted yet.</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Assigned Devices List */}
                    <div className="due-section" style={{ marginTop: '20px' }}>
                      <h4>Assigned Devices</h4>
                      <div className="due-table-wrap compact">
                        <table className="due-table compact">
                          <thead>
                            <tr>
                              <th>IMEI</th>
                              <th>Device Name</th>
                              <th>Assign Date</th>
                              <th>Bill Amount</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailsData.devices?.map((device) => (
                              <tr key={device._id}>
                                <td className="strong">{device.imei}</td>
                                <td>{device.deviceName || 'Device'}</td>
                                <td>{formatDate(device.presentDate || device.createdAt)}</td>
                                <td className="amount">₹{(device.billAmount || 0).toLocaleString()}</td>
                                <td>
                                  <span className={`due-status-badge ${device.status === 'Active' || device.status === 'Activated' ? 'due-status-clear' : 'due-status-overdue'}`}>
                                    {device.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                            {(!detailsData.devices || detailsData.devices.length === 0) && (
                              <tr>
                                <td colSpan={5} className="table-empty">No assigned devices found.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="loading-spinner">Loading account dues...</div>
            )
          )
        )}

        {/* TAB 2: RENEWAL DUE DEVICES */}
        {activeTab === 'renewals' && (
          <div className="due-panel">
            <div className="due-panel-header">
              <h3>Renewal Due Devices</h3>
              <div className="due-filters-bar flex-wrap">
                <div className="search-box">
                  <FaSearch />
                  <input
                    type="text"
                    placeholder="Search IMEI/Device/Customer..."
                    value={renewalsFilters.search}
                    onChange={(e) => {
                      setRenewalsFilters(prev => ({ ...prev, search: e.target.value }));
                      setRenewalsPage(1);
                    }}
                  />
                </div>
                 {isListView && (
                  <>
                    {isAdmin && (
                      <div className="search-box input-filter">
                        <input
                          type="text"
                          placeholder="Dealer Name..."
                          value={renewalsFilters.dealer}
                          onChange={(e) => {
                            setRenewalsFilters(prev => ({ ...prev, dealer: e.target.value }));
                            setRenewalsPage(1);
                          }}
                        />
                      </div>
                    )}
                    <div className="search-box input-filter">
                      <input
                        type="text"
                        placeholder="Sub Dealer Name..."
                        value={renewalsFilters.subDealer}
                        onChange={(e) => {
                          setRenewalsFilters(prev => ({ ...prev, subDealer: e.target.value }));
                          setRenewalsPage(1);
                        }}
                      />
                    </div>
                  </>
                )}
                <div className="search-box input-filter">
                  <input
                    type="text"
                    placeholder="Customer Name..."
                    value={renewalsFilters.customer}
                    onChange={(e) => {
                      setRenewalsFilters(prev => ({ ...prev, customer: e.target.value }));
                      setRenewalsPage(1);
                    }}
                  />
                </div>
                <div className="filter-select">
                  <input
                    type="month"
                    value={renewalsFilters.expiryMonth}
                    onChange={(e) => {
                      setRenewalsFilters(prev => ({ ...prev, expiryMonth: e.target.value }));
                      setRenewalsPage(1);
                    }}
                  />
                </div>
                <div className="filter-select">
                  <FaFilter />
                  <select
                    value={renewalsFilters.deviceStatus}
                    onChange={(e) => {
                      setRenewalsFilters(prev => ({ ...prev, deviceStatus: e.target.value }));
                      setRenewalsPage(1);
                    }}
                  >
                    <option value="all">All Status</option>
                    <option value="Active">Active</option>
                    <option value="Expiring Soon">Expiring Soon</option>
                    <option value="Expired">Expired</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="due-table-wrap scrollable-tbody">
              {loading ? (
                <div className="loading-spinner">Loading renewals list...</div>
              ) : (
                <table className="due-table">
                  <thead>
                    <tr>
                      <th>IMEI</th>
                      <th>Device Name</th>
                      <th>Customer Name</th>
                      <th>Dealer Name</th>
                      <th>Activation Date</th>
                      <th>Expiry Date</th>
                      <th>Remaining Days</th>
                      <th>Renewal Amount</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renewalsList.map((device) => (
                      <tr key={device._id}>
                        <td className="strong">{device.imei}</td>
                        <td>{device.deviceName}{device.vehicleNumber ? ` (${device.vehicleNumber})` : ''}</td>
                        <td>{device.customerName || '-'}</td>
                        <td>{device.dealerName || '-'}</td>
                        <td>{formatDate(device.activationDate)}</td>
                        <td>{formatDate(device.expiryDate)}</td>
                        <td className="center bold">{device.remainingDays} days</td>
                        <td className="amount">₹{(device.renewalAmount || 0).toLocaleString()}</td>
                        <td>
                          <span className={`due-status-badge ${getStatusClass(device.status)}`}>
                            {device.status}
                          </span>
                        </td>
                        <td>
                          {isAdmin ? (
                            <div style={{ display: 'flex', gap: '5px' }}>
                              <button
                                onClick={() => {
                                  setRenewDevice(device);
                                  setRenewValidity('1 Year');
                                }}
                                style={{
                                  background: '#10b981',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  fontWeight: '700',
                                  cursor: 'pointer'
                                }}
                              >
                                Renew
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => navigate(`/dashboard?view=renewals&imei=${device.imei}`)}
                              style={{
                                background: '#10b981',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                fontSize: '11px',
                                fontWeight: '700',
                                cursor: 'pointer'
                              }}
                            >
                              Pay
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {renewalsList.length === 0 && (
                      <tr>
                        <td colSpan={10} className="table-empty">No renewal due devices found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {renewalsPages > 1 && (
              <div className="due-pagination">
                <button
                  disabled={renewalsPage === 1}
                  onClick={() => setRenewalsPage(p => Math.max(1, p - 1))}
                >
                  <FaChevronLeft /> Prev
                </button>
                <span>Page {renewalsPage} of {renewalsPages}</span>
                <button
                  disabled={renewalsPage === renewalsPages}
                  onClick={() => setRenewalsPage(p => Math.min(renewalsPages, p + 1))}
                >
                  Next <FaChevronRight />
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: EXPORTS PANEL */}
        {activeTab === 'exports' && isAdmin && (
          <div className="due-panel">
            <div className="due-panel-header">
              <h3>Export Management Reports</h3>
            </div>
            
            <div className="due-exports-grid">
              {/* Report 1: Dealer Dues */}
              <div className="due-export-card">
                <FaRupeeSign className="export-icon text-red" />
                <h4>Dealer Due Report</h4>
                <p>Generates details of total devices, paid amounts, and currently outstanding dues for all Dealers & Sub Dealers.</p>
                <div className="export-actions">
                  <button className="due-action-btn primary" onClick={() => triggerExport('dealer-due', 'excel')}>
                    <FaDownload /> Excel
                  </button>
                  <button className="due-action-btn" onClick={() => triggerExport('dealer-due', 'pdf')}>
                    <FaDownload /> PDF
                  </button>
                </div>
              </div>

              {/* Report 2: Collection Report */}
              <div className="due-export-card">
                <FaCoins className="export-icon text-green" />
                <h4>Collections Report</h4>
                <p>Exports log of manual payment collections received from dealers. Set filters below to narrow down scope.</p>
                <div className="export-filters-form">
                  <label>
                    <span>From Date</span>
                    <input
                      type="date"
                      value={exportFilters.fromDate}
                      onChange={(e) => setExportFilters(prev => ({ ...prev, fromDate: e.target.value }))}
                    />
                  </label>
                  <label>
                    <span>To Date</span>
                    <input
                      type="date"
                      value={exportFilters.toDate}
                      onChange={(e) => setExportFilters(prev => ({ ...prev, toDate: e.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Mode</span>
                    <select
                      value={exportFilters.paymentMode}
                      onChange={(e) => setExportFilters(prev => ({ ...prev, paymentMode: e.target.value }))}
                    >
                      <option value="">All Modes</option>
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                    </select>
                  </label>
                </div>
                <div className="export-actions">
                  <button className="due-action-btn primary" onClick={() => triggerExport('collection', 'excel', exportFilters)}>
                    <FaDownload /> Excel
                  </button>
                  <button className="due-action-btn" onClick={() => triggerExport('collection', 'pdf', exportFilters)}>
                    <FaDownload /> PDF
                  </button>
                </div>
              </div>

              {/* Report 3: Renewal Due Report */}
              <div className="due-export-card">
                <FaCalendarAlt className="export-icon text-amber" />
                <h4>Renewal Due Report</h4>
                <p>Generates evolutionary conservation lists of devices that are expiring soon or already expired with respective remaining days.</p>
                <div className="export-actions">
                  <button className="due-action-btn primary" onClick={() => triggerExport('renewal-due', 'excel')}>
                    <FaDownload /> Excel
                  </button>
                  <button className="due-action-btn" onClick={() => triggerExport('renewal-due', 'pdf')}>
                    <FaDownload /> PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: COLLECTIONS & PAYMENT VERIFICATION REQUESTS */}
        {activeTab === 'verifications' && isAdmin && (
          <div className="due-panel">
            <div className="due-panel-header" style={{ borderBottom: 'none', paddingBottom: '0' }}>
              <h3>Collections & Verification Requests</h3>
              <div className="due-filters-bar">
                {verificationSubTab === 'requests' && (
                  <div className="filter-select">
                    <FaFilter />
                    <select
                      value={verificationFilters.status}
                      onChange={(e) => {
                        setVerificationFilters(prev => ({ ...prev, status: e.target.value }));
                      }}
                    >
                      <option value="all">All Status</option>
                      <option value="Pending">Pending</option>
                      <option value="Approved">Approved</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </div>
                )}
                <div className="filter-select">
                  <FaFilter />
                  <select
                    value={verificationFilters.dateRange}
                    onChange={(e) => {
                      setVerificationFilters(prev => ({ ...prev, dateRange: e.target.value }));
                    }}
                  >
                    <option value="all">All Dates</option>
                    <option value="today">Today</option>
                    <option value="month">This Month</option>
                    <option value="custom">Custom Range</option>
                  </select>
                </div>
                {verificationFilters.dateRange === 'custom' && (
                  <>
                    <div className="filter-select" style={{ padding: '0 8px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '650' }}>From:</span>
                      <input
                        type="date"
                        value={verificationFilters.fromDate}
                        onChange={(e) => {
                          setVerificationFilters(prev => ({ ...prev, fromDate: e.target.value }));
                        }}
                        style={{ border: 'none', outline: 'none', fontSize: '11px', background: 'transparent' }}
                      />
                    </div>
                    <div className="filter-select" style={{ padding: '0 8px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '650' }}>To:</span>
                      <input
                        type="date"
                        value={verificationFilters.toDate}
                        onChange={(e) => {
                          setVerificationFilters(prev => ({ ...prev, toDate: e.target.value }));
                        }}
                        style={{ border: 'none', outline: 'none', fontSize: '11px', background: 'transparent' }}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="due-self-tabs" style={{ display: 'flex', gap: '10px', margin: '0 24px 20px 24px', borderBottom: '1px solid #444', paddingBottom: '8px' }}>
              <button
                type="button"
                className={`due-tab-btn compact-tab-btn ${verificationSubTab === 'requests' ? 'active' : ''}`}
                onClick={() => setVerificationSubTab('requests')}
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                Verification Requests ({getFilteredVerificationRequests().length})
              </button>
              <button
                type="button"
                className={`due-tab-btn compact-tab-btn ${verificationSubTab === 'collections' ? 'active' : ''}`}
                onClick={() => setVerificationSubTab('collections')}
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                All Payments / Collections ({adminPayments.length})
              </button>
            </div>

            {verificationSubTab === 'collections' && (
              <div className="due-filters-row" style={{ display: 'flex', gap: '15px', alignItems: 'center', margin: '0 24px 20px 24px', flexWrap: 'wrap', background: '#f8fafc', padding: '12px 20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FaSearch style={{ color: '#64748b', fontSize: '14px' }} />
                  <input
                    type="text"
                    placeholder="Search Dealer Name or ID..."
                    value={collectionsSearch}
                    onChange={(e) => setCollectionsSearch(e.target.value)}
                    style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', minWidth: '220px' }}
                  />
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>
                  <span>Total Payments Received:</span>
                  <span style={{ color: '#10b981', background: '#ecfdf5', padding: '4px 10px', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                    ₹{getFilteredCollectionsTotal().toLocaleString()}
                  </span>
                </div>
              </div>
            )}

            {verificationSubTab === 'requests' ? (
              <div className="due-table-wrap">
                {loadingRequests ? (
                  <div className="loading-spinner">Loading Verification Requests...</div>
                ) : (
                  <table className="due-table">
                    <thead>
                      <tr>
                        <th>Dealer Name</th>
                        <th>Company</th>
                        <th>Mobile</th>
                        <th>Amount</th>
                        <th>Mode</th>
                        <th>Reference No</th>
                        <th>Payment Date & Time</th>
                        <th>Date Submitted</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getFilteredVerificationRequests().map((req) => (
                        <tr key={req._id}>
                          <td>{req.userId?.displayName || req.userId?.username || '—'}</td>
                          <td>{req.userId?.companyName || '—'}</td>
                          <td>{req.userId?.mobileNo || '—'}</td>
                          <td className="amount">₹{(req.amount || 0).toLocaleString()}</td>
                          <td>{req.paymentMode}</td>
                          <td className="strong">
                            <div>{req.referenceNumber}</div>
                            {req.screenshotUrl && (
                              <div style={{ marginTop: '4px' }}>
                                <a 
                                  href={`${(api.defaults.baseURL || '').replace(/\/api$/, '')}${req.screenshotUrl}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  style={{ color: '#00bcd4', fontSize: '11px', textDecoration: 'underline', fontWeight: '500', display: 'inline-block' }}
                                >
                                  View Proof
                                </a>
                              </div>
                            )}
                          </td>
                          <td>{formatDateTime(req.paymentDate || req.createdAt)}</td>
                          <td>{formatDateTime(req.createdAt)}</td>
                          <td>
                            <span className={`due-status-badge req-status-${req.status.toLowerCase()}`}>
                              {req.status}
                            </span>
                          </td>
                          <td>
                            {req.status === 'Pending' ? (
                              <button
                                type="button"
                                className="due-action-btn primary"
                                onClick={() => openVerifyModal(req)}
                              >
                                Verify
                              </button>
                            ) : (
                              <span className="verified-info" style={{ fontWeight: '600', display: 'block', fontSize: '11px' }} title={req.adminRemarks}>
                                {req.status === 'Approved' ? '✅ Approved' : '❌ Rejected'}
                                <span style={{ display: 'block', fontSize: '9.5px', color: '#888', fontWeight: 'normal', marginTop: '2px' }}>
                                  {req.status === 'Approved' ? 'Approved: ' : 'Rejected: '}{formatDateTime(req.verifiedAt || req.updatedAt)}
                                </span>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {getFilteredVerificationRequests().length === 0 && (
                        <tr>
                          <td colSpan={10} className="table-empty">No payment verification requests found for this filter.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            ) : (
              <div className="due-table-wrap">
                {loadingPayments ? (
                  <div className="loading-spinner">Loading Collections History...</div>
                ) : (
                  <table className="due-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Dealer Name</th>
                        <th>Dealer ID</th>
                        <th>Amount</th>
                        <th>Payment Mode</th>
                        <th>Reference No</th>
                        <th>Remarks</th>
                        <th>Recorded By</th>
                        {isAdmin && <th style={{ textAlign: 'center' }}>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {getFilteredCollections().map((p) => (
                        <tr key={p._id}>
                          <td>{new Date(p.paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                          <td>{p.userId?.displayName || p.userId?.username || '—'}</td>
                          <td>{p.userId?.username || '—'}</td>
                          <td className="amount">₹{(p.amount || 0).toLocaleString()}</td>
                          <td>{p.paymentMode}</td>
                          <td className="strong">
                            <div>{p.referenceNumber || '—'}</div>
                            {p.screenshotUrl && (
                              <div style={{ marginTop: '4px' }}>
                                <a 
                                  href={`${(api.defaults.baseURL || '').replace(/\/api$/, '')}${p.screenshotUrl}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  style={{ color: '#00bcd4', fontSize: '11px', textDecoration: 'underline', fontWeight: '500', display: 'inline-block' }}
                                >
                                  View Proof
                                </a>
                              </div>
                            )}
                          </td>
                          <td>{p.remarks || '—'}</td>
                          <td>{p.updatedBy?.displayName || p.updatedBy?.username || '—'}</td>
                          {isAdmin && (
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                className="due-action-btn primary"
                                style={{ padding: '4px 10px', fontSize: '11px' }}
                                onClick={() => openEditPaymentModal(p)}
                              >
                                Edit
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                      {getFilteredCollections().length === 0 && (
                        <tr>
                          <td colSpan={isAdmin ? 9 : 8} className="table-empty">No payment collections found matching the filter criteria.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* POPUP MODAL: EDIT PAYMENT */}
      {editPaymentModalOpen && selectedPayment && (
        <div className="due-modal-backdrop">
          <div className="due-modal">
            <div className="due-modal-header">
              <h4>Edit Payment Record</h4>
              <button className="due-close-btn" onClick={() => setEditPaymentModalOpen(false)}>
                <FaTimes />
              </button>
            </div>
            <form onSubmit={handleEditPaymentSubmit}>
              <div className="due-modal-body">
                <div className="form-group">
                  <label>Dealer Name</label>
                  <input 
                    type="text" 
                    value={selectedPayment.userId?.displayName || selectedPayment.userId?.username || '—'} 
                    readOnly 
                    className="readonly-input" 
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Amount (₹)</label>
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="Enter amount..."
                      value={editPaymentForm.amount}
                      onChange={(e) => setEditPaymentForm(prev => ({ ...prev, amount: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Payment Mode</label>
                    <select
                      value={editPaymentForm.paymentMode}
                      onChange={(e) => setEditPaymentForm(prev => ({ ...prev, paymentMode: e.target.value }))}
                    >
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Payment Date</label>
                    <input
                      type="date"
                      required
                      value={editPaymentForm.paymentDate}
                      onChange={(e) => setEditPaymentForm(prev => ({ ...prev, paymentDate: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Reference / UTR No</label>
                    <input
                      type="text"
                      placeholder="Enter UTR/Reference No..."
                      value={editPaymentForm.referenceNumber}
                      onChange={(e) => setEditPaymentForm(prev => ({ ...prev, referenceNumber: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Remarks</label>
                  <textarea
                    placeholder="Enter remarks..."
                    value={editPaymentForm.remarks}
                    onChange={(e) => setEditPaymentForm(prev => ({ ...prev, remarks: e.target.value }))}
                    rows="2"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                  />
                </div>
              </div>
              <div className="due-modal-footer">
                <button type="button" className="due-action-btn secondary" onClick={() => setEditPaymentModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="due-action-btn primary" disabled={loading}>
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POPUP MODAL: RECEIVE PAYMENT */}
      {paymentModalOpen && selectedDealerDue && (
        <div className="due-modal-backdrop">
          <div className="due-modal">
            <div className="due-modal-header">
              <h4>Receive Payment</h4>
              <button className="due-close-btn" onClick={() => setPaymentModalOpen(false)}>
                <FaTimes />
              </button>
            </div>
            <form onSubmit={handlePaymentSubmit}>
              <div className="due-modal-body">
                <div className="form-group">
                  <label>Dealer / Sub Dealer</label>
                  <input type="text" value={selectedDealerDue.dealerName} readOnly className="readonly-input" />
                </div>
                <div className="form-group">
                  <label>Total Outstanding Due</label>
                  <div className="highlight-amount red">₹{(selectedDealerDue.totalOutstanding || 0).toLocaleString()}</div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Amount to Pay (₹)</label>
                    <input
                      type="number"
                      required
                      min="1"
                      max={selectedDealerDue.totalOutstanding}
                      placeholder="Enter amount..."
                      value={paymentForm.amount}
                      onChange={(e) => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Payment Mode</label>
                    <select
                      value={paymentForm.paymentMode}
                      onChange={(e) => setPaymentForm(prev => ({ ...prev, paymentMode: e.target.value }))}
                    >
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Payment Date</label>
                    <input
                      type="date"
                      required
                      max={getLocalDatetimeString().split('T')[0]}
                      value={paymentForm.paymentDate}
                      onChange={(e) => setPaymentForm(prev => ({ ...prev, paymentDate: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Reference Number / ID</label>
                    <input
                      type="text"
                      placeholder="Ref ID or receipt details..."
                      value={paymentForm.referenceNumber}
                      onChange={(e) => setPaymentForm(prev => ({ ...prev, referenceNumber: e.target.value }))}
                    />
                  </div>
                </div>
                {paymentForm.paymentMode === 'UPI' && (
                  <div className="form-group">
                    <label>UPI Screenshot Proof <span className="required" style={{ color: 'red' }}>*</span></label>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      required
                      onChange={(e) => setSelectedPaymentScreenshot(e.target.files[0])}
                      style={{ border: 'none', background: 'transparent', padding: '5px 0' }}
                    />
                  </div>
                )}
                <div className="form-group">
                  <label>Remarks</label>
                  <textarea
                    rows="3"
                    placeholder="Enter payment notes..."
                    value={paymentForm.remarks}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, remarks: e.target.value }))}
                  />
                </div>
              </div>
              <div className="due-modal-footer">
                <button type="button" className="due-btn-secondary" onClick={() => setPaymentModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="due-btn-primary" disabled={submittingPayment}>
                  {submittingPayment ? 'Recording...' : 'Submit Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POPUP MODAL: DEALER DETAILS DRAWER */}
      {detailsModalOpen && (
        <div className="due-modal-backdrop">
          <div className="due-modal large-width">
            <div className="due-modal-header">
              <h4>Dealer Details & History</h4>
              <button className="due-close-btn" onClick={() => setDetailsModalOpen(false)}>
                <FaTimes />
              </button>
            </div>
            <div className="due-modal-body text-left">
              {loadingDetails ? (
                <div className="loading-spinner">Loading detailed analytics...</div>
              ) : (
                detailsData && (
                  <div className="due-details-grid-layout">
                    {/* Upper Row: Basic Stats & Info */}
                    <div className="detail-meta-box">
                      <h5>Account Profile</h5>
                      <p><strong>Dealer Name:</strong> {detailsData.user?.displayName || 'N/A'}</p>
                      <p><strong>Username / ID:</strong> {detailsData.user?.username || 'N/A'}</p>
                      <p><strong>Contact mobile:</strong> {detailsData.user?.mobileNo || 'N/A'}</p>
                      <p><strong>Account Level:</strong> {detailsData.due?.accountType || 'N/A'}</p>
                      <p><strong>Status:</strong> <span className={`due-status-badge ${getStatusClass(detailsData.due?.status)}`}>{detailsData.due?.status}</span></p>
                    </div>

                    <div className="detail-meta-box">
                      <h5>Due Calculator</h5>
                      <div className="stat-flex">
                        <span>Total Devices Assigned:</span>
                        <strong>{detailsData.due?.totalDevicesAssigned || 0}</strong>
                      </div>
                      <div className="stat-flex">
                        <span>Total Purchase Revenue:</span>
                        <strong>₹{(detailsData.due?.totalPurchaseRevenue || 0).toLocaleString()}</strong>
                      </div>
                      <div className="stat-flex">
                        <span>Total Renewal Revenue:</span>
                        <strong>₹{(detailsData.due?.totalRenewalRevenue || 0).toLocaleString()}</strong>
                      </div>
                      <div className="stat-flex">
                        <span>Total Bill Amount:</span>
                        <strong>₹{(detailsData.due?.totalBillAmount || 0).toLocaleString()}</strong>
                      </div>
                      <div className="stat-flex">
                        <span>Total Paid:</span>
                        <strong className="text-green">₹{(detailsData.due?.totalPaidAmount || 0).toLocaleString()}</strong>
                      </div>
                       <div className="stat-flex border-top">
                         <span>Remaining Dues:</span>
                         <strong style={{ color: '#ef4444' }}>₹{(detailsData.due?.totalOutstanding || 0).toLocaleString()}</strong>
                       </div>
                    </div>

                    {/* Lower Area: Devices & Payments List */}
                    <div className="detail-lists-box full-width">
                      <h5>Payments Records</h5>
                      <div className="due-table-wrap compact scroll-y">
                        <table className="due-table compact">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Amount</th>
                              <th>Mode</th>
                              <th>Reference ID</th>
                              <th>Remarks</th>
                              <th>Recorded By</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailsData.payments?.map((payment) => (
                              <tr key={payment._id}>
                                <td>{formatDate(payment.paymentDate)}</td>
                                <td className="amount">₹{(payment.amount || 0).toLocaleString()}</td>
                                <td>{payment.paymentMode}</td>
                                <td>
                                   <div>{payment.referenceNumber || '-'}</div>
                                   {payment.screenshotUrl && (
                                     <div style={{ marginTop: '4px' }}>
                                       <a 
                                         href={`${(api.defaults.baseURL || '').replace(/\/api$/, '')}${payment.screenshotUrl}`} 
                                         target="_blank" 
                                         rel="noopener noreferrer"
                                         style={{ color: '#00bcd4', fontSize: '11px', textDecoration: 'underline', fontWeight: '500', display: 'inline-block' }}
                                       >
                                         View Proof
                                       </a>
                                     </div>
                                   )}
                                 </td>
                                <td>{payment.remarks || '-'}</td>
                                <td>{payment.updatedBy?.displayName || 'System'}</td>
                              </tr>
                            ))}
                            {(!detailsData.payments || detailsData.payments.length === 0) && (
                              <tr>
                                <td colSpan={6} className="table-empty">No manual collections recorded.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="detail-lists-box full-width">
                      <h5>Assigned Devices List</h5>
                      <div className="due-table-wrap compact scroll-y">
                        <table className="due-table compact">
                          <thead>
                            <tr>
                              <th>IMEI</th>
                              <th>Device Name</th>
                              <th>Assigned On</th>
                              <th>Bill Amount</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailsData.devices?.map((device) => (
                              <tr key={device._id}>
                                <td className="strong">{device.imei}</td>
                                <td>{device.deviceName || 'Device'}</td>
                                <td>{formatDate(device.presentDate || device.createdAt)}</td>
                                <td className="amount">₹{(device.billAmount || 0).toLocaleString()}</td>
                                <td>
                                  <span className={`due-status-badge ${device.status === 'Active' || device.status === 'Activated' ? 'due-status-clear' : 'due-status-overdue'}`}>
                                    {device.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                            {(!detailsData.devices || detailsData.devices.length === 0) && (
                              <tr>
                                <td colSpan={5} className="table-empty">No device ownership found.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
            <div className="due-modal-footer">
              <button className="due-btn-secondary" onClick={() => setDetailsModalOpen(false)}>
                Close Panel
              </button>
            </div>
          </div>
        </div>
      )}
      {/* POPUP MODAL: DEALER REPORT PAYMENT */}
      {reportPaymentModalOpen && (
        <div className="due-modal-backdrop">
          <div className="due-modal" style={{ maxWidth: '500px' }}>
            <div className="due-modal-header">
              <h4>Report Dues Payment</h4>
              <button className="due-close-btn" onClick={() => setReportPaymentModalOpen(false)}>
                <FaTimes />
              </button>
            </div>
            <form onSubmit={handleReportPaymentSubmit}>
              <div className="due-modal-body">
                <div className="form-group">
                  <label>Amount Paid (₹) <span className="required" style={{ color: 'red' }}>*</span></label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="Enter amount paid..."
                    value={reportForm.amount}
                    onChange={(e) => setReportForm(prev => ({ ...prev, amount: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Payment Mode <span className="required" style={{ color: 'red' }}>*</span></label>
                  <select
                    value={reportForm.paymentMode}
                    onChange={(e) => setReportForm(prev => ({ ...prev, paymentMode: e.target.value }))}
                  >
                    <option value="UPI">UPI</option>
                    <option value="NEFT">NEFT / IMPS</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cash">Cash</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Payment Date & Time <span className="required" style={{ color: 'red' }}>*</span></label>
                  <input
                    type="datetime-local"
                    required
                    max={getLocalDatetimeString()}
                    value={reportForm.paymentDate}
                    onChange={(e) => setReportForm(prev => ({ ...prev, paymentDate: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Reference / UTR / Txn Number {reportForm.paymentMode === 'UPI' ? <span className="required" style={{ color: 'red' }}>*</span> : '(Optional)'}</label>
                  <input
                    type="text"
                    required={reportForm.paymentMode === 'UPI'}
                    placeholder={reportForm.paymentMode === 'UPI' ? "Enter 12-digit UPI UTR / Reference No." : "Enter reference number..."}
                    maxLength={reportForm.paymentMode === 'UPI' ? 12 : undefined}
                    value={reportForm.referenceNumber}
                    onChange={(e) => setReportForm(prev => ({ 
                      ...prev, 
                      referenceNumber: reportForm.paymentMode === 'UPI' ? e.target.value.replace(/\D/g, '') : e.target.value 
                    }))}
                  />
                  {reportForm.paymentMode === 'UPI' && (
                    <span style={{ fontSize: '10px', color: '#dc2626', marginTop: '4px', display: 'block', fontWeight: '600' }}>
                      UPI reference number (UTR) must be exactly 12 numeric digits.
                    </span>
                  )}
                </div>
                <div className="form-group">
                  <label>Payment Screenshot / Receipt {reportForm.paymentMode === 'UPI' && <span className="required" style={{ color: 'red' }}>*</span>}</label>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    required={reportForm.paymentMode === 'UPI'}
                    onChange={(e) => setSelectedScreenshot(e.target.files[0])}
                    style={{ border: 'none', background: 'transparent', padding: '5px 0' }}
                  />
                </div>
                <div className="form-group">
                  <label>Remarks / Notes (Optional)</label>
                  <textarea
                    rows="2"
                    placeholder="Enter payment remarks..."
                    value={reportForm.remarks}
                    onChange={(e) => setReportForm(prev => ({ ...prev, remarks: e.target.value }))}
                  />
                </div>
              </div>
              <div className="due-modal-footer">
                <button type="button" className="due-btn-secondary" onClick={() => setReportPaymentModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="due-action-btn primary" disabled={submittingReportPayment}>
                  {submittingReportPayment ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POPUP MODAL: ADMIN VERIFY PAYMENT */}
      {verifyPaymentModalOpen && selectedVerificationRequest && (
        <div className="due-modal-backdrop">
          <div className="due-modal" style={{ maxWidth: '600px' }}>
            <div className="due-modal-header">
              <h4>Verify Payment Proof</h4>
              <button className="due-close-btn" onClick={() => setVerifyPaymentModalOpen(false)}>
                <FaTimes />
              </button>
            </div>
            <div className="due-modal-body">
              <div className="verify-details-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px', background: '#1a1a1a', padding: '12px', borderRadius: '4px', border: '1px solid #333' }}>
                <div><strong>Dealer Name:</strong> <span style={{ color: '#aaa' }}>{selectedVerificationRequest.userId?.displayName || selectedVerificationRequest.userId?.username}</span></div>
                <div><strong>Payment Time:</strong> <span style={{ color: '#00bcd4', fontWeight: 'bold' }}>{formatDateTime(selectedVerificationRequest.paymentDate || selectedVerificationRequest.createdAt)}</span></div>
                <div><strong>Amount:</strong> <span style={{ color: '#2ecc71', fontWeight: 'bold' }}>₹{selectedVerificationRequest.amount.toLocaleString()}</span></div>
                <div><strong>Mode:</strong> <span style={{ color: '#aaa' }}>{selectedVerificationRequest.paymentMode}</span></div>
                <div><strong>Submitted Date:</strong> <span style={{ color: '#aaa' }}>{formatDateTime(selectedVerificationRequest.createdAt)}</span></div>
                <div><strong>Reference No:</strong> <span style={{ color: '#f39c12', fontWeight: 'bold', fontFamily: 'monospace' }}>{selectedVerificationRequest.referenceNumber}</span></div>
                {selectedVerificationRequest.remarks && <div style={{ gridColumn: 'span 2' }}><strong>Dealer Remarks:</strong> <span style={{ color: '#aaa', fontStyle: 'italic' }}>{selectedVerificationRequest.remarks}</span></div>}
              </div>

              {selectedVerificationRequest.screenshotUrl ? (
                <div className="verify-screenshot-section" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                  <strong>Uploaded Screenshot Proof:</strong>
                  <div className="screenshot-preview-container" style={{ border: '1px dashed #555', padding: '8px', borderRadius: '4px', display: 'flex', justifyContent: 'center', background: '#0e0e0e', maxHeight: '350px', overflow: 'auto' }}>
                    <img 
                      src={`${(api.defaults.baseURL || '').replace(/\/api$/, '')}${selectedVerificationRequest.screenshotUrl}`} 
                      alt="Payment Receipt Screenshot" 
                      style={{ maxWidth: '100%', maxHeight: '320px', objectFit: 'contain', cursor: 'pointer', borderRadius: '4px' }}
                      onClick={() => window.open(`${(api.defaults.baseURL || '').replace(/\/api$/, '')}${selectedVerificationRequest.screenshotUrl}`, '_blank')}
                      title="Click to open full size screenshot in new tab"
                      onError={(e) => {
                        e.target.src = selectedVerificationRequest.screenshotUrl;
                      }}
                    />
                  </div>
                  <span style={{ fontSize: '11px', color: '#888', textAlign: 'center' }}>💡 Click on the image to view it in full screen in a new tab.</span>
                </div>
              ) : (
                <div style={{ color: '#e74c3c', fontStyle: 'italic', marginBottom: '15px' }}>⚠️ No screenshot uploaded for this payment request (Cash payment).</div>
              )}

              <div className="form-group">
                <label>Admin Verification Remarks (Optional)</label>
                <textarea
                  rows="2"
                  placeholder="Enter remarks for this approval or rejection..."
                  value={verifyForm.adminRemarks}
                  onChange={(e) => setVerifyForm(prev => ({ ...prev, adminRemarks: e.target.value }))}
                />
              </div>
            </div>
            <div className="due-modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button 
                type="button" 
                className="due-action-btn" 
                style={{ background: '#e74c3c', color: '#fff', border: 'none' }}
                disabled={submittingVerify}
                onClick={() => handleVerifySubmit('Rejected')}
              >
                Reject / Decline
              </button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="due-btn-secondary" onClick={() => setVerifyPaymentModalOpen(false)}>
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="due-action-btn primary"
                  disabled={submittingVerify}
                  onClick={() => handleVerifySubmit('Approved')}
                >
                  {submittingVerify ? 'Processing...' : 'Approve & Recalculate Dues'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POPUP MODAL: RENEW DEVICE (ADMIN ONLY) */}
      {renewDevice && (
        <div className="due-modal-backdrop">
          <div className="due-modal" style={{ maxWidth: '450px', background: '#1a1a1a', border: '1px solid #333' }}>
            <div className="due-modal-header" style={{ borderBottom: '1px solid #333' }}>
              <h4 style={{ color: '#fff', margin: 0 }}>Renew Device</h4>
              <button className="due-close-btn" onClick={() => setRenewDevice(null)} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer' }}>
                <FaTimes />
              </button>
            </div>
            <form onSubmit={handleRenewSubmit}>
              <div className="due-modal-body" style={{ color: '#ffffff', padding: '20px' }}>
                <div className="form-group" style={{ marginBottom: '15px' }}>
                  <label style={{ color: '#aaa', fontSize: '11px', textTransform: 'uppercase', display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>IMEI Number</label>
                  <input type="text" value={renewDevice.imei} readOnly className="readonly-input" style={{ width: '100%', padding: '10px', background: '#2a2a2a', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none' }} />
                </div>
                <div className="form-group" style={{ marginBottom: '15px' }}>
                  <label style={{ color: '#aaa', fontSize: '11px', textTransform: 'uppercase', display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>Device Name / Model</label>
                  <input type="text" value={renewDevice.deviceName} readOnly className="readonly-input" style={{ width: '100%', padding: '10px', background: '#2a2a2a', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none' }} />
                </div>
                <div className="form-group" style={{ marginBottom: '15px' }}>
                  <label style={{ color: '#aaa', fontSize: '11px', textTransform: 'uppercase', display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>Customer Name</label>
                  <input type="text" value={renewDevice.customerName || 'N/A'} readOnly className="readonly-input" style={{ width: '100%', padding: '10px', background: '#2a2a2a', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none' }} />
                </div>
                <div className="form-group" style={{ marginBottom: '15px' }}>
                  <label style={{ color: '#aaa', fontSize: '11px', textTransform: 'uppercase', display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>Current Expiry Date</label>
                  <div style={{ fontSize: '14px', color: '#aaa', background: '#111', padding: '10px', borderRadius: '4px', border: '1px solid #222', fontWeight: 'bold' }}>
                    {formatDate(renewDevice.expiryDate)}
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: '15px' }}>
                  <label style={{ color: '#aaa', fontSize: '11px', textTransform: 'uppercase', display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>Select Renewal Validity</label>
                  <select
                    value={renewValidity}
                    onChange={(e) => setRenewValidity(e.target.value)}
                    style={{ width: '100%', minHeight: '38px', padding: '8px 10px', borderRadius: '4px', border: '1px solid #444', background: '#2a2a2a', color: '#fff', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="1 Year">1 Year</option>
                    <option value="2 Years">2 Years</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: '15px' }}>
                  <label style={{ color: '#aaa', fontSize: '11px', textTransform: 'uppercase', display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>New Expiry Date (calculated)</label>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#2ecc71', background: '#113c23', padding: '10px', borderRadius: '4px', border: '1px solid #27ae60' }}>
                    {(() => {
                      const cur = renewDevice.expiryDate ? new Date(renewDevice.expiryDate) : (renewDevice.presentDate ? new Date(renewDevice.presentDate) : new Date());
                      const next = new Date(cur);
                      next.setFullYear(next.getFullYear() + (renewValidity === '2 Years' ? 2 : 1));
                      return formatDate(next);
                    })()}
                  </div>
                </div>
              </div>
              <div className="due-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '15px 20px', borderTop: '1px solid #333' }}>
                <button type="button" className="due-btn-secondary" onClick={() => setRenewDevice(null)} style={{ background: '#333', color: '#aaa', border: '1px solid #444', borderRadius: '4px', padding: '8px 16px', fontWeight: '600', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={renewing} className="due-action-btn primary" style={{ background: '#2ecc71', color: '#ffffff', border: 'none', borderRadius: '4px', padding: '8px 16px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {renewing ? 'Renewing...' : 'Confirm Renewal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DueDashboard;
