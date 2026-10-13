import { useState, useEffect, useMemo } from 'react';
import { 
  FaUserTie, 
  FaFileInvoiceDollar, 
  FaCalendarAlt, 
  FaChevronDown, 
  FaChevronUp, 
  FaPrint, 
  FaSave, 
  FaSpinner, 
  FaCheckCircle, 
  FaExclamationTriangle,
  FaSearch,
  FaPlus,
  FaTrash,
  FaFileExcel,
  FaDownload
} from 'react-icons/fa';
import * as XLSX from 'xlsx';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { 
  renderDealerBillHtml, 
  printDealerBill, 
  toNumber, 
  roundCurrency, 
  formatCurrency, 
  numberToWords,
  formatDotDate,
  normalizeActCategoryLabel,
} from '../../utils/dealerBillTemplate';
import './DealerBillGenerator.css';

const DealerBillGenerator = ({ onBillSaved }) => {
  const { user } = useAuth();

  // Dealers List & Selection
  const [dealers, setDealers] = useState([]);
  const [loadingDealers, setLoadingDealers] = useState(false);
  const [selectedDealerId, setSelectedDealerId] = useState('');
  const [selectedDealer, setSelectedDealer] = useState(null);

  // Date Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Billable Data from API
  const [loadingBillables, setLoadingBillables] = useState(false);
  const [billableData, setBillableData] = useState(null);

  // Category Configuration (prices & expanded state)
  const [catState, setCatState] = useState({
    twoYear: {
      description: 'AIS-140 VLTD - 2 Year Activation Plan',
      unitPrice: 3559.32,
      priceWithGst: 4200,
      expanded: true,
    },
    oneYear: {
      description: 'AIS-140 VLTD - 1 Year Activation Plan',
      unitPrice: 2008.47,
      priceWithGst: 2370,
      expanded: false,
    },
    topup: {
      description: 'AIS-140 VLTD - 1 Year Top-up / Recharge Plan',
      unitPrice: 500,
      priceWithGst: 590,
      expanded: false,
    },
    twoYearTopup: {
      description: 'AIS-140 VLTD - 2 Year Top-up / Recharge Plan',
      unitPrice: 1000,
      priceWithGst: 1180,
      expanded: false,
    },
    claSy: {
      description: 'CLA / Sy Charges',
      unitPrice: 500,
      priceWithGst: 590,
      expanded: false,
    },
    renewal: {
      description: 'VLTD Annual Renewal Plan',
      unitPrice: 1500,
      priceWithGst: 1770,
      expanded: false,
    },
  });

  // Selected Item Keys (by item unique ID or IMEI) per category
  const [selectedItemsByCat, setSelectedItemsByCat] = useState({
    twoYear: new Set(),
    oneYear: new Set(),
    topup: new Set(),
    twoYearTopup: new Set(),
    claSy: new Set(),
    renewal: new Set(),
  });

  // Category items list including any manually added IMEIs
  const [categoryItems, setCategoryItems] = useState({
    twoYear: [],
    oneYear: [],
    topup: [],
    twoYearTopup: [],
    claSy: [],
    renewal: [],
  });

  // Search filter terms per category
  const [searchTermByCat, setSearchTermByCat] = useState({
    twoYear: '',
    oneYear: '',
    topup: '',
    twoYearTopup: '',
    claSy: '',
    renewal: '',
  });

  // Manual IMEI input per category
  const [manualInputs, setManualInputs] = useState({
    twoYear: '',
    oneYear: '',
    topup: '',
    twoYearTopup: '',
    claSy: '',
    renewal: '',
  });

  // Manual Vehicle No input per category
  const [manualVehicleInputs, setManualVehicleInputs] = useState({
    twoYear: '',
    oneYear: '',
    topup: '',
    twoYearTopup: '',
    claSy: '',
    renewal: '',
  });

  // Manual Act. Category (NIC / Mining) input per category
  const [manualActCategoryInputs, setManualActCategoryInputs] = useState({
    twoYear: 'NIC',
    oneYear: 'NIC',
    topup: 'NIC',
    twoYearTopup: 'NIC',
    claSy: 'NIC',
    renewal: 'NIC',
  });

  // Invoice Meta
  const [piNo, setPiNo] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [savingBill, setSavingBill] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Load Dealers list on mount
  useEffect(() => {
    fetchDealers();
    fetchNextNumbers();
  }, []);

  const fetchDealers = async () => {
    try {
      setLoadingDealers(true);
      let res;
      try {
        res = await api.get('/users/sub-users');
      } catch (err) {
        res = await api.get('/dealers');
      }
      const rawList = Array.isArray(res.data) ? res.data : (res.data.dealers || res.data.users || []);
      const filtered = rawList.filter(u => u.userType !== 'Administration');
      setDealers(filtered.length > 0 ? filtered : rawList);
    } catch (err) {
      console.error('Failed to load dealers:', err);
    } finally {
      setLoadingDealers(false);
    }
  };

  const fetchNextNumbers = async () => {
    try {
      const res = await api.get('/invoices/next-pi-no');
      if (res.data.nextPiNo) setPiNo(res.data.nextPiNo);
      if (res.data.nextInvoiceNo) setInvoiceNo(res.data.nextInvoiceNo);
    } catch (err) {
      console.error('Failed to get next invoice numbers:', err);
    }
  };

  // Helper to generate a unique key for any item
  const getItemKey = (item, index) => {
    return String(item.id || item._id || item.imei || `item-${index}`).trim();
  };

  // Fetch billable items when dealer is selected
  const fetchDealerBillableItems = async (dealerId = selectedDealerId) => {
    if (!dealerId) return;

    try {
      setLoadingBillables(true);
      setErrorMessage('');
      setSaveSuccess(null);

      const params = new URLSearchParams({ dealerId });
      if (fromDate) params.append('fromDate', fromDate);
      if (toDate) params.append('toDate', toDate);

      const res = await api.get(`/invoices/dealer-billable-items?${params.toString()}`);
      const data = res.data;
      setBillableData(data);
      setSelectedDealer(data.dealer);

      const twoYrList = data.categories?.twoYearActivations?.items || [];
      const oneYrList = data.categories?.oneYearActivations?.items || [];
      const topList = data.categories?.topupPlans?.items || [];
      const twoYrTopList = data.categories?.twoYearTopupPlans?.items || [];
      const claSyList = data.categories?.claSyCharges?.items || [];
      const renList = data.categories?.renewalPlans?.items || [];

      setCategoryItems({
        twoYear: twoYrList,
        oneYear: oneYrList,
        topup: topList,
        twoYearTopup: twoYrTopList,
        claSy: claSyList,
        renewal: renList,
      });

      // Start with empty selection so user can single-tick select desired items
      setSelectedItemsByCat({
        twoYear: new Set(),
        oneYear: new Set(),
        topup: new Set(),
        twoYearTopup: new Set(),
        claSy: new Set(),
        renewal: new Set(),
      });

      // Auto-update standard prices & expand categories that contain items
      if (data.categories) {
        setCatState(prev => ({
          ...prev,
          twoYear: {
            ...prev.twoYear,
            expanded: twoYrList.length > 0,
            priceWithGst: data.categories.twoYearActivations?.suggestedPriceWithGst || 4200,
            unitPrice: roundCurrency((data.categories.twoYearActivations?.suggestedPriceWithGst || 4200) / 1.18),
          },
          oneYear: {
            ...prev.oneYear,
            expanded: oneYrList.length > 0,
            priceWithGst: data.categories.oneYearActivations?.suggestedPriceWithGst || 2370,
            unitPrice: roundCurrency((data.categories.oneYearActivations?.suggestedPriceWithGst || 2370) / 1.18),
          },
          topup: {
            ...prev.topup,
            expanded: topList.length > 0,
            priceWithGst: data.categories.topupPlans?.suggestedPriceWithGst || 590,
            unitPrice: roundCurrency((data.categories.topupPlans?.suggestedPriceWithGst || 590) / 1.18),
          },
          twoYearTopup: {
            ...prev.twoYearTopup,
            expanded: twoYrTopList.length > 0,
            priceWithGst: data.categories.twoYearTopupPlans?.suggestedPriceWithGst || 1180,
            unitPrice: roundCurrency((data.categories.twoYearTopupPlans?.suggestedPriceWithGst || 1180) / 1.18),
          },
          claSy: {
            ...prev.claSy,
            expanded: claSyList.length > 0,
            priceWithGst: data.categories.claSyCharges?.suggestedPriceWithGst || 590,
            unitPrice: roundCurrency((data.categories.claSyCharges?.suggestedPriceWithGst || 590) / 1.18),
          },
          renewal: {
            ...prev.renewal,
            expanded: renList.length > 0,
            priceWithGst: data.categories.renewalPlans?.suggestedPriceWithGst || 1770,
            unitPrice: roundCurrency((data.categories.renewalPlans?.suggestedPriceWithGst || 1770) / 1.18),
          },
        }));
      }
    } catch (err) {
      console.error('Failed to load dealer billables:', err);
      setErrorMessage(err.response?.data?.message || 'Failed to fetch billable items for selected dealer.');
    } finally {
      setLoadingBillables(false);
    }
  };

  const handleDealerChange = (e) => {
    const id = e.target.value;
    setSelectedDealerId(id);
    if (id) {
      fetchDealerBillableItems(id);
    } else {
      setBillableData(null);
      setSelectedDealer(null);
      setCategoryItems({ twoYear: [], oneYear: [], topup: [], twoYearTopup: [], claSy: [], renewal: [] });
      setSelectedItemsByCat({ twoYear: new Set(), oneYear: new Set(), topup: new Set(), twoYearTopup: new Set(), claSy: new Set(), renewal: new Set() });
    }
  };

  // Toggle single item selection
  const toggleItemSelection = (catKey, itemKey) => {
    setSelectedItemsByCat(prev => {
      const nextSet = new Set(prev[catKey]);
      const isSelecting = !nextSet.has(itemKey);
      if (isSelecting) {
        nextSet.add(itemKey);
      } else {
        nextSet.delete(itemKey);
      }

      // If user selected this item and it has a positive billAmount, sync category rate with it
      if (isSelecting) {
        const itemObj = (categoryItems[catKey] || []).find((it, idx) => getItemKey(it, idx) === itemKey);
        const itemAmt = Number(itemObj?.billAmount || itemObj?.amount || 0);
        if (itemAmt > 0) {
          setCatState(cPrev => ({
            ...cPrev,
            [catKey]: {
              ...cPrev[catKey],
              priceWithGst: itemAmt,
              unitPrice: roundCurrency(itemAmt / 1.18),
            }
          }));
        }
      }

      return {
        ...prev,
        [catKey]: nextSet,
      };
    });
  };

  // Helper to find existing metadata for an IMEI across all categories
  const findExistingImeiMeta = (imeiStr) => {
    const clean = String(imeiStr || '').trim();
    if (!clean || clean === 'N/A') return {};
    for (const k of Object.keys(categoryItems)) {
      const list = categoryItems[k] || [];
      const found = list.find(it => String(it.imei || '').trim() === clean);
      if (found) {
        const v = String(found.vehicleNo || '').trim();
        const validV = (v && v !== 'Manual' && v !== 'Service/System' && v !== 'Charge' && v !== '-') ? v : '';
        return {
          vehicleNo: validV,
          actCategory: found.actCategory || found.activationMode || 'NIC',
          customerName: found.customerName || '',
          date: found.date || null,
        };
      }
    }
    return {};
  };

  // Update Vehicle No inline for any item (and sync across same IMEI in other categories)
  const handleUpdateItemVehicle = (catKey, itemKey, newVehicleNo, imeiVal = '') => {
    const upperVeh = newVehicleNo ? newVehicleNo.toUpperCase() : '';
    const cleanImei = String(imeiVal || '').trim();
    setCategoryItems(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(k => {
        updated[k] = (updated[k] || []).map((it, idx) => {
          if ((k === catKey && getItemKey(it, idx) === itemKey) || (cleanImei && cleanImei !== 'N/A' && String(it.imei || '').trim() === cleanImei)) {
            return { ...it, vehicleNo: upperVeh };
          }
          return it;
        });
      });
      return updated;
    });
  };

  // Update Act. Category (NIC / Mining) inline for any item (and sync across same IMEI in other categories)
  const handleUpdateItemActCategory = (catKey, itemKey, newActCategory, imeiVal = '') => {
    const cleanImei = String(imeiVal || '').trim();
    setCategoryItems(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(k => {
        updated[k] = (updated[k] || []).map((it, idx) => {
          if ((k === catKey && getItemKey(it, idx) === itemKey) || (cleanImei && cleanImei !== 'N/A' && String(it.imei || '').trim() === cleanImei)) {
            return { ...it, actCategory: newActCategory, activationMode: newActCategory };
          }
          return it;
        });
      });
      return updated;
    });
  };

  // Add manual IMEI / Item to a category (with Vehicle No & Act. Category support)
  const handleAddManualImei = (catKey) => {
    const rawVal = String(manualInputs[catKey] || '').trim();
    const rawVeh = String(manualVehicleInputs[catKey] || '').trim();
    const selectedActCat = manualActCategoryInputs[catKey] || 'NIC';
    if (!rawVal && !rawVeh) return;

    // Support comma or newline separated entries
    const lines = (rawVal || (catKey === 'claSy' ? 'CLA / Sy Charge' : 'Manual Item'))
      .split(/[\n]+/)
      .map(s => s.trim())
      .filter(Boolean);

    const defaultDevName = catKey === 'claSy' 
      ? 'CLA / Sy Charges' 
      : catKey === 'twoYearTopup'
      ? 'Second Year Top-up Plan'
      : catKey === 'topup' 
      ? 'One Year Top-up Plan' 
      : 'Manual Added Device';

    const newItems = [];

    lines.forEach((line, lineIdx) => {
      const subEntries = line.split(',').map(s => s.trim()).filter(Boolean);

      // If user typed e.g. "358250331072179, DL01AB1234" in single IMEI input and vehicle input is empty
      if (subEntries.length === 2 && !rawVeh && !/^\d{15}$/.test(subEntries[1])) {
        const imeiPart = subEntries[0];
        const existingMeta = findExistingImeiMeta(imeiPart);
        const vehPart = subEntries[1].toUpperCase() || existingMeta.vehicleNo || '';
        const actCatPart = existingMeta.actCategory || selectedActCat;
        newItems.push({
          id: `manual-${Date.now()}-${lineIdx}-${Math.random().toString(36).substr(2, 5)}`,
          imei: imeiPart,
          deviceName: defaultDevName,
          customerName: existingMeta.customerName || selectedDealer?.displayName || 'Dealer Customer',
          vehicleNo: vehPart,
          actCategory: actCatPart,
          activationMode: actCatPart,
          date: existingMeta.date || new Date().toISOString(),
          isManual: true,
        });
      } else {
        subEntries.forEach((entry, idx) => {
          let imeiPart = entry;
          let vehPart = rawVeh ? rawVeh.toUpperCase() : '';

          // If entry itself has separator like "358250331072179 / DL01AB1234" or "358250331072179 - DL01AB1234"
          if (!vehPart && (entry.includes('/') || entry.includes(' - ') || entry.includes(':'))) {
            const parts = entry.split(/[\/:|]|\s-\s/).map(p => p.trim()).filter(Boolean);
            if (parts.length >= 2) {
              imeiPart = parts[0];
              vehPart = parts[1].toUpperCase();
            }
          }

          const existingMeta = findExistingImeiMeta(imeiPart);
          if (!vehPart) {
            vehPart = existingMeta.vehicleNo || (catKey === 'claSy' ? 'Service/System' : 'Manual');
          }
          const actCatPart = existingMeta.actCategory || selectedActCat;

          newItems.push({
            id: `manual-${Date.now()}-${lineIdx}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
            imei: imeiPart,
            deviceName: defaultDevName,
            customerName: existingMeta.customerName || selectedDealer?.displayName || 'Dealer Customer',
            vehicleNo: vehPart,
            actCategory: actCatPart,
            activationMode: actCatPart,
            date: existingMeta.date || new Date().toISOString(),
            isManual: true,
          });
        });
      }
    });

    if (newItems.length === 0) return;

    setCategoryItems(prev => ({
      ...prev,
      [catKey]: [...newItems, ...prev[catKey]],
    }));

    setSelectedItemsByCat(prev => {
      const nextSet = new Set(prev[catKey]);
      newItems.forEach((it, i) => nextSet.add(getItemKey(it, i)));
      return {
        ...prev,
        [catKey]: nextSet,
      };
    });

    setManualInputs(prev => ({
      ...prev,
      [catKey]: '',
    }));

    setManualVehicleInputs(prev => ({
      ...prev,
      [catKey]: '',
    }));
  };

  // Quick add units helper (especially handy for CLA/Sy Charges)
  const handleQuickAddUnits = (catKey, count = 1) => {
    const num = parseInt(count, 10);
    if (!num || num <= 0) return;

    const currentLen = (categoryItems[catKey] || []).length;
    const labelPrefix = catKey === 'claSy' ? 'CLA/Sy Charge' : 'Unit';

    const newItems = Array.from({ length: num }, (_, idx) => ({
      id: `quick-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
      imei: `${labelPrefix} #${currentLen + idx + 1}`,
      deviceName: catKey === 'claSy' ? 'CLA / Sy Charges' : (catState[catKey]?.description || 'Service Charge'),
      customerName: selectedDealer?.displayName || 'Dealer Customer',
      vehicleNo: 'Charge',
      actCategory: manualActCategoryInputs[catKey] || 'NIC',
      activationMode: manualActCategoryInputs[catKey] || 'NIC',
      date: new Date().toISOString(),
      isManual: true,
    }));

    setCategoryItems(prev => ({
      ...prev,
      [catKey]: [...newItems, ...prev[catKey]],
    }));

    setSelectedItemsByCat(prev => {
      const nextSet = new Set(prev[catKey]);
      newItems.forEach((it, i) => nextSet.add(getItemKey(it, i)));
      return {
        ...prev,
        [catKey]: nextSet,
      };
    });
  };

  const parseImportedDate = (rawDate) => {
    if (!rawDate) return null;
    const str = String(rawDate).trim();
    const dmy = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (dmy) {
      const dd = dmy[1].padStart(2, '0');
      const mm = dmy[2].padStart(2, '0');
      const yyyy = dmy[3];
      return `${yyyy}-${mm}-${dd}T00:00:00.000Z`;
    }
    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    return str;
  };

  // Bulk Excel Import handler for any category
  const handleExcelImport = (e, catKey) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Parse sheet to array of rows
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false });
        if (!rawRows || rawRows.length === 0) {
          alert('Excel sheet is empty or contains no readable data.');
          return;
        }

        let startIndex = 0;
        let colIndexImei = 0;
        let colIndexDate = -1;
        let colIndexVeh = -1;
        let colIndexActCat = -1;
        let colIndexCust = -1;

        // Check if row 0 contains header names
        const firstRow = rawRows[0].map(c => String(c).trim().toLowerCase());
        const hasHeader = firstRow.some(cell => 
          cell.includes('imei') || cell.includes('serial') || cell.includes('veh') || cell.includes('device') || cell.includes('date') || cell.includes('act')
        );

        if (hasHeader) {
          startIndex = 1;
          firstRow.forEach((header, idx) => {
            if (header.includes('imei') || header.includes('serial') || header.includes('device')) {
              colIndexImei = idx;
            } else if (header.includes('date')) {
              colIndexDate = idx;
            } else if (header.includes('veh') || header.includes('reg') || header.includes('plate') || header.includes('truck') || header.includes('car')) {
              colIndexVeh = idx;
            } else if (header.includes('act.') || header.includes('catigary') || header.includes('act ') || header.includes('mode') || header.includes('type') || (header.includes('category') && !header.includes('plan'))) {
              colIndexActCat = idx;
            } else if (header.includes('cust') || header.includes('client') || header.includes('party') || header.includes('name')) {
              colIndexCust = idx;
            }
          });
        } else {
          // If no header, assume Col 0 = IMEI, Col 1 = Vehicle No (if available), Col 2 = Act. Category
          colIndexImei = 0;
          if (rawRows[0].length >= 2) colIndexVeh = 1;
          if (rawRows[0].length >= 3) colIndexActCat = 2;
        }

        const newItems = [];
        const defaultDevName = catKey === 'claSy' 
          ? 'CLA / Sy Charges' 
          : (catState[catKey]?.description || 'VLTD Device');

        for (let r = startIndex; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!row || row.length === 0) continue;

          let rawImei = String(row[colIndexImei] ?? '').trim();
          if (!rawImei) continue;

          const existingMeta = findExistingImeiMeta(rawImei);
          let rawDateVal = colIndexDate !== -1 ? parseImportedDate(row[colIndexDate]) : null;
          let rawVeh = colIndexVeh !== -1 ? String(row[colIndexVeh] ?? '').trim().toUpperCase() : '';
          let rawActCat = colIndexActCat !== -1 ? String(row[colIndexActCat] ?? '').trim() : '';
          let rawCust = colIndexCust !== -1 ? String(row[colIndexCust] ?? '').trim() : '';

          if (!rawVeh) {
            rawVeh = existingMeta.vehicleNo || (catKey === 'claSy' ? 'Service/System' : 'Manual');
          }
          const finalActCat = normalizeActCategoryLabel(rawActCat || existingMeta.actCategory || manualActCategoryInputs[catKey] || 'NIC');
          if (!rawCust) {
            rawCust = existingMeta.customerName || selectedDealer?.displayName || 'Dealer Customer';
          }

          newItems.push({
            id: `excel-${Date.now()}-${r}-${Math.random().toString(36).substr(2, 5)}`,
            imei: rawImei,
            deviceName: defaultDevName,
            customerName: rawCust,
            vehicleNo: rawVeh,
            actCategory: finalActCat,
            activationMode: finalActCat,
            date: rawDateVal || existingMeta.date || new Date().toISOString(),
            isManual: true,
          });
        }

        if (newItems.length === 0) {
          alert('No valid IMEI records found in the uploaded file.');
          return;
        }

        // Add newly imported items into the category
        setCategoryItems(prev => ({
          ...prev,
          [catKey]: [...newItems, ...prev[catKey]],
        }));

        // Automatically tick/select all imported items
        setSelectedItemsByCat(prev => {
          const nextSet = new Set(prev[catKey]);
          newItems.forEach((it, i) => nextSet.add(getItemKey(it, i)));
          return {
            ...prev,
            [catKey]: nextSet,
          };
        });

        alert(`Successfully imported and selected ${newItems.length} devices from Excel into ${catState[catKey]?.description || catKey}!`);
      } catch (err) {
        console.error('Error parsing Excel file:', err);
        alert('Failed to read Excel file. Please ensure it is a valid .xlsx or .csv format.');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // Helper to download sample Excel template matching the exact Dealer Consolidated Bill format
  const handleDownloadSampleExcel = (catKey) => {
    const planLabel = catKey === 'twoYear'
      ? '2-Year Activation'
      : catKey === 'oneYear'
      ? '1-Year Activation'
      : catKey === 'topup'
      ? 'One Year Top-up Plan'
      : catKey === 'twoYearTopup'
      ? 'Second Year Top-up Plan'
      : catKey === 'claSy'
      ? 'CLA/Sy Charges'
      : 'Renewal';

    const sampleData = [
      {
        '#': 1,
        'Activation Date': '02.10.2026',
        'imei NO': '358250331516664',
        'Category / Plan': planLabel,
        'Vehicle No': 'UP15AC2536',
        'Act. Category': 'NIC',
      },
      {
        '#': 2,
        'Activation Date': '03.10.2026',
        'imei NO': '358250331552632',
        'Category / Plan': planLabel,
        'Vehicle No': 'UP78CJ2631',
        'Act. Category': 'NIC',
      },
      {
        '#': 3,
        'Activation Date': '05.10.2026',
        'imei NO': '358250331002255',
        'Category / Plan': planLabel,
        'Vehicle No': 'UP63AA3321',
        'Act. Category': 'Mining',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sample_Devices');
    XLSX.writeFile(workbook, `Dealer_Bill_Sample_${catKey}.xlsx`);
  };

  // Remove manually added item
  const handleRemoveItem = (catKey, itemKey) => {
    setCategoryItems(prev => ({
      ...prev,
      [catKey]: prev[catKey].filter((it, idx) => getItemKey(it, idx) !== itemKey),
    }));
    setSelectedItemsByCat(prev => {
      const nextSet = new Set(prev[catKey]);
      nextSet.delete(itemKey);
      return {
        ...prev,
        [catKey]: nextSet,
      };
    });
  };

  // Price adjustment handlers
  const handlePriceWithGstChange = (catKey, val) => {
    const pWithGst = toNumber(val);
    const unitPrice = roundCurrency(pWithGst / 1.18);
    setCatState(prev => ({
      ...prev,
      [catKey]: {
        ...prev[catKey],
        priceWithGst: pWithGst,
        unitPrice,
      }
    }));
  };

  const handleUnitPriceChange = (catKey, val) => {
    const unitPrice = toNumber(val);
    const pWithGst = roundCurrency(unitPrice * 1.18);
    setCatState(prev => ({
      ...prev,
      [catKey]: {
        ...prev[catKey],
        unitPrice,
        priceWithGst: pWithGst,
      }
    }));
  };

  const toggleCategoryExpanded = (catKey) => {
    setCatState(prev => ({
      ...prev,
      [catKey]: {
        ...prev[catKey],
        expanded: !prev[catKey].expanded,
      }
    }));
  };

  // Compile active line items and calculate live totals based strictly on SELECTED IMEIs
  const targetState = selectedDealer?.state || 'Bihar';
  const isIntraState = targetState.toLowerCase() === 'bihar';

  const compiledBill = useMemo(() => {
    if (!billableData) return { items: [], totalTaxable: 0, totalCgst: 0, totalSgst: 0, totalIgst: 0, grandTotal: 0, totalUnits: 0 };

    const items = [];

    // Helper to process a category
    const processCategory = (catKey, catName, defaultDesc, validity) => {
      const allItems = categoryItems[catKey] || [];
      const selectedSet = selectedItemsByCat[catKey] || new Set();
      const selectedItems = allItems.filter((it, idx) => selectedSet.has(getItemKey(it, idx)));
      const count = selectedItems.length;

      if (count > 0) {
        let unitPrice = catState[catKey].unitPrice;
        let priceWithGst = catState[catKey].priceWithGst;
        let grossAmt = 0;

        // If topup or claSy has specific individual amounts, sum them exactly
        const individualSum = selectedItems.reduce((sum, it) => sum + (Number(it.billAmount || it.amount) || 0), 0);
        const hasIndividualAmounts = (catKey === 'topup' || catKey === 'twoYearTopup' || catKey === 'claSy') && selectedItems.some(it => Number(it.billAmount || it.amount) > 0);

        if (hasIndividualAmounts) {
          grossAmt = roundCurrency(individualSum);
          priceWithGst = roundCurrency(grossAmt / count);
          unitPrice = roundCurrency(priceWithGst / 1.18);
        } else {
          grossAmt = roundCurrency(count * priceWithGst);
        }

        const taxable = roundCurrency(grossAmt / 1.18);
        const cgstAmt = isIntraState ? roundCurrency((taxable * 9) / 100) : 0;
        const sgstAmt = isIntraState ? roundCurrency((taxable * 9) / 100) : 0;
        const igstAmt = isIntraState ? 0 : roundCurrency((taxable * 18) / 100);

        items.push({
          category: catName,
          description: catState[catKey].description || defaultDesc,
          validity,
          qty: count,
          unitPrice,
          priceWithGst,
          cgst: isIntraState ? 9 : 0,
          sgst: isIntraState ? 9 : 0,
          igst: isIntraState ? 0 : 18,
          grossAmt,
          imeis: selectedItems,
        });
      }
    };

    processCategory('twoYear', '2-Year Activation', 'AIS-140 VLTD - 2 Year Activation Plan', '24 Month');
    processCategory('oneYear', '1-Year Activation', 'AIS-140 VLTD - 1 Year Activation Plan', '12 Month');
    processCategory('topup', 'One Year Top-up Plan', 'AIS-140 VLTD - 1 Year Top-up / Recharge Plan', '12 Month Top-up');
    processCategory('twoYearTopup', 'Second Year Top-up Plan', 'AIS-140 VLTD - 2 Year Top-up / Recharge Plan', '24 Month Top-up');
    processCategory('claSy', 'CLA/Sy Charges', 'CLA / Sy Charges', 'Service/System');
    processCategory('renewal', 'Renewal', 'VLTD Annual Renewal Plan', '12 Month Renewal');

    let totalTaxable = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let grandTotal = 0;
    let totalUnits = 0;

    items.forEach(it => {
      const taxable = roundCurrency(it.unitPrice * it.qty);
      totalTaxable += taxable;
      totalUnits += it.qty;

      if (isIntraState) {
        totalCgst += roundCurrency((taxable * 9) / 100);
        totalSgst += roundCurrency((taxable * 9) / 100);
      } else {
        totalIgst += roundCurrency((taxable * 18) / 100);
      }

      grandTotal += it.grossAmt;
    });

    return {
      items,
      totalTaxable,
      totalCgst,
      totalSgst,
      totalIgst,
      grandTotal,
      totalUnits,
    };
  }, [billableData, catState, categoryItems, selectedItemsByCat, isIntraState]);

  // Handle PDF Preview & Print
  const handlePrintPreview = () => {
    if (!selectedDealer || compiledBill.items.length === 0) {
      alert('Please select at least one item from the categories to preview the bill.');
      return;
    }

    printDealerBill({
      invoice: {
        invoiceNo: invoiceNo || 'DRAFT-INV',
        piNo: piNo || 'AE-PI',
        dateTime: new Date(),
        dealerState: targetState,
        status: 'Pending',
        discount: toNumber(discount) || 0,
      },
      dealer: selectedDealer,
      items: compiledBill.items,
      fromDate,
      toDate,
      discount: toNumber(discount) || 0,
    });
  };

  // Handle Saving Bill to MongoDB
  const handleSaveBill = async () => {
    if (!selectedDealerId) {
      setErrorMessage('Please select a dealer.');
      return;
    }

    if (compiledBill.items.length === 0) {
      setErrorMessage('No items selected to generate bill. Please select at least one IMEI.');
      return;
    }

    try {
      setSavingBill(true);
      setErrorMessage('');
      setSaveSuccess(null);

      // Collect all selected IMEIs
      const allImeis = [];
      compiledBill.items.forEach(it => {
        if (Array.isArray(it.imeis)) {
          it.imeis.forEach(im => {
            const imeiStr = typeof im === 'string' ? im : (im.imei || im.serialNo);
            if (imeiStr && imeiStr !== 'N/A') {
              allImeis.push(imeiStr);
            }
          });
        }
      });

      const payload = {
        dealerId: selectedDealer._id,
        dealerName: selectedDealer.displayName || selectedDealer.companyName || selectedDealer.username,
        dealerAddress: `${selectedDealer.address || ''} ${selectedDealer.city || ''} ${selectedDealer.state || ''} ${selectedDealer.pincode || ''}`.trim(),
        dealerGstNo: selectedDealer.gstNo || '',
        dealerState: targetState,
        customerState: targetState,
        piNo,
        invoiceNo,
        discount: toNumber(discount) || 0,
        items: compiledBill.items,
        notes,
        allImeis,
      };

      const res = await api.post('/invoices/generate-dealer-bill', payload);
      setSaveSuccess(`Consolidated bill ${res.data.invoiceNo} (PI: ${res.data.piNo}) created and saved successfully!`);
      setErrorMessage('');

      fetchNextNumbers();

      if (onBillSaved) {
        try {
          onBillSaved(res.data);
        } catch (cbErr) {
          console.warn('onBillSaved callback error:', cbErr);
        }
      }
    } catch (err) {
      console.error('Failed to save dealer bill:', err);
      setSaveSuccess(null);
      setErrorMessage(err.response?.data?.message || 'Failed to save bill to database.');
    } finally {
      setSavingBill(false);
    }
  };

  // Export Consolidated Bill Annexure to Excel (.xlsx) in exact format
  const handleExportConsolidatedExcel = () => {
    if (!compiledBill || compiledBill.items.length === 0) {
      alert('Please select at least one item to export.');
      return;
    }

    const rows = [];
    let rowIndex = 1;
    compiledBill.items.forEach((catItem) => {
      const catLabel = catItem.category || catItem.description || '';
      if (Array.isArray(catItem.imeis)) {
        catItem.imeis.forEach((im) => {
          const imeiStr = typeof im === 'string' ? im : (im.imei || im.serialNo || 'N/A');
          const shared = findExistingImeiMeta(imeiStr) || {};
          const rawVeh = typeof im === 'object' ? (im.vehicleNo || im.vehicleNumber || shared.vehicleNo || '') : (shared.vehicleNo || '');
          const cleanVeh = (!rawVeh || rawVeh === 'Manual' || rawVeh === 'Service/System' || rawVeh === 'Charge') ? '-' : rawVeh;
          const rawAct = typeof im === 'object' ? (im.actCategory || im.activationMode || shared.actCategory || 'NIC') : (shared.actCategory || 'NIC');
          const rawDate = typeof im === 'object' ? (im.date || shared.date || new Date()) : (shared.date || new Date());

          rows.push({
            '#': rowIndex++,
            'Activation Date': formatDotDate(rawDate),
            'imei NO': imeiStr,
            'Category / Plan': catLabel,
            'Vehicle No': cleanVeh,
            'Act. Category': normalizeActCategoryLabel(rawAct),
          });
        });
      }
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 6 },
      { wch: 16 },
      { wch: 22 },
      { wch: 24 },
      { wch: 18 },
      { wch: 15 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Consolidated Bill');
    const dealerLabel = (selectedDealer?.displayName || selectedDealer?.companyName || 'Dealer').replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.writeFile(wb, `Consolidated_Bill_${dealerLabel}_${invoiceNo || piNo || 'Draft'}.xlsx`);
  };

  // Render individual category block with search, selection, and manual adder
  const renderCategoryBlock = (catKey, catTitle, badgeClass) => {
    const allItems = categoryItems[catKey] || [];
    const selectedSet = selectedItemsByCat[catKey] || new Set();
    const searchTerm = (searchTermByCat[catKey] || '').toLowerCase().trim();

    const categoryLabelByKey = {
      twoYear: '2-Year Activation',
      oneYear: '1-Year Activation',
      topup: 'One Year Top-up Plan',
      twoYearTopup: 'Second Year Top-up Plan',
      claSy: 'CLA/Sy Charges',
      renewal: 'Renewal',
    };
    const rowCatLabel = categoryLabelByKey[catKey] || catTitle;

    // Filter items according to search input
    const filteredItems = allItems.filter(it => {
      if (!searchTerm) return true;
      const imei = String(it.imei || '').toLowerCase();
      const dev = String(it.deviceName || '').toLowerCase();
      const cust = String(it.customerName || '').toLowerCase();
      const veh = String(it.vehicleNo || '').toLowerCase();
      const actCat = String(it.actCategory || it.activationMode || '').toLowerCase();
      const iccid = String(it.iccid || '').toLowerCase();
      return imei.includes(searchTerm) || dev.includes(searchTerm) || cust.includes(searchTerm) || veh.includes(searchTerm) || actCat.includes(searchTerm) || iccid.includes(searchTerm);
    });

    const selectedCount = selectedSet.size;
    const selectedItems = allItems.filter((it, idx) => selectedSet.has(getItemKey(it, idx)));
    const individualSum = selectedItems.reduce((sum, it) => sum + (Number(it.billAmount || it.amount) || 0), 0);
    const hasIndividualAmounts = (catKey === 'topup' || catKey === 'twoYearTopup' || catKey === 'claSy') && selectedItems.some(it => Number(it.billAmount || it.amount) > 0);

    const categoryGross = hasIndividualAmounts
      ? roundCurrency(individualSum)
      : roundCurrency(selectedCount * catState[catKey].priceWithGst);

    return (
      <div className={`category-card ${selectedCount > 0 ? 'active' : ''}`} key={catKey}>
        <div className="category-card-header" onClick={() => toggleCategoryExpanded(catKey)}>
          <div className="category-header-left">
            <span className={`cat-badge ${badgeClass}`}>{catTitle}</span>
            <span className="selected-count-badge">
              Selected: <strong>{selectedCount}</strong> / {allItems.length} Units
            </span>
          </div>
          <div className="category-header-right">
            <span style={{ fontSize: '13px', color: '#0f766e', fontWeight: 'bold' }}>
              ₹{formatCurrency(categoryGross)} (Gross)
            </span>
            {catState[catKey].expanded ? <FaChevronUp /> : <FaChevronDown />}
          </div>
        </div>

        {catState[catKey].expanded && (
          <div className="category-card-body">
            {/* Price Controls */}
            <div className="cat-price-controls">
              <div className="price-inputs-left">
                <div className="price-input-group">
                  <label>Rate Incl. GST (₹):</label>
                  <input 
                    type="number" 
                    value={catState[catKey].priceWithGst} 
                    onChange={(e) => handlePriceWithGstChange(catKey, e.target.value)} 
                  />
                </div>
                <div className="price-input-group">
                  <label>Base Excl. GST (₹):</label>
                  <input 
                    type="number" 
                    value={catState[catKey].unitPrice} 
                    onChange={(e) => handleUnitPriceChange(catKey, e.target.value)} 
                  />
                </div>
              </div>
            </div>

            {/* Search Toolbar */}
            <div className="cat-toolbar">
              <div className="cat-search-group">
                <FaSearch className="cat-search-icon" />
                <input 
                  type="text" 
                  className="cat-search-input"
                  placeholder={`Search ${catTitle} by IMEI, Vehicle No, NIC/Mining...`}
                  value={searchTermByCat[catKey] || ''}
                  onChange={(e) => setSearchTermByCat(prev => ({ ...prev, [catKey]: e.target.value }))}
                />
              </div>
            </div>

            {/* Table of IMEIs matching Consolidated Bill Format */}
            {filteredItems.length > 0 ? (
              <div className="imei-table-wrapper">
                <table className="imei-table annexure-style-table">
                  <thead>
                    <tr>
                      <th style={{ width: '46px', textAlign: 'center' }}>Tick</th>
                      <th style={{ width: '46px', textAlign: 'center' }}>#</th>
                      <th style={{ minWidth: '115px' }}>Activation Date</th>
                      <th style={{ minWidth: '150px' }}>imei NO</th>
                      <th style={{ minWidth: '155px' }}>Category / Plan</th>
                      <th style={{ minWidth: '110px' }}>Device Amount</th>
                      <th style={{ minWidth: '140px' }}>Vehicle No</th>
                      <th style={{ minWidth: '110px' }}>Act. Category</th>
                      <th style={{ width: '40px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((it, idx) => {
                      const itemKey = getItemKey(it, idx);
                      const isSelected = selectedSet.has(itemKey);
                      const cleanVehValue = (it.vehicleNo === 'Manual' || it.vehicleNo === 'Service/System' || it.vehicleNo === 'Charge')
                        ? ''
                        : (it.vehicleNo || '');
                      const actCatValue = normalizeActCategoryLabel(it.actCategory || it.activationMode || 'NIC');

                      return (
                        <tr 
                          key={itemKey} 
                          className={isSelected ? 'selected-row' : ''}
                          onClick={() => toggleItemSelection(catKey, itemKey)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                            <input 
                              type="checkbox" 
                              className="row-checkbox"
                              checked={isSelected}
                              onChange={() => toggleItemSelection(catKey, itemKey)}
                            />
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: '600' }}>{idx + 1}</td>
                          <td style={{ fontWeight: '500', color: '#0f172a' }}>
                            {it.date ? formatDotDate(it.date) : '-'}
                          </td>
                          <td style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#0f172a', fontSize: '12.5px' }}>
                            {it.imei || 'N/A'}
                          </td>
                          <td>
                            <span className="table-cat-pill">{rowCatLabel}</span>
                          </td>
                          <td>
                            {Number(it.billAmount || it.amount) > 0 ? (
                              <strong style={{ color: '#0f766e', fontSize: '13px' }}>
                                ₹{formatCurrency(it.billAmount || it.amount)}
                              </strong>
                            ) : (
                              <span style={{ color: '#64748b' }}>₹{formatCurrency(catState[catKey].priceWithGst)}</span>
                            )}
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={cleanVehValue}
                              onChange={(e) => handleUpdateItemVehicle(catKey, itemKey, e.target.value)}
                              placeholder="-"
                              style={{
                                padding: '3px 7px',
                                fontSize: '12px',
                                fontWeight: '600',
                                color: '#0f172a',
                                background: '#ffffff',
                                border: '1px solid #cbd5e1',
                                borderRadius: '4px',
                                width: '125px',
                                textTransform: 'uppercase',
                                outline: 'none',
                              }}
                              title="Vehicle Number (Editable)"
                            />
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <select
                              value={actCatValue}
                              onChange={(e) => handleUpdateItemActCategory(catKey, itemKey, e.target.value)}
                              style={{
                                padding: '3px 6px',
                                fontSize: '12px',
                                fontWeight: '600',
                                color: '#0f172a',
                                background: '#ffffff',
                                border: '1px solid #cbd5e1',
                                borderRadius: '4px',
                                outline: 'none',
                                cursor: 'pointer',
                              }}
                              title="Activation Category (NIC / Mining)"
                            >
                              <option value="NIC">NIC</option>
                              <option value="Mining">Mining</option>
                            </select>
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            {it.isManual && (
                              <button 
                                type="button" 
                                className="btn-remove-row"
                                onClick={() => handleRemoveItem(catKey, itemKey)}
                                title="Remove item"
                              >
                                <FaTrash />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '13px', padding: '12px 0' }}>
                {allItems.length === 0 ? `No ${catTitle} records found for this dealer.` : 'No matching items found for search query.'}
              </div>
            )}

            {/* Manual IMEI / Item Adder with Vehicle No & Act. Category */}
            <div className="cat-manual-add-row">
              <input 
                type="text" 
                className="cat-manual-input"
                placeholder={catKey === 'claSy' 
                  ? "Type or paste IMEI / Ref / Note for CLA/Sy..." 
                  : `Type or paste additional IMEI to add in ${catTitle}...`}
                value={manualInputs[catKey] || ''}
                onChange={(e) => setManualInputs(prev => ({ ...prev, [catKey]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddManualImei(catKey);
                  }
                }}
              />
              <input 
                type="text" 
                className="cat-manual-input-veh"
                placeholder="Vehicle No (e.g. UP15AC2536)"
                value={manualVehicleInputs[catKey] || ''}
                onChange={(e) => setManualVehicleInputs(prev => ({ ...prev, [catKey]: e.target.value.toUpperCase() }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddManualImei(catKey);
                  }
                }}
              />
              <select
                value={manualActCategoryInputs[catKey] || 'NIC'}
                onChange={(e) => setManualActCategoryInputs(prev => ({ ...prev, [catKey]: e.target.value }))}
                style={{
                  padding: '6px 10px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#0f172a',
                  background: '#ffffff',
                }}
                title="Activation Category (NIC / Mining)"
              >
                <option value="NIC">NIC</option>
                <option value="Mining">Mining</option>
              </select>
              <button 
                type="button" 
                className="btn-add-manual-imei"
                onClick={() => handleAddManualImei(catKey)}
              >
                <FaPlus /> {catKey === 'claSy' ? 'Add Item' : 'Add IMEI'}
              </button>

              {/* Bulk Excel Sheet Upload Button */}
              <label 
                className="btn-import-excel" 
                title={`Upload Excel (.xlsx/.csv) to add 50-500+ IMEIs into ${catTitle}`}
              >
                <FaFileExcel /> Import Excel
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .csv" 
                  style={{ display: 'none' }} 
                  onChange={(e) => handleExcelImport(e, catKey)}
                />
              </label>

              {/* Sample Excel Template */}
              <button
                type="button"
                className="btn-sample-excel"
                onClick={() => handleDownloadSampleExcel(catKey)}
                title="Download Sample Excel Sheet format"
              >
                <FaDownload /> Sample Excel
              </button>

              {catKey === 'claSy' && (
                <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
                  <button
                    type="button"
                    className="btn-quick-unit"
                    onClick={() => handleQuickAddUnits('claSy', 1)}
                    title="Add 1 CLA/Sy Charge unit"
                  >
                    + 1 Unit
                  </button>
                  <button
                    type="button"
                    className="btn-quick-unit"
                    onClick={() => handleQuickAddUnits('claSy', 5)}
                    title="Add 5 CLA/Sy Charge units"
                  >
                    + 5 Units
                  </button>
                  <button
                    type="button"
                    className="btn-quick-unit"
                    onClick={() => handleQuickAddUnits('claSy', 10)}
                    title="Add 10 CLA/Sy Charge units"
                  >
                    + 10 Units
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="dealer-bill-container">
      {/* Header */}
      <div className="dealer-bill-header">
        <div className="dealer-bill-title">
          <FaFileInvoiceDollar style={{ fontSize: '28px', color: '#0f766e' }} />
          <div>
            <h2>Dealer Consolidated Bill Generator</h2>
            <p>Select dealer, search & filter IMEIs, choose individual devices, and generate unified GST invoices</p>
          </div>
        </div>
      </div>

      {/* Selector & Filters */}
      <div className="dealer-selector-grid">
        <div className="dealer-form-group">
          <label><FaUserTie style={{ marginRight: '6px' }} /> Select Dealer / Sub-Dealer *</label>
          <select value={selectedDealerId} onChange={handleDealerChange}>
            <option value="">-- Choose Dealer --</option>
            {dealers.map(d => (
              <option key={d._id} value={d._id}>
                {d.displayName || d.companyName || d.username} ({d.userType || 'Dealer'}) - {d.mobileNo || 'No Mobile'}
              </option>
            ))}
          </select>
        </div>

        <div className="dealer-form-group">
          <label><FaCalendarAlt style={{ marginRight: '6px' }} /> From Date</label>
          <input 
            type="date" 
            value={fromDate} 
            onChange={(e) => setFromDate(e.target.value)} 
          />
        </div>

        <div className="dealer-form-group">
          <label><FaCalendarAlt style={{ marginRight: '6px' }} /> To Date</label>
          <input 
            type="date" 
            value={toDate} 
            onChange={(e) => setToDate(e.target.value)} 
          />
        </div>

        <div>
          <button 
            type="button" 
            className="btn-fetch-billables"
            onClick={() => fetchDealerBillableItems()}
            disabled={!selectedDealerId || loadingBillables}
          >
            {loadingBillables ? <><FaSpinner className="fa-spin" /> Loading...</> : 'Fetch Billables'}
          </button>
        </div>
      </div>

      {/* Error / Success Notifications */}
      {errorMessage && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FaExclamationTriangle /> {errorMessage}
        </div>
      )}

      {saveSuccess && (
        <div style={{ background: '#dcfce7', color: '#15803d', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FaCheckCircle /> {saveSuccess}
        </div>
      )}

      {/* Dealer Card */}
      {selectedDealer && (
        <div className="dealer-info-card">
          <div className="dealer-info-item">
            <span className="label">Dealer Name</span>
            <span className="value">{selectedDealer.displayName || selectedDealer.companyName || selectedDealer.username}</span>
          </div>
          <div className="dealer-info-item">
            <span className="label">Contact & Email</span>
            <span className="value">{selectedDealer.mobileNo || 'N/A'} {selectedDealer.email ? `• ${selectedDealer.email}` : ''}</span>
          </div>
          <div className="dealer-info-item">
            <span className="label">State & Tax Details</span>
            <span className="value">
              <strong style={{ color: '#0f766e' }}>{selectedDealer.state || 'Bihar'}</strong> 
              {selectedDealer.gstNo ? ` • GSTIN: ${selectedDealer.gstNo}` : ' • GST: Unregistered'}
              {selectedDealer.panNo ? ` • PAN: ${selectedDealer.panNo}` : ''}
              {selectedDealer.address ? ` • ${selectedDealer.address}` : ''}
            </span>
          </div>
          <div className="dealer-info-item">
            <span className="label">Current Balance / Dues</span>
            <span className="value" style={{ color: selectedDealer.overDrawnAmount > 0 ? '#e11d48' : '#0f766e' }}>
              ₹{formatCurrency(selectedDealer.availableBalance || 0)} (Overdrawn: ₹{formatCurrency(selectedDealer.overDrawnAmount || 0)})
            </span>
          </div>
        </div>
      )}

      {/* 6 Categorized Sections with Full Search & Multi-Selection */}
      {billableData && (
        <div className="categories-container">
          {renderCategoryBlock('twoYear', '2-Year Activations', 'cat-badge-2yr')}
          {renderCategoryBlock('oneYear', '1-Year Activations', 'cat-badge-1yr')}
          {renderCategoryBlock('topup', 'One Year Top-up Plans', 'cat-badge-topup')}
          {renderCategoryBlock('twoYearTopup', 'Second Year Top-up Plans', 'cat-badge-2yr-topup')}
          {renderCategoryBlock('claSy', 'CLA/Sy Charges', 'cat-badge-clasy')}
          {renderCategoryBlock('renewal', 'Renewal Plans', 'cat-badge-renewal')}
        </div>
      )}

      {/* Bill Calculation & Metadata Summary */}
      {selectedDealer && (
        <div className="bill-summary-panel">
          <div className="summary-meta-inputs">
            <h3 style={{ margin: 0, fontSize: '16px', color: '#38bdf8' }}>Invoice Reference Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>PI Number:</label>
                <input 
                  type="text" 
                  value={piNo} 
                  onChange={(e) => setPiNo(e.target.value)} 
                  placeholder="AE-01" 
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>Invoice Number:</label>
                <input 
                  type="text" 
                  value={invoiceNo} 
                  onChange={(e) => setInvoiceNo(e.target.value)} 
                  placeholder="INV-01" 
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#94a3b8' }}>Notes / Remarks:</label>
              <textarea 
                rows="2" 
                value={notes} 
                onChange={(e) => setNotes(e.target.value)} 
                placeholder="Optional notes to appear on invoice..."
              />
            </div>
          </div>

          <div className="summary-calc-box">
            <div>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#38bdf8' }}>Consolidated Bill Calculation</h3>
              <div className="calc-row">
                <span>Selected Items / Units:</span>
                <strong style={{ color: '#38bdf8' }}>{compiledBill.totalUnits} Units Selected</strong>
              </div>
              <div className="calc-row">
                <span>Taxable Value (Base):</span>
                <span>₹{formatCurrency(compiledBill.totalTaxable)}</span>
              </div>
              {isIntraState ? (
                <>
                  <div className="calc-row">
                    <span>CGST (9%):</span>
                    <span>₹{formatCurrency(compiledBill.totalCgst)}</span>
                  </div>
                  <div className="calc-row">
                    <span>SGST (9%):</span>
                    <span>₹{formatCurrency(compiledBill.totalSgst)}</span>
                  </div>
                </>
              ) : (
                <div className="calc-row">
                  <span>IGST (18%):</span>
                  <span>₹{formatCurrency(compiledBill.totalIgst)}</span>
                </div>
              )}
              <div className="calc-row" style={{ borderTop: '1px dashed #475569', marginTop: '6px', paddingTop: '6px' }}>
                <span>Gross Total (Incl. GST):</span>
                <strong>₹{formatCurrency(compiledBill.grandTotal)}</strong>
              </div>
              <div className="calc-row" style={{ alignItems: 'center', background: 'rgba(245, 158, 11, 0.1)', padding: '6px 8px', borderRadius: '4px', margin: '6px 0' }}>
                <span style={{ fontWeight: 600, color: '#f59e0b' }}>Discount (₹):</span>
                <input 
                  type="number"
                  min="0"
                  max={compiledBill.grandTotal}
                  value={discount === 0 ? '' : discount}
                  onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="0"
                  style={{
                    width: '120px',
                    textAlign: 'right',
                    padding: '5px 8px',
                    borderRadius: '4px',
                    border: '1px solid #f59e0b',
                    background: '#0f172a',
                    color: '#fbbf24',
                    fontWeight: 700,
                    fontSize: '13px'
                  }}
                />
              </div>
              {toNumber(discount) > 0 && (
                <div className="calc-row" style={{ color: '#ef4444', fontWeight: 600 }}>
                  <span>Discount Applied:</span>
                  <span>- ₹{formatCurrency(discount)}</span>
                </div>
              )}
              <div className="calc-row grand-total" style={{ background: '#0f766e', color: '#fff', borderRadius: '4px', padding: '8px 10px', marginTop: '6px' }}>
                <span>Net Payable / Grand Total:</span>
                <span>₹{formatCurrency(Math.max(0, roundCurrency(compiledBill.grandTotal - (toNumber(discount) || 0))))}</span>
              </div>
              <div className="amount-in-words">
                In words: {numberToWords(Math.max(0, roundCurrency(compiledBill.grandTotal - (toNumber(discount) || 0))))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Bar */}
      {selectedDealer && (
        <div className="bill-action-bar">
          <button 
            type="button" 
            className="btn-bill-preview"
            onClick={handlePrintPreview}
            disabled={compiledBill.items.length === 0}
          >
            <FaPrint /> Preview & Print Bill ({compiledBill.totalUnits} Units)
          </button>

          <button 
            type="button" 
            className="btn-bill-save"
            onClick={handleSaveBill}
            disabled={savingBill || compiledBill.items.length === 0}
          >
            {savingBill ? <><FaSpinner className="fa-spin" /> Saving...</> : <><FaSave /> Save Bill ({compiledBill.totalUnits} Units)</>}
          </button>
        </div>
      )}
    </div>
  );
};

export default DealerBillGenerator;
