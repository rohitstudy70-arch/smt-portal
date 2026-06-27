import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { FaSpinner, FaFileInvoiceDollar } from 'react-icons/fa';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { INVOICE_LOGO } from '../../utils/invoiceLogo';
import { renderProformaInvoiceHtml } from '../../utils/proformaInvoiceTemplate';
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
    priceWithGst: 4300,
    qty: 1
  },
  {
    description: 'GPS',
    validity: '12 Month',
    priceWithGst: 1500,
    qty: 1
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
          <FaFileInvoiceDollar style={{ marginRight: '8px', color: 'var(--accent-color)' }} />
          PI No Generator
        </span>
      </div>

      {/* Main Form */}
      <div className="ig-form-container">
        <form onSubmit={handleSingleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Section 1: Customer & Billing Info */}
          <div className="form-section-title">1. Customer & Billing Info</div>
          <div className="ig-grid-inputs">
            
            <div className="form-field" style={{ gridColumn: '1 / -1', flexDirection: 'row', alignItems: 'center', gap: '8px', background: '#f0fdfa', padding: '12px 15px', borderRadius: '6px', border: '1px solid #ccfbf1' }}>
              <input 
                type="checkbox" 
                id="isDealerCheck"
                checked={isSubDealer}
                onChange={(e) => setIsSubDealer(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="isDealerCheck" style={{ margin: 0, cursor: 'pointer', fontWeight: 'bold', color: '#0f766e' }}>
                Generate Bill for a Dealer / Sub-Dealer
              </label>
            </div>

            {isSubDealer && (
              <>
                <div className="form-field">
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Dealer / Sub-Dealer Name*</span>
                    <button 
                      type="button" 
                      onClick={() => {
                        setIsCustomDealer(!isCustomDealer);
                        setSubDealerName('');
                      }}
                      style={{ background: 'none', border: 'none', color: 'var(--primary-blue)', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                    >
                      {isCustomDealer ? 'Choose from list' : 'Type custom name'}
                    </button>
                  </label>
                  {isCustomDealer ? (
                    <input 
                      type="text" 
                      value={subDealerName}
                      onChange={(e) => setSubDealerName(e.target.value)}
                      placeholder="Enter Dealer Name"
                      required={isSubDealer}
                    />
                  ) : (
                    <select
                      value={subDealerName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSubDealerName(val);
                        const dealerInfo = dealersList.find(d => (d.companyName || d.displayName) === val);
                        if (dealerInfo) {
                          setDealerState(dealerInfo.state || 'Bihar');
                          setAddress(dealerInfo.address || '');
                          setRmn(dealerInfo.mobileNo || '');
                          setPoaNo(dealerInfo.gstNo || '');
                        }
                      }}
                      required={isSubDealer}
                    >
                      <option value="">Select Dealer</option>
                      {dealersList.map(d => {
                        const name = d.companyName || d.displayName;
                        return (
                          <option key={d._id} value={name}>
                            {name} ({d.userType})
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>
                <div className="form-field">
                  <label>Dealer State*</label>
                  <select
                    value={dealerState}
                    onChange={(e) => setDealerState(e.target.value)}
                    required={isSubDealer}
                  >
                    <option value="">Select State</option>
                    {INDIAN_STATES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className="form-field">
              <label>Customer Name*</label>
              <input 
                type="text" 
                value={endCustomerName}
                onChange={(e) => setEndCustomerName(e.target.value)}
                placeholder="Enter Customer Name"
                required
              />
            </div>

            <div className="form-field">
              <label>Customer State*</label>
              <select
                value={customerState}
                onChange={(e) => setCustomerState(e.target.value)}
                required
              >
                <option value="">Select State</option>
                {INDIAN_STATES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Registered Mobile (RMN)*</label>
              <input 
                type="tel" 
                value={rmn}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setRmn(val);
                }}
                placeholder="10-digit Mobile No."
                maxLength={10}
                pattern="[6-9][0-9]{9}"
                title="Enter a valid 10-digit Indian mobile number"
                required
              />
            </div>

            <div className="form-field" style={{ gridColumn: 'span 2' }}>
              <label>Address*</label>
              <input 
                type="text" 
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Enter Billing Address"
                required
              />
            </div>

            <div className="form-field">
              <label>GSTIN / POA Number <span style={{ fontWeight: 'normal', color: '#94a3b8', fontSize: '11px' }}>(Optional)</span></label>
              <input 
                type="text" 
                value={poaNo}
                onChange={(e) => setPoaNo(e.target.value)}
                placeholder="Enter GSTIN or Aadhaar No. (optional)"
              />
            </div>

            <div className="form-field">
              <label>Address Proof Type</label>
              <select 
                value={proofOfAddress}
                onChange={(e) => setProofOfAddress(e.target.value)}
              >
                <option value="GST Certificate">GST Certificate</option>
                <option value="Aadhaar Card">Aadhaar Card</option>
                <option value="Voter ID">Voter ID</option>
                <option value="Driving License">Driving License</option>
              </select>
            </div>

            <div className="form-field">
              <label>PI No</label>
              <input 
                type="text" 
                value={piNo}
                readOnly
                placeholder="Generating..."
                style={{ backgroundColor: '#f1f5f9', cursor: 'not-allowed' }}
              />
            </div>

          </div>

          {/* Section 2: Items Builder */}
          <div className="form-section-title">2. Product Rows & Charges</div>
          <div className="items-builder-container" style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '15px', background: '#fafafa' }}>
            <table className="items-builder-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #ddd', background: '#f1f5f9' }}>
                  <th style={{ width: '5%', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>Sr. No</th>
                  <th style={{ width: '35%', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Item Description*</th>
                  <th style={{ width: '10%', padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>Qty*</th>
                  <th style={{ width: '15%', padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>Price Including Tax*</th>
                  <th style={{ width: '15%', padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>Rate Per Unit</th>
                  <th style={{ width: '10%', padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>GST 18%</th>
                  <th style={{ width: '10%', padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>Total</th>
                  <th style={{ width: '5%', padding: '8px', textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const detailed = calculateItemDetails(item);
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        {idx + 1}
                      </td>
                      <td style={{ padding: '6px' }}>
                        <textarea 
                          value={item.description}
                          onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                          placeholder="Enter Description"
                          rows="2"
                          required
                          style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontSize: '12px', padding: '5px', border: '1px solid #ccc', borderRadius: '3px' }}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <input 
                          type="number" 
                          value={item.qty}
                          onChange={(e) => handleItemChange(idx, 'qty', parseInt(e.target.value) || 1)}
                          placeholder="1"
                          required
                          style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px', padding: '5px', border: '1px solid #ccc', borderRadius: '3px', textAlign: 'right' }}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <input 
                          type="number" 
                          value={item.priceWithGst}
                          onChange={(e) => handleItemChange(idx, 'priceWithGst', parseFloat(e.target.value) || 0)}
                          placeholder="4300"
                          required
                          style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px', padding: '5px', border: '1px solid #ccc', borderRadius: '3px', textAlign: 'right' }}
                        />
                      </td>
                      <td style={{ padding: '6px', textAlign: 'right', fontSize: '12px' }}>
                        {detailed.unitPrice.toFixed(2)}
                      </td>
                      <td style={{ padding: '6px', textAlign: 'right', fontSize: '12px' }}>
                        {detailed.gstAmount.toFixed(2)}
                      </td>
                      <td style={{ padding: '6px', textAlign: 'right', fontSize: '12px', fontWeight: 'bold' }}>
                        {detailed.taxableValue.toFixed(2)}
                      </td>
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        <button 
                          type="button" 
                          className="btn-remove-item"
                          onClick={() => handleRemoveItem(idx)}
                          title="Delete Item"
                          style={{
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            width: '24px',
                            height: '24px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 'bold',
                            fontSize: '14px'
                          }}
                        >
                          &times;
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button 
              type="button" 
              className="btn-add-item" 
              onClick={handleAddItem}
              style={{
                marginTop: '10px',
                background: 'var(--primary-blue)',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                padding: '6px 12px',
                fontSize: '11.5px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              + Add Item Row
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#f8fafc', padding: '15px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontWeight: '800', color: 'var(--primary-blue)', fontSize: '13px' }}>
              Sub-Total (Sum of Row Totals): ₹{items.reduce((sum, item) => sum + calculateItemDetails(item).taxableValue, 0).toFixed(2)}
            </span>
            <span style={{ fontWeight: '800', color: 'var(--accent-color)', fontSize: '14px' }}>
              Grand Total (Including Tax): ₹{totalInvoiceValue.toFixed(2)}
            </span>
          </div>

          {/* Section 3: Vehicle & Device Info (Optional/Subdealer) */}
          <div className="form-section-title">3. Vehicle & KYC details (Optional)</div>
          <div className="ig-grid-inputs">
            <div className="form-field">
              <label>Vehicle Number</label>
              <input 
                type="text" 
                value={vehicleNo}
                onChange={(e) => setVehicleNo(e.target.value)}
                placeholder="e.g. RJ14-GA-1234"
              />
            </div>

            <div className="form-field">
              <label>Engine Number</label>
              <input 
                type="text" 
                value={engineNo}
                onChange={(e) => setEngineNo(e.target.value)}
                placeholder="Enter Engine No."
              />
            </div>

            <div className="form-field">
              <label>Chassis Number</label>
              <input 
                type="text" 
                value={chassisNo}
                onChange={(e) => setChassisNo(e.target.value)}
                placeholder="Enter Chassis No."
              />
            </div>

            <div className="form-field">
              <label>Search IMEI/ICCID</label>
              <input 
                type="text" 
                value={searchImei}
                onChange={(e) => setSearchImei(e.target.value)}
                placeholder="Enter Device IMEI"
              />
            </div>

            <div className="form-field">
              <label>Vehicle Condition</label>
              <select 
                value={vehicleTypeOldNew}
                onChange={(e) => setVehicleTypeOldNew(e.target.value)}
              >
                <option value="New">New</option>
                <option value="Old">Old</option>
              </select>
            </div>

            <div className="form-field">
              <label>Vehicle Make</label>
              <input 
                type="text" 
                value={vehicleMake}
                onChange={(e) => setVehicleMake(e.target.value)}
                placeholder="e.g. Tata Motors"
              />
            </div>

            <div className="form-field">
              <label>Vehicle Model</label>
              <input 
                type="text" 
                value={vehicleModel}
                onChange={(e) => setVehicleModel(e.target.value)}
                placeholder="e.g. LPT 1613"
              />
            </div>

            <div className="form-field">
              <label>RTO State</label>
              <input 
                type="text" 
                value={rtoState}
                onChange={(e) => setRtoState(e.target.value)}
                placeholder="e.g. Rajasthan"
              />
            </div>
          </div>

          <button 
            type="submit" 
            className="btn-ig-submit"
            disabled={singleSubmitting}
            style={{
              background: 'var(--accent-color)',
              color: 'var(--sidebar-bg)',
              border: 'none',
              padding: '12px 25px',
              fontSize: '13px',
              fontWeight: '800',
              borderRadius: '4px',
              cursor: 'pointer',
              alignSelf: 'flex-start',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              boxShadow: '0 4px 6px rgba(245, 158, 11, 0.25)'
            }}
          >
            {singleSubmitting ? 'Generating...' : 'Save & Generate Invoice'}
          </button>
        </form>
      </div>

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
                  <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: '700' }}>Customer Name</th>
                  <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: '700' }}>RMN</th>
                  <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: '700' }}>GSTIN/POA</th>
                  <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: '700' }}>Total Value</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', fontWeight: '700' }}>Download</th>
                </tr>
              </thead>
              <tbody>
                {requests.length > 0 ? (
                  requests.map((req, index) => (
                    <tr key={req._id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '10px' }}>{((page - 1) * limit) + index + 1}</td>
                      <td style={{ padding: '10px' }}>{new Date(req.dateTime).toLocaleDateString()}</td>
                      <td style={{ padding: '10px', color: 'var(--primary-blue)', fontWeight: 'bold' }}>{req.piNo || 'AE_PI_001'}</td>
                      <td style={{ padding: '10px', fontWeight: '600' }}>{req.endCustomerName || 'JYOTI CONSTRUCTION'}</td>
                      <td style={{ padding: '10px' }}>{req.rmn || '--'}</td>
                      <td style={{ padding: '10px' }}>{req.poaNo || '--'}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold' }}>₹{req.piValue ? req.piValue.toFixed(2) : '0.00'}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <button 
                          className="btn-download-pdf"
                          onClick={() => handleDownloadInvoice(req)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#337ab7',
                            textDecoration: 'underline',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          Print / PDF
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '20px', color: '#999', fontStyle: 'italic' }}>
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
    </div>
  );
};

export default InvoiceGenerator;
