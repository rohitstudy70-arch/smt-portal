import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  FaSpinner, 
  FaFileInvoiceDollar, 
  FaUsers, 
  FaFileAlt, 
  FaEdit, 
  FaTrash, 
  FaPlus, 
  FaTimes, 
  FaPrint,
  FaCheck,
  FaMoneyBillWave 
} from 'react-icons/fa';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { INVOICE_LOGO } from '../../utils/invoiceLogo';
import { renderProformaInvoiceHtml } from '../../utils/proformaInvoiceTemplate';
import DealerBillGenerator from './DealerBillGenerator';
import { printDealerBill } from '../../utils/dealerBillTemplate';
import './InvoiceGenerator.css';

const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam",
  "Bihar", "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
  "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

const DEFAULT_INVOICE_ITEMS = [
  {
    description: 'VLTD',
    validity: '12 Month',
    priceWithGst: 2370,
    qty: 10
  }
];

const MAX_PRODUCT_ROWS = 6;

const createDefaultInvoiceItems = () => DEFAULT_INVOICE_ITEMS
  .slice(0, MAX_PRODUCT_ROWS)
  .map(item => ({ ...item }));

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundCurrency = (value) => Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

const parseQty = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const getItemGstRate = (item, fallback = 18) => {
  if (item.gstRate !== undefined && item.gstRate !== '') {
    return toNumber(item.gstRate);
  }

  const cgst = toNumber(item.cgst);
  const sgst = toNumber(item.sgst);
  const igst = toNumber(item.igst);
  return igst || (cgst + sgst) || fallback;
};

const InvoiceGenerator = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Tab State: 'single' | 'dealer-consolidated'
  const [activeTab, setActiveTab] = useState('single');

  // Form State
  const [piNo, setPiNo] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [endCustomerName, setEndCustomerName] = useState('');
  const [rmn, setRmn] = useState('');
  const [address, setAddress] = useState('');
  const [poaNo, setPoaNo] = useState(''); // GSTIN/PAN/Aadhaar
  const [customerState, setCustomerState] = useState('Bihar');
  const [isSubDealer, setIsSubDealer] = useState(false);
  const [subDealerName, setSubDealerName] = useState('');
  const [dealerState, setDealerState] = useState('Bihar');
  const [vehicleType, setVehicleType] = useState('Truck');
  const [validity, setValidity] = useState('1 Year');
  const [searchImei, setSearchImei] = useState('');
  
  // Vehicle Details
  const [vehicleNo, setVehicleNo] = useState('');
  const [engineNo, setEngineNo] = useState('');
  const [chassisNo, setChassisNo] = useState('');
  const [vehicleTypeOldNew, setVehicleTypeOldNew] = useState('New');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [rtoState, setRtoState] = useState('');
  const [rtoNo, setRtoNo] = useState('');

  // KYC
  const [proofOfAddress, setProofOfAddress] = useState('GST Certificate');
  const [proofOfIdentity, setProofOfIdentity] = useState('PAN Card');
  const [poiNo, setPoiNo] = useState('');

  const [singleSubmitting, setSingleSubmitting] = useState(false);
  const [credentialsToShow, setCredentialsToShow] = useState(null);
  const [dealersList, setDealersList] = useState([]);
  const [isCustomDealer, setIsCustomDealer] = useState(false);

  // Dynamic PI product rows.
  const [items, setItems] = useState(createDefaultInvoiceItems);

  const activeState = isSubDealer ? dealerState : customerState;
  const isIntraState = activeState && activeState.toLowerCase() === 'bihar';

  // Helper to calculate details for one item
  const calculateItemDetails = (item) => {
    const priceWithGst = toNumber(item.priceWithGst);
    const qty = parseQty(item.qty);

    const unitPrice = roundCurrency(priceWithGst / 1.18);
    const gstAmount = roundCurrency(priceWithGst - unitPrice);
    const total = roundCurrency(unitPrice * qty);

    let cgstRate = 0, sgstRate = 0, igstRate = 0;
    
    if (isIntraState) {
      cgstRate = 9;
      sgstRate = 9;
    } else {
      igstRate = 18;
    }

    const cgstAmt = roundCurrency((total * cgstRate) / 100);
    const sgstAmt = roundCurrency((total * sgstRate) / 100);
    const igstAmt = roundCurrency((total * igstRate) / 100);
    
    const grossAmt = roundCurrency(total + cgstAmt + sgstAmt + igstAmt);

    return {
      ...item,
      gstRate: 18,
      cgstRate,
      sgstRate,
      igstRate,
      cgstAmt,
      sgstAmt,
      igstAmt,
      taxableValue: total,
      priceWithGst,
      unitPrice,
      gstAmount,
      grossAmt
    };
  };

  const handleAddItem = () => {
    if (items.length >= MAX_PRODUCT_ROWS) {
      alert('Maximum 6 product rows are allowed in one PI bill.');
      return;
    }

    setItems([
      ...items,
      {
        description: '',
        validity: '12 Month',
        priceWithGst: 0,
        qty: 1
      }
    ]);
  };

  const handleRemoveItem = (index) => {
    if (items.length === 1) {
      alert('At least one product row is required in the PI bill.');
      return;
    }
    setItems(items.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;
    setItems(updated);
  };

  const totalInvoiceValue = roundCurrency(items.reduce((sum, item) => {
    const detailed = calculateItemDetails(item);
    return sum + detailed.grossAmt;
  }, 0));

  const fetchNextPiNo = async () => {
    try {
      const response = await api.get('/invoices/next-pi-no');
      setPiNo(response.data.nextPiNo);
      if (response.data.nextInvoiceNo) {
        setInvoiceNo(response.data.nextInvoiceNo);
      }
    } catch (err) {
      console.error('Error fetching next PI number:', err);
    }
  };

  useEffect(() => {
    fetchNextPiNo();
  }, []);

  // Fetch dealers list for dropdown
  useEffect(() => {
    const fetchDealers = async () => {
      try {
        const res = await api.get('/users/sub-users');
        if (res.data) {
          const filtered = res.data.filter(u => u.userType === 'Dealer' || u.userType === 'Sub Dealer');
          setDealersList(filtered);
        }
      } catch (err) {
        console.error('Error fetching dealers for dropdown:', err);
      }
    };
    fetchDealers();
  }, []);

  // Auto-fetch customer details by RMN
  useEffect(() => {
    if (rmn && rmn.length === 10) {
      const fetchCustomerInfo = async () => {
        try {
          const res = await api.get(`/activation-requests/customer/${rmn}`);
          if (res.data) {
            setEndCustomerName(prev => prev || res.data.customerName || '');
            setAddress(prev => prev || res.data.address || '');
            setPoaNo(prev => prev || res.data.aadharNo || '');
          }
        } catch (error) {
          // Ignore if not found
        }
      };
      fetchCustomerInfo();
    }
  }, [rmn]);

  // Read URL imei query parameter on mount
  useEffect(() => {
    const queryImei = searchParams.get('imei');
    if (queryImei) {
      setSearchImei(queryImei);
    }
  }, [searchParams]);

  // Auto-fetch device and activation details by IMEI
  useEffect(() => {
    if (searchImei && searchImei.length === 15) {
      const fetchDeviceInfo = async () => {
        try {
          const res = await api.get(`/activation-requests/device/${searchImei}`);
          if (res.data) {
            const reqData = res.data;
            if (reqData.customerName) setEndCustomerName(reqData.customerName);
            if (reqData.regMobNo) setRmn(reqData.regMobNo);
            if (reqData.address) setAddress(reqData.address);
            if (reqData.aadharNo) setPoaNo(reqData.aadharNo);
            if (reqData.vehicleNo) setVehicleNo(reqData.vehicleNo);
            if (reqData.engineNo) setEngineNo(reqData.engineNo);
            if (reqData.chassisNo) setChassisNo(reqData.chassisNo);
            if (reqData.vehicleMake) setVehicleMake(reqData.vehicleMake);
            if (reqData.vehicleModel) setVehicleModel(reqData.vehicleModel);
            if (reqData.rto) setRtoNo(reqData.rto);
            if (reqData.validity) setValidity(reqData.validity);
            if (reqData.piNo) setPiNo(reqData.piNo);
          }
        } catch (error) {
          console.log('No activation request found for IMEI to autofill:', error.message);
        }
      };
      fetchDeviceInfo();
    }
  }, [searchImei]);

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        setLoading(true);
        const response = await api.get('/invoices', {
          params: { page, limit, search }
        });
        setRequests(response.data.requests);
        setTotalCount(response.data.total);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching invoices:', err);
        setLoading(false);
      }
    };

    fetchRequests();
  }, [page, limit, search, refreshTrigger]);

  const handleSingleSubmit = async (e) => {
    e.preventDefault();
    if (!endCustomerName.trim()) {
      alert('Please enter Customer Name.');
      return;
    }
    if (!address.trim()) {
      alert('Please enter Customer Address.');
      return;
    }
    if (!rmn.trim()) {
      alert('Please enter Customer Mobile (RMN).');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(rmn.trim())) {
      alert('Please enter a valid 10-digit Indian mobile number (RMN).');
      return;
    }

    const detailedItems = items.slice(0, MAX_PRODUCT_ROWS).map(item => {
      const det = calculateItemDetails(item);
      return {
        description: det.description,
        validity: det.validity,
        unitPrice: toNumber(det.unitPrice),
        cgst: toNumber(det.cgstRate),
        sgst: toNumber(det.sgstRate),
        igst: toNumber(det.igstRate),
        priceWithGst: det.priceWithGst,
        qty: parseQty(det.qty) || 1,
        grossAmt: det.grossAmt
      };
    });

    const totalVal = roundCurrency(detailedItems.reduce((sum, item) => sum + item.grossAmt, 0));

    setSingleSubmitting(true);
    try {
      const response = await api.post('/invoices', {
        vehicleType,
        validity,
        imei: searchImei || 'N/A',
        iccid: searchImei || 'N/A',
        isSubDealer: isSubDealer,
        subDealerName: subDealerName,
        customerState,
        dealerState,
        piNo: piNo || 'AE_PI_001',
        piValue: totalVal,
        invoiceNo,
        engineNo,
        chassisNo,
        vehicleTypeOldNew,
        vehicleMake,
        vehicleModel,
        endCustomerName,
        rmn,
        rtoState,
        rtoNo,
        address,
        proofOfAddress,
        poaNo,
        proofOfIdentity,
        poiNo,
        vehicleNo,
        items: detailedItems
      });

      const { customerCredentials } = response.data;
      if (customerCredentials && customerCredentials.isNew) {
        setCredentialsToShow(customerCredentials);
      }

      // Clear/Reset form
      setPiNo('');
      setInvoiceNo('');
      setEndCustomerName('');
      setRmn('');
      setAddress('');
      setPoaNo('');
      setIsSubDealer(false);
      setSubDealerName('');
      setSearchImei('');
      setVehicleNo('');
      setEngineNo('');
      setChassisNo('');
      setVehicleMake('');
      setVehicleModel('');
      setRtoState('');
      setRtoNo('');
      setPoiNo('');
      setItems(createDefaultInvoiceItems());

      const createdInvoiceId = response.data?._id;
      setRefreshTrigger(prev => prev + 1);
      setSingleSubmitting(false);
      alert('PI No Generated & Saved Successfully!');
      fetchNextPiNo();
      if (createdInvoiceId) {
        navigate(`/invoice/${createdInvoiceId}`);
      }
    } catch (err) {
      console.error('Error submitting invoice:', err);
      setSingleSubmitting(false);
      alert(err.response?.data?.message || 'Failed to generate PI bill.');
    }
  };

  const handleDownloadInvoice = (req) => {
    if (req.invoiceType === 'DealerConsolidated') {
      printDealerBill({
        invoice: req,
        dealer: req.dealerId || {
          displayName: req.endCustomerName,
          companyName: req.endCustomerName,
          address: req.address,
          gstNo: req.poaNo,
          mobileNo: req.rmn,
          state: req.dealerState || req.customerState || 'Bihar',
        },
        items: req.items || [],
        allImeis: req.imeiList || [],
      });
      return;
    }

    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) {
      alert('Popup blocker enabled. Please allow popups to download/print the PI bill.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(renderProformaInvoiceHtml(req, {
      logo: INVOICE_LOGO,
      includeActions: true,
      autoPrint: true,
    }));
    printWindow.document.close();
  };

  // State for Editing Invoice / Bill
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [editForm, setEditForm] = useState({
    _id: '',
    invoiceType: 'Single',
    endCustomerName: '',
    rmn: '',
    address: '',
    poaNo: '',
    customerState: 'Bihar',
    dealerState: 'Bihar',
    isSubDealer: false,
    subDealerName: '',
    piNo: '',
    invoiceNo: '',
    dateTime: '',
    vehicleNo: '',
    vehicleType: '',
    vehicleMake: '',
    vehicleModel: '',
    engineNo: '',
    chassisNo: '',
    rtoState: '',
    rtoNo: '',
    notes: '',
    discount: 0,
    paymentStatus: 'Unpaid',
    paidAmount: 0,
    paymentRemarks: '',
    items: [],
  });
  const [editSaving, setEditSaving] = useState(false);

  // Quick Payment Status ("Ping") Modal State
  const [paymentModalInvoice, setPaymentModalInvoice] = useState(null);
  const [paymentStatusForm, setPaymentStatusForm] = useState({
    paymentStatus: 'Unpaid',
    paidAmount: 0,
    paymentRemarks: '',
  });
  const [savingPaymentStatus, setSavingPaymentStatus] = useState(false);

  const handleOpenPaymentStatusModal = (invoice) => {
    setPaymentModalInvoice(invoice);
    const currentStatus = invoice.paymentStatus || 'Unpaid';
    const totalVal = roundCurrency(toNumber(invoice.piValue) || 0);
    const currentPaid = invoice.paidAmount !== undefined
      ? invoice.paidAmount
      : (currentStatus === 'Paid' ? totalVal : 0);

    setPaymentStatusForm({
      paymentStatus: currentStatus,
      paidAmount: currentPaid,
      paymentRemarks: invoice.paymentRemarks || '',
    });
  };

  const handleSavePaymentStatus = async (e) => {
    if (e) e.preventDefault();
    if (!paymentModalInvoice) return;

    try {
      setSavingPaymentStatus(true);
      const totalVal = roundCurrency(toNumber(paymentModalInvoice.piValue) || 0);
      let calculatedPaid = toNumber(paymentStatusForm.paidAmount);

      if (paymentStatusForm.paymentStatus === 'Paid') {
        calculatedPaid = totalVal;
      } else if (paymentStatusForm.paymentStatus === 'Unpaid') {
        calculatedPaid = 0;
      }

      const res = await api.patch(`/invoices/${paymentModalInvoice._id}/payment-status`, {
        paymentStatus: paymentStatusForm.paymentStatus,
        paidAmount: calculatedPaid,
        paymentRemarks: paymentStatusForm.paymentRemarks,
      });

      const updatedInv = res.data.invoice || res.data;
      setRequests((prev) =>
        prev.map((r) => (r._id === paymentModalInvoice._id ? { ...r, ...updatedInv } : r))
      );

      setPaymentModalInvoice(null);
    } catch (err) {
      console.error('Error updating payment status:', err);
      alert(err.response?.data?.message || 'Failed to update payment status');
    } finally {
      setSavingPaymentStatus(false);
    }
  };

  const handleOpenEdit = (req) => {
    setEditingInvoice(req);
    setEditForm({
      _id: req._id,
      invoiceType: req.invoiceType || 'Single',
      endCustomerName: req.endCustomerName || '',
      rmn: req.rmn || '',
      address: req.address || '',
      poaNo: req.poaNo || '',
      customerState: req.customerState || 'Bihar',
      dealerState: req.dealerState || 'Bihar',
      isSubDealer: req.isSubDealer || false,
      subDealerName: req.subDealerName || '',
      piNo: req.piNo || '',
      invoiceNo: req.invoiceNo || '',
      dateTime: req.dateTime ? new Date(req.dateTime).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      vehicleNo: req.vehicleNo || '',
      vehicleType: req.vehicleType || '',
      vehicleMake: req.vehicleMake || '',
      vehicleModel: req.vehicleModel || '',
      engineNo: req.engineNo || '',
      chassisNo: req.chassisNo || '',
      rtoState: req.rtoState || '',
      rtoNo: req.rtoNo || '',
      notes: req.notes || '',
      discount: req.discount || 0,
      paymentStatus: req.paymentStatus || 'Unpaid',
      paidAmount: req.paidAmount || 0,
      paymentRemarks: req.paymentRemarks || '',
      items: Array.isArray(req.items) && req.items.length > 0
        ? req.items.map(it => {
            let desc = it.description || '';
            let cat = it.category || '';
            let val = it.validity || '';

            if (/monthly.*top-?up/i.test(desc) || /monthly.*recharge/i.test(desc)) {
              desc = 'AIS-140 VLTD - 1 Year Top-up / Recharge Plan';
            }
            if (/monthly.*top-?up/i.test(cat) || /monthly.*recharge/i.test(cat)) {
              cat = 'One Year Top-up Plan';
            }
            if (/monthly.*top-?up/i.test(val) || /monthly.*recharge/i.test(val)) {
              val = '12 Month Top-up';
            }

            return {
              description: desc,
              category: cat,
              validity: val,
              unitPrice: toNumber(it.unitPrice),
              priceWithGst: toNumber(it.priceWithGst) || roundCurrency(toNumber(it.unitPrice) * 1.18),
              qty: parseQty(it.qty) || 1,
              cgst: toNumber(it.cgst),
              sgst: toNumber(it.sgst),
              igst: toNumber(it.igst),
              grossAmt: toNumber(it.grossAmt) || roundCurrency((toNumber(it.unitPrice) * 1.18) * (parseQty(it.qty) || 1)),
              imeis: it.imeis || [],
            };
          })
        : [{
            description: 'VLTD',
            validity: '12 Month',
            unitPrice: 2008.47,
            priceWithGst: 2370,
            qty: 1,
            cgst: 9,
            sgst: 9,
            igst: 0,
            grossAmt: 2370,
            imeis: [],
          }],
    });
  };

  const handleEditItemChange = (index, field, value) => {
    setEditForm(prev => {
      const newItems = [...prev.items];
      const item = { ...newItems[index], [field]: value };
      const targetState = prev.isSubDealer ? prev.dealerState : prev.customerState;
      const isIntra = targetState && targetState.toLowerCase() === 'bihar';

      if (field === 'priceWithGst' || field === 'qty') {
        const priceWithGst = toNumber(field === 'priceWithGst' ? value : item.priceWithGst);
        const qty = parseQty(field === 'qty' ? value : item.qty) || 1;
        const gstRate = 18;
        const taxableVal = (priceWithGst * qty) / (1 + (gstRate / 100));
        item.unitPrice = qty > 0 ? roundCurrency(taxableVal / qty) : 0;
        item.cgst = isIntra ? gstRate / 2 : 0;
        item.sgst = isIntra ? gstRate / 2 : 0;
        item.igst = isIntra ? 0 : gstRate;
        item.grossAmt = roundCurrency(priceWithGst * qty);
      } else if (field === 'unitPrice') {
        const unitPrice = toNumber(value);
        const qty = parseQty(item.qty) || 1;
        const gstRate = 18;
        const taxableVal = unitPrice * qty;
        const grossAmt = roundCurrency(taxableVal * (1 + (gstRate / 100)));
        item.grossAmt = grossAmt;
        item.priceWithGst = qty > 0 ? roundCurrency(grossAmt / qty) : unitPrice;
        item.cgst = isIntra ? gstRate / 2 : 0;
        item.sgst = isIntra ? gstRate / 2 : 0;
        item.igst = isIntra ? 0 : gstRate;
      }

      newItems[index] = item;
      return { ...prev, items: newItems };
    });
  };

  const handleAddEditItem = () => {
    setEditForm(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          description: 'VLTD Plan / Service',
          validity: '1 Year',
          unitPrice: 2008.47,
          priceWithGst: 2370,
          qty: 1,
          cgst: 9,
          sgst: 9,
          igst: 0,
          grossAmt: 2370,
          imeis: [],
        }
      ]
    }));
  };

  const handleRemoveEditItem = (index) => {
    setEditForm(prev => {
      if (prev.items.length <= 1) {
        alert('Bill must contain at least 1 item.');
        return prev;
      }
      return { ...prev, items: prev.items.filter((_, i) => i !== index) };
    });
  };

  const handleSaveEdit = async (e) => {
    if (e) e.preventDefault();
    if (!editForm.endCustomerName.trim()) {
      alert('Please enter Customer / Dealer Name.');
      return;
    }

    setEditSaving(true);
    try {
      const payload = {
        ...editForm,
        dateTime: editForm.dateTime ? new Date(editForm.dateTime) : new Date(),
      };
      await api.put(`/invoices/${editForm._id}`, payload);
      alert('Invoice / Bill updated successfully!');
      setEditingInvoice(null);
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      console.error('Error updating invoice:', err);
      alert(err.response?.data?.message || 'Failed to update invoice.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteInvoice = async (req) => {
    const label = req.piNo || req.invoiceNo || req.requestId;
    if (!window.confirm(`Are you sure you want to delete invoice ${label}? This cannot be undone.`)) {
      return;
    }

    try {
      await api.delete(`/invoices/${req._id}`);
      alert(`Invoice ${label} deleted successfully!`);
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      console.error('Error deleting invoice:', err);
      alert(err.response?.data?.message || 'Failed to delete invoice.');
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

  return (
    <div className="invoice-generator-panel">
      {/* Header bar */}
      <div className="ig-header">
        <span className="ig-title">
          <FaUsers style={{ marginRight: '8px', color: 'var(--accent-color)' }} />
          Dealer Consolidated Bill Generator
        </span>
      </div>

      {/* Dealer Consolidated Bill Generator */}
      <DealerBillGenerator 
        onBillSaved={() => {
          setRefreshTrigger(prev => prev + 1);
        }} 
      />
      {/* Generated Invoices Table */}
      <div className="ig-table-panel" style={{ marginTop: '30px' }}>
        <div className="ig-table-header" style={{ background: 'var(--sidebar-bg)', color: 'white', padding: '12px 20px', fontSize: '13px', fontWeight: '800', borderBottom: '2px solid var(--accent-color)', borderTopLeftRadius: '4px', borderTopRightRadius: '4px' }}>
          Saved Invoices List
        </div>

        <div className="ig-table-filters" style={{ padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white' }}>
          <div className="show-entries" style={{ fontSize: '12px', color: '#676a6c' }}>
            Show 
            <select value={limit} onChange={(e) => { setLimit(parseInt(e.target.value)); setPage(1); }} style={{ margin: '0 8px', padding: '4px', border: '1px solid #ccc', borderRadius: '3px' }}>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
            </select> 
            entries
          </div>

          <div className="search-entries" style={{ fontSize: '12px', color: '#676a6c' }}>
            Search: 
            <input 
              type="text" 
              value={search} 
              onChange={(e) => { setSearch(e.target.value); setPage(1); }} 
              placeholder="Search invoices..."
              style={{ marginLeft: '8px', padding: '5px 10px', border: '1px solid #ccc', borderRadius: '3px' }}
            />
          </div>
        </div>

        <div className="table-responsive" style={{ background: 'white' }}>
          {loading ? (
            <div style={{ padding: '30px', textAlign: 'center', fontSize: '13px', color: '#666' }}>
              <FaSpinner className="spin" style={{ marginRight: '8px' }} /> Loading invoices...
            </div>
          ) : (
            <table className="ig-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #ddd', background: '#f8fafc' }}>
                  <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: '700' }}>SI No.</th>
                  <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: '700' }}>Date</th>
                  <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: '700' }}>PI/Invoice ID</th>
                  <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: '700' }}>Customer / Dealer</th>
                  <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: '700' }}>RMN / Phone</th>
                  <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: '700' }}>GSTIN/POA</th>
                  <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: '700' }}>Total Value</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', fontWeight: '700', minWidth: '130px' }}>Payment Status</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', fontWeight: '700', minWidth: '180px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.length > 0 ? (
                  requests.map((req, index) => (
                    <tr key={req._id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '10px' }}>{((page - 1) * limit) + index + 1}</td>
                      <td style={{ padding: '10px' }}>{new Date(req.dateTime).toLocaleDateString()}</td>
                      <td style={{ padding: '10px', color: 'var(--primary-blue)', fontWeight: 'bold' }}>{req.piNo || req.invoiceNo || 'AE_PI_001'}</td>
                      <td style={{ padding: '10px', fontWeight: '600' }}>
                        {req.endCustomerName || 'Customer'}
                        {req.invoiceType === 'DealerConsolidated' && (
                          <span style={{ marginLeft: '8px', background: '#e0f2fe', color: '#0369a1', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>
                            Dealer Bill
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px' }}>{req.rmn || '--'}</td>
                      <td style={{ padding: '10px' }}>{req.poaNo || '--'}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold' }}>
                        <div>₹{req.piValue ? req.piValue.toFixed(2) : '0.00'}</div>
                        {toNumber(req.discount) > 0 && (
                          <div style={{ fontSize: '10px', color: '#dc2626', fontWeight: 600 }}>
                            Disc: -₹{toNumber(req.discount).toFixed(0)}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                          <button
                            type="button"
                            onClick={() => handleOpenPaymentStatusModal(req)}
                            className={`btn-payment-pill ${req.paymentStatus === 'Paid' ? 'paid' : req.paymentStatus === 'Partially Paid' ? 'partial' : 'unpaid'}`}
                            title="Click to Ping / Update Payment Status"
                          >
                            <span className="payment-status-dot"></span>
                            {req.paymentStatus === 'Paid' ? 'PAID' : req.paymentStatus === 'Partially Paid' ? 'PARTIAL' : 'UNPAID'}
                          </button>
                          {req.paymentStatus === 'Partially Paid' ? (
                            <span style={{ fontSize: '10.5px', color: '#b45309', fontWeight: 600 }}>
                              Paid: ₹{toNumber(req.paidAmount).toFixed(0)} | Due: ₹{toNumber(req.dueAmount !== undefined ? req.dueAmount : (req.piValue - (req.paidAmount || 0))).toFixed(0)}
                            </span>
                          ) : req.paymentStatus === 'Paid' ? (
                            <span style={{ fontSize: '10px', color: '#15803d', fontWeight: 600 }}>Full Paid</span>
                          ) : (
                            <span style={{ fontSize: '10px', color: '#b91c1c' }}>Due: ₹{toNumber(req.piValue).toFixed(0)}</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                          <button 
                            className="btn-ig-action btn-edit"
                            onClick={() => handleOpenEdit(req)}
                            title="Edit Invoice / Bill"
                          >
                            <FaEdit /> Edit
                          </button>
                          <button 
                            className="btn-ig-action btn-print"
                            onClick={() => handleDownloadInvoice(req)}
                            title="Print / PDF"
                          >
                            <FaPrint /> Print / PDF
                          </button>
                          <button 
                            className="btn-ig-action btn-delete"
                            onClick={() => handleDeleteInvoice(req)}
                            title="Delete Invoice"
                          >
                            <FaTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '20px', color: '#999', fontStyle: 'italic' }}>
                      No invoices available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {totalCount > 0 && (
          <div className="requests-footer" style={{ padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', borderBottomLeftRadius: '4px', borderBottomRightRadius: '4px', borderTop: '1px solid #eee' }}>
            <div className="records-info" style={{ fontSize: '11.5px', color: '#666' }}>
              Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, totalCount)} of {totalCount} records
            </div>

            <div className="pagination" style={{ display: 'flex', gap: '5px' }}>
              <div 
                className={`pagination-item ${page === 1 ? 'disabled' : ''}`}
                onClick={() => page > 1 && setPage(page - 1)}
                style={{ padding: '5px 10px', border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', background: page === 1 ? '#f5f5f5' : 'white', opacity: page === 1 ? 0.6 : 1 }}
              >
                Previous
              </div>

              {getPageNumbers().map((p, idx) => (
                p === '...' ? (
                  <span key={`ell-${idx}`} style={{ padding: '5px 10px', color: '#888' }}>...</span>
                ) : (
                  <div 
                    key={p}
                    className={`pagination-item ${page === p ? 'active' : ''}`}
                    onClick={() => setPage(p)}
                    style={{
                      padding: '5px 10px',
                      border: '1px solid #ccc',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      background: page === p ? 'var(--primary-blue)' : 'white',
                      color: page === p ? 'white' : 'black',
                      fontWeight: page === p ? 'bold' : 'normal'
                    }}
                  >
                    {p}
                  </div>
                )
              ))}

              <div 
                className={`pagination-item ${page === totalPages ? 'disabled' : ''}`}
                onClick={() => page < totalPages && setPage(page + 1)}
                style={{ padding: '5px 10px', border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', background: page === totalPages ? '#f5f5f5' : 'white', opacity: page === totalPages ? 0.6 : 1 }}
              >
                Next
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit Invoice / Bill Modal */}
      {editingInvoice && (
        <div className="ig-modal-overlay">
          <div className="ig-modal-card">
            <div className="ig-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FaEdit style={{ color: 'var(--accent-color)', fontSize: '18px' }} />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
                  Edit {editForm.invoiceType === 'DealerConsolidated' ? 'Dealer Consolidated Bill' : 'Proforma Invoice'}
                </h3>
                <span className="ig-modal-badge">
                  {editForm.piNo || editForm.invoiceNo || 'DRAFT'}
                </span>
              </div>
              <button 
                type="button"
                className="ig-modal-close" 
                onClick={() => setEditingInvoice(null)}
              >
                <FaTimes />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="ig-modal-body">
              {/* Section 1: Customer & Bill Details */}
              <div className="ig-modal-section">
                <div className="ig-modal-section-title">
                  <span>Customer & Bill Information</span>
                </div>
                <div className="ig-modal-grid">
                  <div className="form-field">
                    <label>Customer / Dealer Name *</label>
                    <input 
                      type="text" 
                      value={editForm.endCustomerName} 
                      onChange={(e) => setEditForm(prev => ({ ...prev, endCustomerName: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label>Mobile No (RMN)</label>
                    <input 
                      type="text" 
                      value={editForm.rmn} 
                      onChange={(e) => setEditForm(prev => ({ ...prev, rmn: e.target.value }))}
                    />
                  </div>
                  <div className="form-field">
                    <label>GSTIN / POA No</label>
                    <input 
                      type="text" 
                      value={editForm.poaNo} 
                      onChange={(e) => setEditForm(prev => ({ ...prev, poaNo: e.target.value }))}
                    />
                  </div>
                  <div className="form-field">
                    <label>State</label>
                    <select 
                      value={editForm.customerState} 
                      onChange={(e) => setEditForm(prev => ({ ...prev, customerState: e.target.value, dealerState: e.target.value }))}
                    >
                      {INDIAN_STATES.map(st => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>PI No / Reference</label>
                    <input 
                      type="text" 
                      value={editForm.piNo} 
                      onChange={(e) => setEditForm(prev => ({ ...prev, piNo: e.target.value }))}
                    />
                  </div>
                  <div className="form-field">
                    <label>Tax Invoice No</label>
                    <input 
                      type="text" 
                      value={editForm.invoiceNo} 
                      onChange={(e) => setEditForm(prev => ({ ...prev, invoiceNo: e.target.value }))}
                    />
                  </div>
                  <div className="form-field">
                    <label>Invoice Date</label>
                    <input 
                      type="date" 
                      value={editForm.dateTime} 
                      onChange={(e) => setEditForm(prev => ({ ...prev, dateTime: e.target.value }))}
                    />
                  </div>
                  <div className="form-field" style={{ gridColumn: 'span 2' }}>
                    <label>Address</label>
                    <input 
                      type="text" 
                      value={editForm.address} 
                      onChange={(e) => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Vehicle Information (for single bills) */}
              {editForm.invoiceType !== 'DealerConsolidated' && (
                <div className="ig-modal-section">
                  <div className="ig-modal-section-title">
                    <span>Vehicle Details</span>
                  </div>
                  <div className="ig-modal-grid">
                    <div className="form-field">
                      <label>Vehicle No</label>
                      <input 
                        type="text" 
                        value={editForm.vehicleNo} 
                        onChange={(e) => setEditForm(prev => ({ ...prev, vehicleNo: e.target.value.toUpperCase() }))}
                        placeholder="e.g. BR01AB1234"
                      />
                    </div>
                    <div className="form-field">
                      <label>Vehicle Type</label>
                      <input 
                        type="text" 
                        value={editForm.vehicleType} 
                        onChange={(e) => setEditForm(prev => ({ ...prev, vehicleType: e.target.value }))}
                      />
                    </div>
                    <div className="form-field">
                      <label>Make</label>
                      <input 
                        type="text" 
                        value={editForm.vehicleMake} 
                        onChange={(e) => setEditForm(prev => ({ ...prev, vehicleMake: e.target.value }))}
                      />
                    </div>
                    <div className="form-field">
                      <label>Model</label>
                      <input 
                        type="text" 
                        value={editForm.vehicleModel} 
                        onChange={(e) => setEditForm(prev => ({ ...prev, vehicleModel: e.target.value }))}
                      />
                    </div>
                    <div className="form-field">
                      <label>Engine No</label>
                      <input 
                        type="text" 
                        value={editForm.engineNo} 
                        onChange={(e) => setEditForm(prev => ({ ...prev, engineNo: e.target.value }))}
                      />
                    </div>
                    <div className="form-field">
                      <label>Chassis No</label>
                      <input 
                        type="text" 
                        value={editForm.chassisNo} 
                        onChange={(e) => setEditForm(prev => ({ ...prev, chassisNo: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Section 3: Line Items & Pricing */}
              <div className="ig-modal-section">
                <div className="ig-modal-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Line Items & Pricing</span>
                  <button 
                    type="button" 
                    className="btn-add-edit-item"
                    onClick={handleAddEditItem}
                  >
                    <FaPlus /> Add Line Item
                  </button>
                </div>

                <div className="edit-items-table-wrapper">
                  <table className="edit-items-table">
                    <thead>
                      <tr>
                        <th style={{ width: '35%' }}>Description / Plan</th>
                        <th style={{ width: '15%' }}>Validity</th>
                        <th style={{ width: '10%' }}>Qty</th>
                        <th style={{ width: '18%' }}>Price with GST (₹)</th>
                        <th style={{ width: '15%' }}>Gross (₹)</th>
                        <th style={{ width: '7%', textAlign: 'center' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {editForm.items.map((item, idx) => (
                        <tr key={idx}>
                          <td>
                            <input 
                              type="text" 
                              value={item.description} 
                              onChange={(e) => handleEditItemChange(idx, 'description', e.target.value)}
                              placeholder="Item Description"
                              className="edit-row-input"
                            />
                          </td>
                          <td>
                            <input 
                              type="text" 
                              value={item.validity} 
                              onChange={(e) => handleEditItemChange(idx, 'validity', e.target.value)}
                              placeholder="e.g. 1 Year"
                              className="edit-row-input"
                            />
                          </td>
                          <td>
                            <input 
                              type="number" 
                              min="1"
                              value={item.qty} 
                              onChange={(e) => handleEditItemChange(idx, 'qty', e.target.value)}
                              className="edit-row-input"
                            />
                          </td>
                          <td>
                            <input 
                              type="number" 
                              step="0.01"
                              value={item.priceWithGst} 
                              onChange={(e) => handleEditItemChange(idx, 'priceWithGst', e.target.value)}
                              className="edit-row-input"
                            />
                          </td>
                          <td style={{ fontWeight: '700', color: '#0f172a' }}>
                            ₹{roundCurrency(item.grossAmt).toFixed(2)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button 
                              type="button" 
                              className="btn-remove-edit-row"
                              onClick={() => handleRemoveEditItem(idx)}
                              title="Remove row"
                            >
                              <FaTrash />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="edit-total-summary">
                  <div className="edit-total-box">
                    <span>Gross Total Amount:</span>
                    <strong>
                      ₹{roundCurrency(editForm.items.reduce((sum, it) => sum + (toNumber(it.grossAmt) || 0), 0)).toFixed(2)}
                    </strong>
                  </div>
                </div>

                {/* Discount & Payment Status */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '12px' }}>
                  <div className="form-field">
                    <label>Discount (₹)</label>
                    <input 
                      type="number"
                      min="0"
                      value={editForm.discount}
                      onChange={(e) => setEditForm(prev => ({ ...prev, discount: Math.max(0, toNumber(e.target.value) || 0) }))}
                      placeholder="0"
                    />
                  </div>
                  <div className="form-field">
                    <label>Payment Status</label>
                    <select
                      value={editForm.paymentStatus}
                      onChange={(e) => {
                        const newStatus = e.target.value;
                        const gross = roundCurrency(editForm.items.reduce((sum, it) => sum + (toNumber(it.grossAmt) || 0), 0));
                        const net = Math.max(0, roundCurrency(gross - (editForm.discount || 0)));
                        setEditForm(prev => ({
                          ...prev,
                          paymentStatus: newStatus,
                          paidAmount: newStatus === 'Paid' ? net : newStatus === 'Unpaid' ? 0 : prev.paidAmount,
                        }));
                      }}
                    >
                      <option value="Unpaid">Unpaid</option>
                      <option value="Partially Paid">Partially Paid</option>
                      <option value="Paid">Paid</option>
                    </select>
                  </div>
                </div>

                {editForm.paymentStatus === 'Partially Paid' && (
                  <div className="form-field" style={{ marginTop: '10px' }}>
                    <label>Paid Amount (₹)*</label>
                    <input 
                      type="number"
                      min="0"
                      step="0.01"
                      value={editForm.paidAmount}
                      onChange={(e) => setEditForm(prev => ({ ...prev, paidAmount: Math.max(0, toNumber(e.target.value) || 0) }))}
                      placeholder="Kitna pay kiya hua hai"
                    />
                  </div>
                )}

                <div className="edit-total-summary" style={{ marginTop: '12px' }}>
                  <div className="edit-total-box" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#15803d' }}>
                    <span>Net Payable / Total:</span>
                    <strong style={{ color: '#16a34a' }}>
                      ₹{Math.max(0, roundCurrency(editForm.items.reduce((sum, it) => sum + (toNumber(it.grossAmt) || 0), 0) - (editForm.discount || 0))).toFixed(2)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="form-field" style={{ marginTop: '10px' }}>
                <label>Notes / Remarks</label>
                <textarea 
                  rows="2"
                  value={editForm.notes} 
                  onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Special terms, remarks, payment instructions, etc."
                />
              </div>

              {/* Footer Actions */}
              <div className="ig-modal-footer">
                <button 
                  type="button" 
                  className="btn-modal-secondary"
                  onClick={() => setEditingInvoice(null)}
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  className="btn-modal-print"
                  onClick={() => {
                    const currentInvoiceData = {
                      ...editingInvoice,
                      ...editForm,
                      items: editForm.items,
                      piValue: roundCurrency(editForm.items.reduce((sum, it) => sum + (toNumber(it.grossAmt) || 0), 0)),
                    };
                    handleDownloadInvoice(currentInvoiceData);
                  }}
                >
                  <FaPrint /> Print Preview
                </button>
                <button 
                  type="submit" 
                  className="btn-modal-save"
                  disabled={editSaving}
                >
                  {editSaving ? <FaSpinner className="spin" /> : <FaCheck />} 
                  {editSaving ? ' Saving Changes...' : ' Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {credentialsToShow && (
        <div className="credentials-modal-overlay">
          <div className="credentials-modal">
            <div className="credentials-modal-header">
              <h3>Customer Login Created</h3>
              <button 
                className="credentials-modal-close" 
                onClick={() => setCredentialsToShow(null)}
              >
                &times;
              </button>
            </div>
            <div className="credentials-modal-body">
              <p>A login ID has been successfully generated for the customer:</p>
              <div className="credentials-info-box">
                <div className="credentials-row">
                  <span className="credentials-label">Login ID (RMN):</span>
                  <span className="credentials-value">{credentialsToShow.username}</span>
                </div>
                <div className="credentials-row">
                  <span className="credentials-label">Password:</span>
                  <span className="credentials-value">{credentialsToShow.password}</span>
                </div>
              </div>
              <p style={{ fontSize: '11px', color: '#64748b', marginTop: '10px' }}>
                Note: The customer can use these credentials to log in, access their dashboard, and download their bills.
              </p>
              <div className="credentials-btn-row">
                <button 
                  className="credentials-btn copy"
                  onClick={() => {
                    navigator.clipboard.writeText(`Customer Login Details:\nLogin ID: ${credentialsToShow.username}\nPassword: ${credentialsToShow.password}`);
                    alert('Copied to clipboard!');
                  }}
                >
                  Copy Details
                </button>
                <button 
                  className="credentials-btn close"
                  onClick={() => setCredentialsToShow(null)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Payment Status ("Ping") Modal */}
      {paymentModalInvoice && (
        <div className="payment-modal-overlay">
          <div className="payment-modal-card">
            <div className="payment-modal-header">
              <h3>
                <FaMoneyBillWave style={{ color: '#f59e0b' }} />
                Update Payment Status
              </h3>
              <button 
                type="button"
                className="payment-modal-close" 
                onClick={() => setPaymentModalInvoice(null)}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleSavePaymentStatus}>
              <div className="payment-modal-body">
                <div className="payment-bill-info-box">
                  <div><strong>Bill / PI No:</strong> {paymentModalInvoice.piNo || paymentModalInvoice.invoiceNo || 'N/A'}</div>
                  <div><strong>Customer / Dealer:</strong> {paymentModalInvoice.endCustomerName || 'N/A'}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', borderTop: '1px dashed #cbd5e1', paddingTop: '4px' }}>
                    <span>Total Bill Value:</span>
                    <strong style={{ color: '#0f766e', fontSize: '13px' }}>
                      ₹{toNumber(paymentModalInvoice.piValue).toFixed(2)}
                    </strong>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px', textTransform: 'uppercase' }}>
                    Select Status:
                  </label>
                  <div className="payment-status-options">
                    <button
                      type="button"
                      className={`payment-status-btn ${paymentStatusForm.paymentStatus === 'Unpaid' ? 'selected-unpaid' : ''}`}
                      onClick={() => setPaymentStatusForm(prev => ({ ...prev, paymentStatus: 'Unpaid', paidAmount: 0 }))}
                    >
                      🔴 Unpaid
                    </button>
                    <button
                      type="button"
                      className={`payment-status-btn ${paymentStatusForm.paymentStatus === 'Partially Paid' ? 'selected-partial' : ''}`}
                      onClick={() => setPaymentStatusForm(prev => ({ 
                        ...prev, 
                        paymentStatus: 'Partially Paid', 
                        paidAmount: prev.paidAmount > 0 && prev.paidAmount < toNumber(paymentModalInvoice.piValue) 
                          ? prev.paidAmount 
                          : Math.round(toNumber(paymentModalInvoice.piValue) / 2) 
                      }))}
                    >
                      🟡 Partially Paid
                    </button>
                    <button
                      type="button"
                      className={`payment-status-btn ${paymentStatusForm.paymentStatus === 'Paid' ? 'selected-paid' : ''}`}
                      onClick={() => setPaymentStatusForm(prev => ({ ...prev, paymentStatus: 'Paid', paidAmount: toNumber(paymentModalInvoice.piValue) }))}
                    >
                      🟢 Paid (Full)
                    </button>
                  </div>
                </div>

                {paymentStatusForm.paymentStatus === 'Partially Paid' && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '12px' }}>
                    <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#92400e', display: 'block', marginBottom: '6px' }}>
                      Itna Pay Kiya Hua Hai (Paid Amount ₹)*
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={paymentModalInvoice.piValue}
                      step="0.01"
                      required
                      value={paymentStatusForm.paidAmount}
                      onChange={(e) => setPaymentStatusForm(prev => ({ ...prev, paidAmount: e.target.value }))}
                      placeholder="Kitna pay kiya hua hai"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1.5px solid #f59e0b',
                        borderRadius: '4px',
                        fontSize: '14px',
                        fontWeight: 700,
                        color: '#0f172a',
                        background: '#ffffff',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '11.5px' }}>
                      <span style={{ color: '#16a34a', fontWeight: 600 }}>
                        Paid Amount: ₹{toNumber(paymentStatusForm.paidAmount).toFixed(2)}
                      </span>
                      <span style={{ color: '#dc2626', fontWeight: 700 }}>
                        Remaining Due: ₹{Math.max(0, toNumber(paymentModalInvoice.piValue) - toNumber(paymentStatusForm.paidAmount)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Payment Remarks / Notes (Optional):
                  </label>
                  <input
                    type="text"
                    value={paymentStatusForm.paymentRemarks}
                    onChange={(e) => setPaymentStatusForm(prev => ({ ...prev, paymentRemarks: e.target.value }))}
                    placeholder="e.g. Paid via PhonePe / Cash / UTR: 123456"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      fontSize: '12px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <div className="payment-modal-footer">
                <button
                  type="button"
                  className="btn-modal-secondary"
                  onClick={() => setPaymentModalInvoice(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-modal-save"
                  disabled={savingPaymentStatus}
                >
                  {savingPaymentStatus ? <FaSpinner className="spin" /> : <FaCheck />}
                  {savingPaymentStatus ? ' Saving...' : ' Save Payment Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceGenerator;
