import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { FaSyncAlt, FaPlus, FaTimes, FaSpinner, FaSearch, FaChevronDown, FaFileExcel } from 'react-icons/fa';
import * as XLSX from 'xlsx-js-style';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import './ActivationRequests.css';

const getRole = (user) => {
  if (user?.role === 'partner') return 'ADMIN';
  if (user?.userType === 'Administration') return 'ADMIN';
  if (user?.userType === 'Sub Dealer') return 'SUB_DEALER';
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
  const [todaySummary, setTodaySummary] = useState(null);
  const [summaryMode, setSummaryMode] = useState('all');
  const [todaySummaryDate, setTodaySummaryDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedUserFilter, setSelectedUserFilter] = useState('');
  const [selectedDealerFilter, setSelectedDealerFilter] = useState('');
  const [dealersList, setDealersList] = useState([]);
  const [excelDownloading, setExcelDownloading] = useState(false);
  const [excelFromDate, setExcelFromDate] = useState('');
  const [excelToDate, setExcelToDate] = useState('');

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
    trackingId: '',
    software: '',
    deviceBillAmount: null
  };

  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editRequestId, setEditRequestId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState(initialFormState);
  const [imeiError, setImeiError] = useState('');

  // KYC Upload States
  const [kycFiles, setKycFiles] = useState({ panCard: null, aadharCard: null, rcBook: null });
  const [kycUploading, setKycUploading] = useState({ panCard: false, aadharCard: false, rcBook: false });
  const [kycUploaded, setKycUploaded] = useState({ panCard: null, aadharCard: null, rcBook: null });

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
        isSubDealer: !!(prefillDevice.subDealerId || prefillDevice.subDealerName),
        subDealerName: prefillDevice.subDealerName || prefillDevice.subDealerId?.displayName || prefillDevice.subDealerId?.companyName || prefillDevice.subDealerId?.username || '',
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
        address: prefillRequest?.address || '',
        trackingId: prefillDevice?.trackingId || prefillRequest?.trackingId || '',
        software: prefillDevice?.software || prefillRequest?.software || ''
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
      if (isEditing) {
        setImeiError('');
        return;
      }
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
        const params = { page, limit, search };
        if (selectedUserFilter) {
          params.createdBy = selectedUserFilter;
        }
        if (selectedDealerFilter) {
          params.dealerId = selectedDealerFilter;
        }
        const response = await api.get('/activation-requests', { params });
        setRequests(response.data.requests);
        setTotalCount(response.data.total);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching activation requests:', err);
        setLoading(false);
      }
    };

    fetchRequests();
  }, [page, limit, search, refreshTrigger, selectedUserFilter, selectedDealerFilter]);

  // Fetch Raise Request Summary (Admin Only)
  useEffect(() => {
    if (role !== 'ADMIN') return;
    const fetchTodaySummary = async () => {
      try {
        const params = { mode: summaryMode };
        if (summaryMode === 'custom' || summaryMode === 'today') {
          params.date = todaySummaryDate;
        }
        const res = await api.get('/activation-requests/today-summary', { params });
        setTodaySummary(res.data);
      } catch (err) {
        console.error('Error fetching today summary:', err);
      }
    };
    fetchTodaySummary();
  }, [role, refreshTrigger, todaySummaryDate, summaryMode]);

  // Fetch Dealers List for Dealer Filter — only for partner (super admin)
  useEffect(() => {
    if (user?.role !== 'partner') return;
    const fetchDealers = async () => {
      try {
        const res = await api.get('/users/sub-users');
        const dealers = (res.data || []).filter(u =>
          u.userType === 'Dealer' || (u.role === 'partner' && !u.userType)
        );
        setDealersList(dealers);
      } catch (err) {
        console.error('Error fetching dealers:', err);
      }
    };
    fetchDealers();
  }, [user?.role]);

  // Excel Download Handler
  const handleExcelDownload = async () => {
    if (!selectedDealerFilter) {
      alert('Please select a Dealer first to download their customer data as Excel.');
      return;
    }
    setExcelDownloading(true);
    try {
      // Build params — dealer + optional date range
      const fetchParams = {
        dealerId: selectedDealerFilter,
        limit: 10000,
        page: 1,
      };
      if (excelFromDate) fetchParams.fromDate = excelFromDate;
      if (excelToDate)   fetchParams.toDate   = excelToDate;

      const res = await api.get('/activation-requests', { params: fetchParams });
      const allRequests = res.data.requests || [];

      if (allRequests.length === 0) {
        const rangeMsg = excelFromDate || excelToDate
          ? ` for the selected date range (${excelFromDate || 'start'} → ${excelToDate || 'end'})`
          : '';
        alert(`No requests found for the selected dealer${rangeMsg}.`);
        setExcelDownloading(false);
        return;
      }

      // Column definitions — header + data key mapping + width
      const columns = [
        { header: 'SR_NO',                                              key: null,               width: 8  },
        { header: 'DEVICE_IMEI*',                                       key: 'imei',             width: 20 },
        { header: 'ENGINE_NO*',                                         key: 'engineNo',         width: 20 },
        { header: 'CHASSIS_NO',                                         key: 'chassisNo',        width: 22 },
        { header: 'Vehicle type Old/New*',                              key: 'vehicleCondition', width: 20 },
        { header: 'Vehicle Make/Manufacturer*',                         key: 'vehicleMake',      width: 25 },
        { header: 'Vehicle Model*',                                     key: 'vehicleModel',     width: 18 },
        { header: 'End_Customer_NAME*',                                 key: 'customerName',     width: 25 },
        { header: 'Registerd Mobile no. (RMN)*',                       key: 'regMobNo',         width: 22 },
        { header: 'RTO State',                                          key: '_rtoState',        width: 15 },
        { header: 'RTO No.(In which RTO vehicle go for registration)*', key: 'rto',              width: 40 },
        { header: 'Address*',                                           key: 'address',          width: 35 },
        { header: 'PROOF OF ADDRESS*',                                  key: '_poa',             width: 20 },
        { header: 'POA No*',                                            key: 'aadharNo',         width: 20 },
        { header: 'PROOF OF IDENTITY',                                  key: '_poi',             width: 20 },
        { header: 'POI No',                                             key: '_poiNo',           width: 20 },
        { header: 'Vehicle No*',                                        key: 'vehicleNo',        width: 15 },
      ];

      // Helper: make a TEXT cell (prevents number/scientific notation)
      const t = (val) => ({
        t: 's',
        v: val === null || val === undefined ? '' : String(val),
      });

      // Header row
      const headerRow = columns.map(col => ({
        t: 's',
        v: col.header,
        s: {
          font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
          fill: { patternType: 'solid', fgColor: { rgb: '1D4ED8' } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: {
            top:    { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left:   { style: 'thin', color: { rgb: '000000' } },
            right:  { style: 'thin', color: { rgb: '000000' } },
          },
        },
      }));

      // Data rows
      const dataRows = allRequests.map((req, idx) => {
        const rtoFull = req.rto || '';
        const rtoParts = rtoFull.trim().split(/\s+/);
        const rtoState = rtoParts.length > 0 ? rtoParts[0] : rtoFull;

        const poaType = req.aadharNo ? 'Aadhaar Card' : '';

        return columns.map(col => {
          let val = '';
          if (col.key === null) {
            val = String(idx + 1);               // SR_NO
          } else if (col.key === '_rtoState') {
            val = rtoState;
          } else if (col.key === '_poa') {
            val = poaType;
          } else if (col.key === '_poi') {
            val = poaType;
          } else if (col.key === '_poiNo') {
            val = req.aadharNo || '';
          } else {
            val = req[col.key] || '';
          }
          return t(val);
        });
      });

      // Combine header + data into array-of-arrays
      const aoa = [headerRow, ...dataRows];

      // Create sheet from AoA
      const ws = XLSX.utils.aoa_to_sheet(aoa);

      // Column widths
      ws['!cols'] = columns.map(col => ({ wch: col.width }));

      // Freeze top row
      ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

      // Row height for header
      ws['!rows'] = [{ hpt: 36 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Customer Data');

      // Dealer name for filename
      const dealer = dealersList.find(d => d._id === selectedDealerFilter);
      const dealerName = dealer?.displayName || dealer?.companyName || dealer?.username || 'Dealer';
      const safeName = dealerName.replace(/[^a-zA-Z0-9]/g, '_');
      const dateTag = excelFromDate && excelToDate
        ? `_${excelFromDate}_to_${excelToDate}`
        : excelFromDate
          ? `_from_${excelFromDate}`
          : excelToDate
            ? `_till_${excelToDate}`
            : `_${new Date().toISOString().slice(0, 10)}`;
      const fileName = `${safeName}_CLA_CustomerData${dateTag}.xlsx`;

      XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error('Excel download error:', err);
      alert('Failed to download Excel. Please try again.');
    } finally {
      setExcelDownloading(false);
    }
  };

  // Amount Auto-calculation
  useEffect(() => {
    const qty = formData.quantity || 1;
    const customAmt = formData.deviceBillAmount || 0;
    if (formData.amount !== qty * customAmt) {
      setFormData(prev => ({ ...prev, amount: qty * customAmt }));
    }
  }, [formData.quantity, formData.deviceBillAmount]);

  // Load Devices on Modal Open & On Search Query Change
  useEffect(() => {
    if (showModal) {
      const fetchAvailableDevices = async () => {
        try {
          setLoadingDevices(true);
          const params = deviceSearch.trim()
            ? { search: deviceSearch.trim(), limit: 500 }
            : { limit: 'all' };

          const response = await api.get('/devices', { params });
          setAvailableDevices(response.data.devices || []);
        } catch (err) {
          console.error('Error fetching devices:', err);
        } finally {
          setLoadingDevices(false);
        }
      };

      const timer = setTimeout(() => {
        fetchAvailableDevices();
      }, 250);

      return () => clearTimeout(timer);
    }
  }, [showModal, deviceSearch]);

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
      isSubDealer: !!(device.subDealerId || device.subDealerName),
      subDealerName: device.subDealerName || device.subDealerId?.displayName || device.subDealerId?.companyName || device.subDealerId?.username || '',
      vendor: device.vendor || '',
      itrNo: device.itrNo || '',
      trackingId: device.trackingId || '',
      software: device.software || '',
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
      trackingId: req.trackingId || '',
      software: req.software || '',
      deviceBillAmount: null
    });
    setEditRequestId(req._id);
    setIsEditing(true);
    setKycFiles({ panCard: null, aadharCard: null, rcBook: null });
    setKycUploaded({ panCard: null, aadharCard: null, rcBook: null });
    loadKycDocuments(req._id);
    setShowModal(true);
  };

  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let requestId = editRequestId;
      if (isEditing) {
        await api.put(`/activation-requests/${editRequestId}`, formData);
      } else {
        const res = await api.post('/activation-requests', formData);
        requestId = res.data?.request?._id || res.data?._id;
      }

      // Upload KYC files if any selected
      if (requestId) {
        const kycTypes = [
          { key: 'panCard', label: 'PAN Card' },
          { key: 'aadharCard', label: 'Aadhar Card' },
          { key: 'rcBook', label: 'RC Book' },
        ];
        for (const kt of kycTypes) {
          if (kycFiles[kt.key]) {
            const fd = new FormData();
            fd.append('file', kycFiles[kt.key]);
            fd.append('documentType', kt.label);
            await api.post(`/activation-requests/${requestId}/kyc`, fd, {
              headers: { 'Content-Type': 'multipart/form-data' }
            }).catch(err => console.error(`KYC upload error (${kt.label}):`, err));
          }
        }
      }

      alert(isEditing ? 'Activation Request updated successfully!' : 'Activation Request raised successfully!');
      setShowModal(false);
      setSubmitting(false);
      setIsEditing(false);
      setEditRequestId(null);
      setFormData(initialFormState);
      setKycFiles({ panCard: null, aadharCard: null, rcBook: null });
      setKycUploaded({ panCard: null, aadharCard: null, rcBook: null });
      handleRefresh();
    } catch (err) {
      console.error('Error submitting request:', err);
      setSubmitting(false);
      alert(err.response?.data?.message || 'Failed to submit request.');
    }
  };

  // Load existing KYC documents when editing
  const loadKycDocuments = async (reqId) => {
    try {
      const res = await api.get(`/activation-requests/${reqId}/kyc`);
      const docs = res.data?.kycDocuments || [];
      const uploaded = { panCard: null, aadharCard: null, rcBook: null };
      docs.forEach(doc => {
        if (doc.documentType === 'PAN Card') uploaded.panCard = doc;
        if (doc.documentType === 'Aadhar Card') uploaded.aadharCard = doc;
        if (doc.documentType === 'RC Book') uploaded.rcBook = doc;
      });
      setKycUploaded(uploaded);
    } catch (err) {
      console.error('Error loading KYC documents:', err);
    }
  };

  const handleOpenKycLink = async (doc) => {
    if (!doc || !doc.fileUrl) return;
    try {
      const response = await api.get(doc.fileUrl, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: doc.mimeType || 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      console.error('Error opening KYC document:', err);
      const backendBase = (api.defaults.baseURL || '').replace(/\/api$/, '');
      const token = localStorage.getItem('token') || '';
      const fileUrl = doc.fileUrl.startsWith('http')
        ? doc.fileUrl
        : `${backendBase}${doc.fileUrl}?token=${token}`;
      window.open(fileUrl, '_blank');
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

      {/* ── CLA Request Download Panel (partner / super-admin only) ── */}
      {user?.role === 'partner' && (
        <div style={{
          background: 'linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 100%)',
          borderRadius: '12px',
          padding: '14px 20px',
          marginBottom: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          flexWrap: 'wrap',
          boxShadow: '0 4px 16px rgba(29,78,216,0.25)',
        }}>
          {/* Label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '180px' }}>
            <FaFileExcel style={{ color: '#4ade80', fontSize: '22px', flexShrink: 0 }} />
            <div>
              <div style={{ color: '#fff', fontWeight: '700', fontSize: '13px', letterSpacing: '0.3px' }}>
                CLA Request Format
              </div>
              <div style={{ color: '#93c5fd', fontSize: '11px', fontWeight: '500' }}>
                Download dealer customer data
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: '1px', height: '36px', background: 'rgba(255,255,255,0.2)', flexShrink: 0 }} />

          {/* Dealer Select */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: '1', minWidth: '180px' }}>
            <label style={{ color: '#bfdbfe', fontSize: '10px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Select Dealer
            </label>
            <select
              value={selectedDealerFilter}
              onChange={(e) => {
                setSelectedDealerFilter(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '7px 12px',
                borderRadius: '7px',
                border: selectedDealerFilter ? '1.5px solid #4ade80' : '1.5px solid rgba(255,255,255,0.3)',
                fontSize: '12px',
                color: '#1e293b',
                background: '#fff',
                fontWeight: '600',
                cursor: 'pointer',
                minWidth: '200px',
                outline: 'none',
              }}
            >
              <option value="">🏢 -- Select Dealer --</option>
              {dealersList.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.displayName || d.companyName || d.username}
                </option>
              ))}
            </select>
          </div>

          {/* Divider */}
          <div style={{ width: '1px', height: '36px', background: 'rgba(255,255,255,0.2)', flexShrink: 0 }} />

          {/* Date Range — From */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <label style={{ color: '#bfdbfe', fontSize: '10px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              From Date
            </label>
            <input
              type="date"
              value={excelFromDate}
              onChange={(e) => setExcelFromDate(e.target.value)}
              style={{
                padding: '7px 10px',
                borderRadius: '7px',
                border: excelFromDate ? '1.5px solid #4ade80' : '1.5px solid rgba(255,255,255,0.3)',
                fontSize: '12px',
                color: '#1e293b',
                background: '#fff',
                fontWeight: '600',
                outline: 'none',
                cursor: 'pointer',
                minWidth: '130px',
              }}
            />
          </div>

          {/* Arrow separator */}
          <span style={{ color: '#93c5fd', fontWeight: '700', fontSize: '16px', flexShrink: 0, alignSelf: 'center', marginTop: '14px' }}>→</span>

          {/* Date Range — To */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <label style={{ color: '#bfdbfe', fontSize: '10px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              To Date
            </label>
            <input
              type="date"
              value={excelToDate}
              onChange={(e) => setExcelToDate(e.target.value)}
              style={{
                padding: '7px 10px',
                borderRadius: '7px',
                border: excelToDate ? '1.5px solid #4ade80' : '1.5px solid rgba(255,255,255,0.3)',
                fontSize: '12px',
                color: '#1e293b',
                background: '#fff',
                fontWeight: '600',
                outline: 'none',
                cursor: 'pointer',
                minWidth: '130px',
              }}
            />
          </div>

          {/* Quick Preset Buttons for Past Months */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', marginTop: '14px' }}>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
                const todayStr = now.toISOString().slice(0, 10);
                setExcelFromDate(firstDay);
                setExcelToDate(todayStr);
              }}
              style={{
                padding: '4px 8px',
                borderRadius: '5px',
                border: '1px solid rgba(255,255,255,0.25)',
                background: 'rgba(255,255,255,0.1)',
                color: '#e0e7ff',
                fontSize: '10px',
                fontWeight: '600',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
                const lastDay = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
                setExcelFromDate(firstDay);
                setExcelToDate(lastDay);
              }}
              style={{
                padding: '4px 8px',
                borderRadius: '5px',
                border: '1px solid rgba(255,255,255,0.25)',
                background: 'rgba(255,255,255,0.1)',
                color: '#e0e7ff',
                fontSize: '10px',
                fontWeight: '600',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Last Month
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                const firstDay = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10);
                const todayStr = now.toISOString().slice(0, 10);
                setExcelFromDate(firstDay);
                setExcelToDate(todayStr);
              }}
              style={{
                padding: '4px 8px',
                borderRadius: '5px',
                border: '1px solid rgba(255,255,255,0.25)',
                background: 'rgba(255,255,255,0.1)',
                color: '#e0e7ff',
                fontSize: '10px',
                fontWeight: '600',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Last 3 Months
            </button>
            {(excelFromDate || excelToDate) && (
              <button
                type="button"
                onClick={() => {
                  setExcelFromDate('');
                  setExcelToDate('');
                }}
                title="Reset Date Range (Select All Records)"
                style={{
                  padding: '4px 8px',
                  borderRadius: '5px',
                  border: '1px solid rgba(239,68,68,0.4)',
                  background: 'rgba(239,68,68,0.2)',
                  color: '#fca5a5',
                  fontSize: '10px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                ✕ Reset Dates
              </button>
            )}
          </div>

          {/* Download Button */}
          <button
            onClick={handleExcelDownload}
            disabled={excelDownloading || !selectedDealerFilter}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 20px',
              borderRadius: '8px',
              border: 'none',
              background: selectedDealerFilter
                ? 'linear-gradient(135deg, #16a34a, #15803d)'
                : 'rgba(255,255,255,0.15)',
              color: selectedDealerFilter ? '#fff' : 'rgba(255,255,255,0.45)',
              fontSize: '13px',
              fontWeight: '700',
              cursor: selectedDealerFilter && !excelDownloading ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
              boxShadow: selectedDealerFilter ? '0 3px 10px rgba(22,163,74,0.4)' : 'none',
              letterSpacing: '0.3px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
            title={selectedDealerFilter ? 'Download CLA Request Excel' : 'Select a dealer first'}
          >
            {excelDownloading
              ? <><FaSpinner style={{ animation: 'spin 1s linear infinite' }} /> Downloading...</>
              : <><FaFileExcel style={{ fontSize: '16px' }} /> ⬇ Download Excel</>
            }
          </button>

          {/* Clear Filter */}
          {selectedDealerFilter && (
            <button
              onClick={() => { setSelectedDealerFilter(''); setPage(1); }}
              title="Clear dealer filter"
              style={{
                padding: '7px 12px',
                borderRadius: '7px',
                border: '1.5px solid rgba(255,255,255,0.3)',
                background: 'rgba(239,68,68,0.15)',
                color: '#fca5a5',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              ✕ Clear
            </button>
          )}
        </div>
      )}

      {/* ── Main Header Bar ── */}
      <div className="requests-header">
        <span className="requests-title">
          <FaSyncAlt style={{ cursor: 'pointer' }} onClick={handleRefresh} />
          LATEST UPLOADED REQUESTS
        </span>
        <button className="btn-raise" onClick={() => {
          setFormData(initialFormState);
          setIsEditing(false);
          setEditRequestId(null);
          setShowModal(true);
        }}>
          <FaPlus /> Raise Request
        </button>
      </div>

      {/* Raise Request Summary (Admin Only) */}
      {role === 'ADMIN' && todaySummary && (
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '16px 20px',
          marginBottom: '18px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                📊 Raise Request Summary
              </h3>
              
              {/* Mode Toggle Buttons */}
              <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: '8px', padding: '2px' }}>
                <button
                  type="button"
                  onClick={() => setSummaryMode('all')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: summaryMode === 'all' ? '#0ea5e9' : 'transparent',
                    color: summaryMode === 'all' ? '#ffffff' : '#64748b',
                    fontSize: '11px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  All Time
                </button>
                <button
                  type="button"
                  onClick={() => setSummaryMode('thisMonth')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: summaryMode === 'thisMonth' ? '#0ea5e9' : 'transparent',
                    color: summaryMode === 'thisMonth' ? '#ffffff' : '#64748b',
                    fontSize: '11px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  This Month
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSummaryMode('today');
                    setTodaySummaryDate(new Date().toISOString().slice(0, 10));
                  }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: summaryMode === 'today' ? '#0ea5e9' : 'transparent',
                    color: summaryMode === 'today' ? '#ffffff' : '#64748b',
                    fontSize: '11px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setSummaryMode('custom')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: summaryMode === 'custom' ? '#0ea5e9' : 'transparent',
                    color: summaryMode === 'custom' ? '#ffffff' : '#64748b',
                    fontSize: '11px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  Custom Date
                </button>
              </div>

              {summaryMode === 'custom' && (
                <input
                  type="date"
                  value={todaySummaryDate}
                  onChange={(e) => setTodaySummaryDate(e.target.value)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1.5px solid #0ea5e9',
                    fontSize: '11px',
                    color: '#334155',
                    outline: 'none',
                    fontWeight: '600'
                  }}
                />
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <select
                value={selectedUserFilter}
                onChange={(e) => {
                  setSelectedUserFilter(e.target.value);
                  setPage(1);
                }}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid #0ea5e9',
                  fontSize: '12px',
                  color: '#0f172a',
                  background: '#f0f9ff',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                <option value="">👤 All Users / IDs</option>
                {(todaySummary.users || []).map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.userName || 'Unknown'} {u.username ? `(${u.username})` : ''} — {u.totalRequests} raised
                  </option>
                ))}
              </select>

              {selectedUserFilter && (
                <button
                  onClick={() => setSelectedUserFilter('')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#ef4444',
                    color: '#fff',
                    fontSize: '11px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  ✕ Clear Filter
                </button>
              )}

              <span style={{
                background: '#0ea5e9',
                color: '#fff',
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '700',
              }}>
                Total Raised: {todaySummary.grandTotal}
              </span>
              <span style={{
                background: '#10b981',
                color: '#fff',
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '700',
              }}>
                ₹{(todaySummary.grandAmount || 0).toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {(todaySummary.users || []).length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '13px', margin: '8px 0 0' }}>No raise requests found for this period.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: '#475569', borderBottom: '2px solid #e2e8f0' }}>User Name</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: '#475569', borderBottom: '2px solid #e2e8f0' }}>User ID</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: '700', color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Role</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: '700', color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Total</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: '700', color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Commercial</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: '700', color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Top-up</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: '700', color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Recharge</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: '700', color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Processing</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: '700', color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Completed</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '700', color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(todaySummary.users || []).map((item, idx) => {
                    const isSelected = selectedUserFilter === String(item._id);
                    return (
                      <tr
                        key={item._id || idx}
                        onClick={() => {
                          setSelectedUserFilter(isSelected ? '' : String(item._id));
                          setPage(1);
                        }}
                        style={{
                          background: isSelected ? '#e0f2fe' : (idx % 2 === 0 ? '#fff' : '#f8fafc'),
                          borderBottom: '1px solid #f1f5f9',
                          cursor: 'pointer',
                          transition: 'background 0.2s',
                        }}
                        title="Click to filter requests by this user"
                      >
                        <td style={{ padding: '8px 10px', fontWeight: '600', color: '#1e293b' }}>{item.userName || 'Unknown'}</td>
                        <td style={{ padding: '8px 10px', color: '#64748b' }}>{item.username || '-'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <span style={{
                            background: item.userType === 'Administration' ? '#dbeafe' : item.userType === 'Dealer' ? '#fef3c7' : '#e0e7ff',
                            color: item.userType === 'Administration' ? '#1e40af' : item.userType === 'Dealer' ? '#92400e' : '#3730a3',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '11px',
                            fontWeight: '600',
                          }}>
                            {item.userType || 'Admin'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: '700', color: '#0ea5e9', fontSize: '14px' }}>{item.totalRequests}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', color: '#334155' }}>{item.commercialPlan || 0}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', color: '#334155' }}>{item.topUp || 0}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', color: '#334155' }}>{item.rechargePlan || 0}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <span style={{ background: '#fef9c3', color: '#a16207', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600' }}>
                            {item.processing || 0}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600' }}>
                            {item.completed || 0}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '600', color: '#059669' }}>₹{(item.totalAmount || 0).toLocaleString('en-IN')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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

                    <div className="form-group-custom">
                      <label>Sub Dealer Name</label>
                      <input 
                        type="text" 
                        value={formData.subDealerName || ''} 
                        className="readonly-input" 
                        readOnly 
                        placeholder="Auto-filled"
                      />
                    </div>

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
                      <label>Model</label>
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
                        <option value="NA">NA</option>
                        {Array.from({ length: 25 }, (_, i) => {
                          const year = new Date().getFullYear() - i;
                          return <option key={year} value={year}>{year}</option>;
                        })}
                      </select>
                    </div>

                    <div className="form-group-custom">
                      <label>Vehicle Number {formData.vehicleCondition !== 'New' && <span className="required-star">*</span>}</label>
                      <input 
                        type="text" 
                        value={formData.vehicleNo}
                        onChange={(e) => setFormData({...formData, vehicleNo: e.target.value.toUpperCase()})}
                        placeholder="e.g. RJ14-GA-1234"
                        style={{ textTransform: 'uppercase' }}
                        required={formData.vehicleCondition !== 'New'}
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

                    <div className="form-group-custom">
                      <label>Tracking ID</label>
                      <input 
                        type="text" 
                        value={formData.trackingId}
                        onChange={(e) => setFormData({...formData, trackingId: e.target.value})}
                        placeholder="Enter Tracking ID"
                      />
                    </div>

                    <div className="form-group-custom">
                      <label>Software</label>
                      <select 
                        value={formData.software}
                        onChange={(e) => setFormData({...formData, software: e.target.value})}
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
                  <th>Raised By (User ID)</th>
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
                </tr>
              )}
            </thead>
            <tbody>
              {requests.length > 0 ? (
                requests.map((req, index) => {
                  const displayStatus = req.status === 'Completed' ? 'Active' : req.status;
                  const statusClass = displayStatus.toLowerCase();

                  if (role === 'ADMIN') {
                    const creatorName = req.createdBy?.displayName || req.createdBy?.companyName || req.createdBy?.username || '--';
                    const creatorId = req.createdBy?.username || '';
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
                          <span style={{ fontWeight: '600', color: '#1e293b' }}>{creatorName}</span>
                          {creatorId && (
                            <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>
                              ({creatorId})
                            </span>
                          )}
                        </td>
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
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={role === 'ADMIN' ? '10' : '12'} style={{ textAlign: 'center', padding: '20px', color: '#999', fontStyle: 'italic' }}>
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
