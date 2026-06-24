import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaDownload, FaSpinner, FaFileInvoiceDollar, FaPlus, FaTrash, FaEye } from 'react-icons/fa';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { INVOICE_LOGO } from '../../utils/invoiceLogo';
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
    description: 'iTriangle (Bharat101 Plus) Ais140 2G\nVLTD Device with including Dual profile E-sim & Software + 01 Panic Switch',
    validity: '12 Month',
    unitPrice: 4300,
    gstRate: 18,
    qty: 1
  },
  {
    description: 'iTriangle (Bharat101 Plus) Ais140 _2G',
    validity: '24 Month',
    unitPrice: 5600,
    gstRate: 18,
    qty: 1
  },
  {
    description: 'Installation',
    validity: 'One Time',
    unitPrice: 400,
    gstRate: 18,
    qty: 1
  }
];

const createDefaultInvoiceItems = () => DEFAULT_INVOICE_ITEMS.map(item => ({ ...item }));

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

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatInvoiceDescription = (value) => escapeHtml(value).replace(/\n/g, '<br/>');

const InvoiceGenerator = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
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

  // Dynamic invoice items state (preloaded with default rows shown in the screenshot)
  const [items, setItems] = useState(createDefaultInvoiceItems);

  const activeState = isSubDealer ? dealerState : customerState;
  const isIntraState = activeState && activeState.toLowerCase() === 'bihar';

  // Helper to calculate details for one item
  const calculateItemDetails = (item) => {
    const unitPrice = toNumber(item.unitPrice);
    const gstRate = getItemGstRate(item);
    const qty = parseQty(item.qty);
    const taxableValue = roundCurrency(unitPrice * qty);

    let cgstRate = 0, sgstRate = 0, igstRate = 0;
    
    if (isIntraState) {
      cgstRate = gstRate / 2;
      sgstRate = gstRate / 2;
    } else {
      igstRate = gstRate;
    }

    const cgstAmt = roundCurrency((taxableValue * cgstRate) / 100);
    const sgstAmt = roundCurrency((taxableValue * sgstRate) / 100);
    const igstAmt = roundCurrency((taxableValue * igstRate) / 100);
    
    const grossAmt = roundCurrency(taxableValue + cgstAmt + sgstAmt + igstAmt);
    const priceWithGst = qty > 0 ? roundCurrency(grossAmt / qty) : roundCurrency(unitPrice + cgstAmt + sgstAmt + igstAmt);

    return {
      ...item,
      gstRate,
      cgstRate,
      sgstRate,
      igstRate,
      cgstAmt,
      sgstAmt,
      igstAmt,
      taxableValue,
      priceWithGst,
      grossAmt
    };
  };

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        description: '',
        validity: '12 Month',
        unitPrice: 0,
        gstRate: 18,
        qty: 1
      }
    ]);
  };

  const handleRemoveItem = (index) => {
    if (items.length === 1) {
      alert('At least one item is required in the invoice.');
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

    const detailedItems = items.map(item => {
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
        piNo: piNo || 'AE-01',
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

      setRefreshTrigger(prev => prev + 1);
      setSingleSubmitting(false);
      alert('Invoice Generated & Saved Successfully!');
      fetchNextPiNo();
    } catch (err) {
      console.error('Error submitting invoice:', err);
      setSingleSubmitting(false);
      alert(err.response?.data?.message || 'Failed to generate invoice.');
    }
  };

  const numberToWords = (price) => {
    const s = Math.round(price);
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    const convert = (num) => {
      if (num < 20) return a[num];
      if (num < 100) return b[Math.floor(num / 10)] + (num % 10 ? ' ' + a[num % 10] : '');
      if (num < 1000) return a[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' and ' + convert(num % 100) : '');
      if (num < 100000) return convert(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + convert(num % 1000) : '');
      if (num < 10000000) return convert(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + convert(num % 100000) : '');
      return convert(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + convert(num % 10000000) : '');
    };
    
    if (s === 0) return 'Zero Rupees Only';
    return convert(s) + ' Rupees Only';
  };

  const handleDownloadInvoice = (req) => {
    const customerName = (req.isSubDealer && req.subDealerName ? req.subDealerName : req.endCustomerName) || 'JYOTI CONSTRUCTION AND ENGINEERING Pvt. Ltd';
    const customerAddress = req.address || 'PAPRAUR, Begusarai, Bihar, 851210';
    const customerMob = req.rmn || '9031622921';
    const customerGstin = req.poaNo || '10AAECJ5132H1Z3';
    
    const piDate = new Date(req.dateTime).toLocaleDateString('en-GB').replace(/\//g, '.');
    const piInvoiceNo = req.piNo || 'AE-01';

    const formatCurrencyIG = (val) => {
      return new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(val);
    };

    let itemsHtml = '';
    let subtotal = 0;
    let sgstTotal = 0;
    let cgstTotal = 0;
    let igstTotal = 0;
    let totalAmt = 0;

    const targetState = req.isSubDealer ? (req.dealerState || 'Bihar') : (req.customerState || 'Bihar');
    const isIntraState = targetState && targetState.toLowerCase() === 'bihar';

    if (req.items && req.items.length > 0) {
      itemsHtml = req.items.map((item, index) => {
        const unitPrice = toNumber(item.unitPrice);
        const qty = parseQty(item.qty);
        const gstRate = getItemGstRate(item);

        let cgstRate = 0, sgstRate = 0, igstRate = 0;
        if (isIntraState) {
          cgstRate = toNumber(item.cgst) || (toNumber(item.igst) / 2) || (gstRate / 2);
          sgstRate = toNumber(item.sgst) || (toNumber(item.igst) / 2) || (gstRate / 2);
        } else {
          igstRate = toNumber(item.igst) || (toNumber(item.cgst) + toNumber(item.sgst)) || gstRate;
        }

        const taxableValue = roundCurrency(unitPrice * qty);
        subtotal += taxableValue;
        
        const cgstAmt = roundCurrency((taxableValue * cgstRate) / 100);
        const sgstAmt = roundCurrency((taxableValue * sgstRate) / 100);
        const igstAmt = roundCurrency((taxableValue * igstRate) / 100);
        
        cgstTotal += cgstAmt;
        sgstTotal += sgstAmt;
        igstTotal += igstAmt;

        const itemTotal = roundCurrency(taxableValue + cgstAmt + sgstAmt + igstAmt);
        const displayGstRate = isIntraState ? (cgstRate + sgstRate) : igstRate;

        return `
          <tr>
            <td style="text-align:center">${index + 1}</td>
            <td class="desc">${formatInvoiceDescription(item.description)}</td>
            <td class="num">${qty}</td>
            <td class="num">${formatCurrencyIG(unitPrice)}</td>
            <td class="num">${formatCurrencyIG(taxableValue)}</td>
            <td class="num">${displayGstRate}%</td>
            <td class="num">${formatCurrencyIG(itemTotal)}</td>
          </tr>
        `;
      }).join('');
      
      subtotal = roundCurrency(subtotal);
      cgstTotal = roundCurrency(cgstTotal);
      sgstTotal = roundCurrency(sgstTotal);
      igstTotal = roundCurrency(igstTotal);
      totalAmt = roundCurrency(subtotal + cgstTotal + sgstTotal + igstTotal);
    } else {
      const is2Years = req.validity === '2 Years' || req.validity === '24 Month';
      const is5Years = req.validity === '5 Years' || req.validity === '60 Month';
      
      let unitPrice = 4300;
      let cgstRate = 9;
      let sgstRate = 9;
      let validityPeriod = '12 Month';
      
      if (is2Years) {
        unitPrice = 5600;
        validityPeriod = '24 Month';
      } else if (is5Years) {
        unitPrice = 10000;
        validityPeriod = '60 Month';
      }
      
      // Item 1
      const qty1 = 1;
      const taxable1 = roundCurrency(unitPrice * qty1);
      let cgstAmt1 = 0, sgstAmt1 = 0, igstAmt1 = 0;
      if (isIntraState) {
        cgstAmt1 = roundCurrency((taxable1 * cgstRate) / 100);
        sgstAmt1 = roundCurrency((taxable1 * sgstRate) / 100);
      } else {
        igstAmt1 = roundCurrency((taxable1 * 18) / 100);
      }
      const totalWithGst1 = roundCurrency(taxable1 + cgstAmt1 + sgstAmt1 + igstAmt1);

      // Item 2 (Installation)
      const unitPrice2 = 400;
      const qty2 = 1;
      const taxable2 = roundCurrency(unitPrice2 * qty2);
      let cgstAmt2 = 0, sgstAmt2 = 0, igstAmt2 = 0;
      if (isIntraState) {
        cgstAmt2 = roundCurrency((taxable2 * cgstRate) / 100);
        sgstAmt2 = roundCurrency((taxable2 * sgstRate) / 100);
      } else {
        igstAmt2 = roundCurrency((taxable2 * 18) / 100);
      }
      const totalWithGst2 = roundCurrency(taxable2 + cgstAmt2 + sgstAmt2 + igstAmt2);

      subtotal = roundCurrency(taxable1 + taxable2);
      cgstTotal = roundCurrency(cgstAmt1 + cgstAmt2);
      sgstTotal = roundCurrency(sgstAmt1 + sgstAmt2);
      igstTotal = roundCurrency(igstAmt1 + igstAmt2);
      totalAmt = roundCurrency(totalWithGst1 + totalWithGst2);

      itemsHtml = `
        <tr>
          <td style="text-align:center">1</td>
          <td class="desc">iTriangle (Bharat101 Plus) Ais140 ${is2Years ? '_2G' : is5Years ? '_5G' : '2G'}<br/><small style="color:#555;">VLTD Device including Dual profile E-sim & Software + 01 Panic Switch (Validity: ${validityPeriod})</small></td>
          <td class="num">${qty1}</td>
          <td class="num">${formatCurrencyIG(unitPrice)}</td>
          <td class="num">${formatCurrencyIG(taxable1)}</td>
          <td class="num">18%</td>
          <td class="num">${formatCurrencyIG(totalWithGst1)}</td>
        </tr>
        <tr>
          <td style="text-align:center">2</td>
          <td class="desc">Installation<br/><small style="color:#555;">One Time Installation Charges</small></td>
          <td class="num">${qty2}</td>
          <td class="num">${formatCurrencyIG(unitPrice2)}</td>
          <td class="num">${formatCurrencyIG(taxable2)}</td>
          <td class="num">18%</td>
          <td class="num">${formatCurrencyIG(totalWithGst2)}</td>
        </tr>
      `;
    }

    const amountInWords = numberToWords(totalAmt);

    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) {
      alert('Popup blocker enabled. Please allow popups to download/print the invoice.');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
      <meta charset="UTF-8">
      <title>Arshi GPS – Proforma Invoice</title>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Nunito+Sans:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        :root{
          --teal:#007B8A;--teal-dark:#005a66;--teal-light:#E0F4F7;--teal-mid:#b2e4ec;
          --accent:#f0a500;--bg:#eef4f6;--white:#ffffff;--text:#1a2a30;--muted:#5a7a82;--border:#cce4e8
        }
        body{font-family:'Nunito Sans',sans-serif;background:#fff;color:var(--text);padding:0;margin:0;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}

        /* Page — single A4 */
        .page{background:var(--white);width:210mm;max-width:100%;height:297mm;margin:0 auto;overflow:hidden;display:flex;flex-direction:column}

        /* Header */
        .header{background:var(--teal);padding:16px 28px 12px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-shrink:0}
        .brand-name{font-family:'Nunito',sans-serif;font-size:26px;font-weight:800;color:#fff;letter-spacing:0}
        .brand-sub{color:rgba(255,255,255,0.78);font-size:10.5px;margin-top:3px;line-height:1.4}
        .invoice-title-block{text-align:right;flex-shrink:0}
        .inv-label{font-family:'Nunito',sans-serif;font-size:18px;font-weight:800;color:#fff;letter-spacing:1px;text-transform:uppercase}
        .inv-meta{color:rgba(255,255,255,0.82);font-size:11px;margin-top:5px;line-height:1.6}

        /* Accent bar */
        .accent-bar{height:4px;background:linear-gradient(90deg,var(--accent) 0%,#f5d26e 50%,var(--teal-mid) 100%);flex-shrink:0}

        /* Info grid */
        .info-grid{display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1.5px solid var(--border);flex-shrink:0}
        .info-box{padding:10px 14px;border-right:1px solid var(--border)}
        .info-box:last-child{border-right:none}
        .info-box-head{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--teal);margin-bottom:6px;display:flex;align-items:center;gap:5px}
        .info-box-head::before{content:'';display:inline-block;width:2.5px;height:10px;background:var(--accent);border-radius:2px}
        .info-box p{font-size:10.5px;color:var(--text);line-height:1.45}
        .co-name{font-weight:700;font-size:11px;color:var(--text);margin-bottom:2px}

        /* Table */
        .table-wrap{padding:0 20px;flex:0 0 auto}
        table{width:100%;border-collapse:collapse;margin-top:10px}
        thead tr{background:var(--teal)}
        thead th{color:#fff;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding:7px 6px}
        thead th:first-child{border-radius:5px 0 0 0;padding-left:12px}
        thead th:last-child{border-radius:0 5px 0 0}
        tbody tr{border-bottom:1px solid var(--border)}
        td{padding:6px 6px;font-size:10.5px;vertical-align:top}
        td:first-child{padding-left:12px}
        td.desc{min-width:140px;word-break:break-word;text-align:left}
        td.num{text-align:right;white-space:nowrap}

        .sub-row td{background:var(--teal-light);font-weight:700;font-size:11px;color:var(--teal-dark);border-top:2px solid var(--teal-mid)}

        /* Bottom */
        .bottom-shell{margin-top:auto;flex:0 0 auto}
        .bottom{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,0.9fr);gap:0;margin-top:8px;padding:0 20px 10px;align-items:start}
        .amount-words{font-size:10px;color:var(--text);margin-bottom:8px;line-height:1.35}
        .amount-words strong{color:var(--teal-dark)}
        .section-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--teal);margin-bottom:5px;display:flex;align-items:center;gap:5px}
        .section-title::before{content:'';display:inline-block;width:2.5px;height:9px;background:var(--accent);border-radius:2px}
        .tc-list{list-style:none;padding:0;margin-bottom:8px}
        .tc-list li{font-size:8.5px;color:#2a4a52;line-height:1.3;padding:1px 0 1px 14px;position:relative}
        .tc-list li::before{content:attr(data-n);position:absolute;left:0;font-weight:700;color:var(--teal);font-size:8.5px}
        .bank-row{font-size:9.5px;color:var(--muted);padding:2px 0;display:flex;gap:6px;align-items:center}
        .bank-row span:first-child{font-weight:600;color:var(--text);min-width:95px}

        /* Tax block */
        .tax-block{padding-left:16px;border-left:1.5px solid var(--border)}
        .tax-row{display:flex;justify-content:space-between;font-size:10px;padding:3px 0;border-bottom:1px solid #eef4f6;color:var(--text)}
        .tax-row:last-child{border-bottom:none}
        .tax-row.hl{color:var(--teal-dark);font-weight:700}
        .total-box{background:var(--teal);border-radius:6px;padding:10px 14px;margin-top:8px;text-align:center}
        .total-label{color:rgba(255,255,255,0.8);font-size:9px;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px}
        .total-amount{color:#fff;font-family:'Nunito',sans-serif;font-size:18px;font-weight:800;letter-spacing:0}

        /* Footer */
        .footer{margin:6px 20px 10px;padding-top:6px;border-top:1.5px solid var(--border);text-align:center;flex-shrink:0}
        .footer p{font-size:9px;color:var(--muted);line-height:1.3;font-style:italic}

        /* Print */
        @media print{
          @page{size:A4 portrait;margin:0}
          html,body{width:210mm;height:297mm;margin:0;overflow:hidden}
          body{background:#fff;padding:0;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
          .page{box-shadow:none;border:none;border-radius:0;width:210mm;max-width:210mm;height:297mm;overflow:hidden;display:flex;flex-direction:column}
          .header{padding:5mm 7mm 3.5mm}
          .header img{height:30px!important;border-radius:4px!important}
          .brand-name{font-size:18px!important}
          .brand-sub{font-size:7.8px!important;margin-top:1px!important;line-height:1.2!important}
          .inv-label{font-size:13px!important}
          .inv-meta{font-size:8px!important;margin-top:2px!important;line-height:1.3!important}
          .accent-bar{height:2px!important}
          .info-box{padding:3mm 3.5mm!important}
          .info-box-head{font-size:7px!important;margin-bottom:1.5mm!important;letter-spacing:0.5px!important}
          .info-box p{font-size:8px!important;line-height:1.18!important}
          .co-name{font-size:8.5px!important}
          .table-wrap{padding:0 6mm!important}
          table{margin-top:2.5mm!important}
          thead th{padding:2.5px 4px!important;font-size:7.5px!important;letter-spacing:0.3px!important}
          td{padding:2.5px 4px!important;font-size:8px!important;line-height:1.15!important}
          td small{font-size:7px!important}
          .sub-row td{padding:2.5px 4px!important;font-size:8px!important}
          .bottom-shell{margin-top:auto!important;padding-top:1mm!important;page-break-inside:avoid}
          .bottom{grid-template-columns:minmax(0,1.08fr) minmax(0,0.92fr);padding:0 6mm 1mm!important;margin-top:0!important;page-break-inside:avoid;gap:0}
          .amount-words{font-size:7.5px!important;margin-bottom:2mm!important;line-height:1.15!important}
          .section-title{font-size:7px!important;margin-bottom:1.2mm!important;letter-spacing:0.4px!important}
          .tc-list{margin-bottom:2mm!important}
          .tc-list li{font-size:6.5px!important;padding:0 0 0.4px 10px!important;line-height:1.1!important}
          .tc-list li::before{font-size:6.5px!important}
          .bank-row{font-size:7.2px!important;padding:0.4px 0!important}
          .bank-row span:first-child{min-width:60px!important}
          .tax-block{padding-left:3.5mm!important}
          .tax-row{font-size:7.5px!important;padding:1px 0!important}
          .total-box{padding:2mm 2.5mm!important;margin-top:1.8mm!important;border-radius:4px!important}
          .total-amount{font-size:11px!important}
          .total-label{font-size:6.5px!important}
          .tax-block .fab-section{margin-top:2.5mm!important}
          .footer{margin:1mm 6mm 2mm!important;padding-top:1mm!important;page-break-inside:avoid}
          .footer p{font-size:7px!important;line-height:1.1!important}
          tr{page-break-inside:avoid}
          tbody tr:hover{background:transparent}
        }
      </style>
      </head>
      <body>

      <div class="page" id="invoice">

        <!-- Header -->
        <div class="header">
          <div>
            <div style="display:flex;align-items:center;gap:10px">
              <img src="${INVOICE_LOGO}" style="height:40px;border-radius:6px" alt="Arshi Enterprises Logo"/>
              <div class="brand-name">Arshi Enterprises</div>
            </div>
            <div class="brand-sub">
              Near Brajesh Auto Mobile Maranga,<br>
              Purnea, Bihar, 854304 | Ph:-7782808063, 919905959287<br>
              GST No: 10ATIPK1589P1ZA
            </div>
          </div>
          <div class="invoice-title-block">
            <div class="inv-label">Proforma Invoice</div>
            <div class="inv-meta">
              Date: ${piDate}<br>
              PI No: ${piInvoiceNo}
            </div>
          </div>
        </div>

        <!-- Accent bar -->
        <div class="accent-bar"></div>

        <!-- Customer / Ship To / Shipping -->
        <div class="info-grid">
          <div class="info-box">
            <div class="info-box-head">${req.isSubDealer ? 'Dealer / Sub-Dealer' : 'Customer'}</div>
            <p class="co-name">${customerName}</p>
            <p>${customerAddress}</p>
            <p>GSTIN: ${customerGstin}</p>
          </div>
          <div class="info-box">
            <div class="info-box-head">Ship To</div>
            <p class="co-name">${customerName}</p>
            <p>${customerAddress}</p>
            <p>GSTIN: ${customerGstin}</p>
          </div>
          <div class="info-box">
            <div class="info-box-head">Shipping Details</div>
            <p class="co-name">${customerName}</p>
            <p>${customerAddress}</p>
            <p>Mobile: ${customerMob}</p>
            <p>GSTIN: ${customerGstin}</p>
          </div>
        </div>

        <!-- Items Table -->
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:32px;text-align:center">SL</th>
                <th style="text-align:left">Description</th>
                <th style="width:40px;text-align:right">QTY</th>
                <th style="width:78px;text-align:right">Unit Price</th>
                <th style="width:88px;text-align:right">Taxable Amt</th>
                <th style="width:44px;text-align:right">GST</th>
                <th style="width:92px;text-align:right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
            <tfoot>
              <tr class="sub-row">
                <td colspan="4" style="text-align:right;padding-right:10px;font-size:11px;letter-spacing:0.4px">Sub Total (Taxable)</td>
                <td class="num" style="font-size:11px">${formatCurrencyIG(subtotal)}</td>
                <td></td>
                <td class="num" style="font-size:11px">${formatCurrencyIG(totalAmt)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- Bottom: Terms + Tax -->
        <div class="bottom-shell">
          <div class="bottom">
          <div>
            <div class="amount-words">
              <strong>Amount in Words:</strong> ${amountInWords}
            </div>

            <div class="section-title">Terms &amp; Conditions</div>
            <ul class="tc-list">
              <li data-n="1.">100% Advance payment required.</li>
              <li data-n="2.">Goods once sold cannot be taken back.</li>
              <li data-n="3.">Installation Charges (@INR 500) extra per unit. (Negotiable in bulk orders at one location.)</li>
              <li data-n="4.">Courier charges to be paid by customer.</li>
              <li data-n="5.">Warranty — 12 Months from date of Supply; applicable before 15 days of due date.</li>
              <li data-n="6.">Standard Force Majeure will apply. No warranty on burnt/damaged goods.</li>
              <li data-n="7.">Service during warranty year @INR 500 per unit will be applicable.</li>
            </ul>

            <div class="section-title">Bank Details</div>
            <div class="bank-row"><span>Account Name</span><span style="font-weight:700;color:var(--text)">ARSHI ENTERPRISES</span></div>
            <div class="bank-row"><span>Account Number</span><span style="font-weight:700;color:var(--text)">071205500764</span></div>
            <div class="bank-row"><span>Bank &amp; Branch</span><span style="font-weight:700;color:var(--text)">ICICI, Purnea</span></div>
            <div class="bank-row"><span>IFSC Code</span><span style="font-weight:700;color:var(--text)">ICIC0000712</span></div>
          </div>

          <div class="tax-block">
            <div class="section-title">Tax Summary</div>
            <div class="tax-row"><span>Taxable Amount</span><span>${formatCurrencyIG(subtotal)}</span></div>
            ${isIntraState ? `
              <div class="tax-row hl"><span>SGST @ 9%</span><span>${formatCurrencyIG(sgstTotal)}</span></div>
              <div class="tax-row hl"><span>CGST @ 9%</span><span>${formatCurrencyIG(cgstTotal)}</span></div>
              <div class="tax-row"><span>IGST @ 18%</span><span>0.00</span></div>
            ` : `
              <div class="tax-row"><span>SGST @ 9%</span><span>0.00</span></div>
              <div class="tax-row"><span>CGST @ 9%</span><span>0.00</span></div>
              <div class="tax-row hl"><span>IGST @ 18%</span><span>${formatCurrencyIG(igstTotal)}</span></div>
            `}
            <div class="tax-row hl" style="border-top:1.5px solid var(--teal-mid);margin-top:2px;padding-top:4px"><span>Total Tax</span><span>${formatCurrencyIG(roundCurrency(sgstTotal + cgstTotal + igstTotal))}</span></div>
            
            <div class="total-box">
              <div class="total-label">Grand Total</div>
              <div class="total-amount">₹ ${formatCurrencyIG(totalAmt)}</div>
            </div>

            <div class="fab-section" style="margin-top:14px">
              <div class="section-title">Features &amp; Benefits (FaB)</div>
              <ul class="tc-list" style="margin-bottom:0">
                <li data-n="1.">Multiple Mobile access</li>
                <li data-n="2.">Real time Track your Vehicle via Mob. &amp; PC.</li>
                <li data-n="3.">Direction/Speed &amp; Ignition On/Off Detection.</li>
                <li data-n="4.">Ignition Cut off Alarm.</li>
                <li data-n="5.">Multiple Geo-fence setup &amp; alarm.</li>
                <li data-n="6.">Back-up data from 01hrs to last 30 days.</li>
                <li data-n="7.">Moving overview, Stay/Overspeed/Alarm Details etc.</li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="footer">
          <p>This document is computer generated and does not require a signature or stamp to be considered valid.</p>
        </div>
        </div>

      </div>

      <script>
        window.onload = function() {
          window.print();
        };
      </script>
      </body>
      </html>
    `);
    
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
          Invoice & Billing Generator
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
              <label>PI Number</label>
              <input 
                type="text" 
                value={piNo}
                readOnly
                placeholder="Generating..."
                style={{ backgroundColor: '#f1f5f9', cursor: 'not-allowed' }}
              />
            </div>

            <div className="form-field">
              <label>Invoice Number</label>
              <input 
                type="text" 
                value={invoiceNo}
                readOnly
                placeholder="Generating..."
                style={{ backgroundColor: '#f1f5f9', cursor: 'not-allowed' }}
              />
            </div>
          </div>

          {/* Section 2: Items Builder */}
          <div className="form-section-title">2. Invoice Items & Charges Details</div>
          <div className="items-builder-container" style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '15px', background: '#fafafa' }}>
            <table className="items-builder-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #ddd', background: '#f1f5f9' }}>
                  <th style={{ width: '45%', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Item Description*</th>
                  <th style={{ width: '15%', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Validity*</th>
                  <th style={{ width: '15%', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Unit Price*</th>
                  <th style={{ width: '10%', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>GST%*</th>
                  <th style={{ width: '10%', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Qty*</th>
                  <th style={{ width: '5%', padding: '8px', textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '6px' }}>
                      <textarea 
                        value={item.description}
                        onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                        placeholder="e.g. iTriangle (Bharat101 Plus) Ais140 2G..."
                        rows="2"
                        required
                        style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontSize: '12px', padding: '5px', border: '1px solid #ccc', borderRadius: '3px' }}
                      />
                    </td>
                    <td style={{ padding: '6px' }}>
                      <input 
                        type="text" 
                        value={item.validity}
                        onChange={(e) => handleItemChange(idx, 'validity', e.target.value)}
                        placeholder="e.g. 12 Month"
                        required
                        style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px', padding: '5px', border: '1px solid #ccc', borderRadius: '3px' }}
                      />
                    </td>
                    <td style={{ padding: '6px' }}>
                      <input 
                        type="number" 
                        value={item.unitPrice}
                        onChange={(e) => handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                        placeholder="4300"
                        required
                        style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px', padding: '5px', border: '1px solid #ccc', borderRadius: '3px' }}
                      />
                    </td>
                    <td style={{ padding: '6px' }}>
                      <input 
                        type="number" 
                        value={item.gstRate}
                        onChange={(e) => handleItemChange(idx, 'gstRate', parseFloat(e.target.value) || 0)}
                        placeholder="18"
                        required
                        style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px', padding: '5px', border: '1px solid #ccc', borderRadius: '3px' }}
                      />
                    </td>
                    <td style={{ padding: '6px' }}>
                      <input 
                        type="number" 
                        value={item.qty}
                        onChange={(e) => handleItemChange(idx, 'qty', parseInt(e.target.value) || 1)}
                        placeholder="1"
                        required
                        style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px', padding: '5px', border: '1px solid #ccc', borderRadius: '3px' }}
                      />
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
                ))}
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

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '15px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontWeight: '800', color: 'var(--primary-blue)', fontSize: '13px' }}>
              Total Invoice Amount: ₹{totalInvoiceValue.toFixed(2)}
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
                      <td style={{ padding: '10px', color: 'var(--primary-blue)', fontWeight: 'bold' }}>{req.piNo || 'AE-01'}</td>
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
