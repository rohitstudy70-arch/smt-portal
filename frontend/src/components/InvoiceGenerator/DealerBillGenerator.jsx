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
  FaTrash
} from 'react-icons/fa';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { 
  renderDealerBillHtml, 
  printDealerBill, 
  toNumber, 
  roundCurrency, 
  formatCurrency, 
  numberToWords 
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
      description: 'VLTD Top-up / Data Recharge Plan',
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
    renewal: new Set(),
  });

  // Category items list including any manually added IMEIs
  const [categoryItems, setCategoryItems] = useState({
    twoYear: [],
    oneYear: [],
    topup: [],
    renewal: [],
  });

  // Search filter terms per category
  const [searchTermByCat, setSearchTermByCat] = useState({
    twoYear: '',
    oneYear: '',
    topup: '',
    renewal: '',
  });

  // Manual IMEI input per category
  const [manualInputs, setManualInputs] = useState({
    twoYear: '',
    oneYear: '',
    topup: '',
    renewal: '',
  });

  // Invoice Meta
  const [piNo, setPiNo] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
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
      const renList = data.categories?.renewalPlans?.items || [];

      setCategoryItems({
        twoYear: twoYrList,
        oneYear: oneYrList,
        topup: topList,
        renewal: renList,
      });

      // Start with empty selection so user can single-tick select desired items
      setSelectedItemsByCat({
        twoYear: new Set(),
        oneYear: new Set(),
        topup: new Set(),
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
      setCategoryItems({ twoYear: [], oneYear: [], topup: [], renewal: [] });
      setSelectedItemsByCat({ twoYear: new Set(), oneYear: new Set(), topup: new Set(), renewal: new Set() });
    }
  };

  // Toggle single item selection
  const toggleItemSelection = (catKey, itemKey) => {
    setSelectedItemsByCat(prev => {
      const nextSet = new Set(prev[catKey]);
      if (nextSet.has(itemKey)) {
        nextSet.delete(itemKey);
      } else {
        nextSet.add(itemKey);
      }
      return {
        ...prev,
        [catKey]: nextSet,
      };
    });
  };

  // Add manual IMEI to a category
  const handleAddManualImei = (catKey) => {
    const rawVal = String(manualInputs[catKey] || '').trim();
    if (!rawVal) return;

    const newItem = {
      id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      imei: rawVal,
      deviceName: 'Manual Added Device',
      customerName: selectedDealer?.displayName || 'Dealer Customer',
      vehicleNo: 'Manual',
      date: new Date().toISOString(),
      isManual: true,
    };

    const itemKey = getItemKey(newItem, 0);

    setCategoryItems(prev => ({
      ...prev,
      [catKey]: [newItem, ...prev[catKey]],
    }));

    setSelectedItemsByCat(prev => {
      const nextSet = new Set(prev[catKey]);
      nextSet.add(itemKey);
      return {
        ...prev,
        [catKey]: nextSet,
      };
    });

    setManualInputs(prev => ({
      ...prev,
      [catKey]: '',
    }));
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
        const unitPrice = catState[catKey].unitPrice;
        const taxable = roundCurrency(unitPrice * count);
        const cgstAmt = isIntraState ? roundCurrency((taxable * 9) / 100) : 0;
        const sgstAmt = isIntraState ? roundCurrency((taxable * 9) / 100) : 0;
        const igstAmt = isIntraState ? 0 : roundCurrency((taxable * 18) / 100);
        const grossAmt = roundCurrency(taxable + cgstAmt + sgstAmt + igstAmt);

        items.push({
          category: catName,
          description: catState[catKey].description || defaultDesc,
          validity,
          qty: count,
          unitPrice,
          priceWithGst: catState[catKey].priceWithGst,
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
    processCategory('topup', 'Top-up / Recharge', 'VLTD Top-up / Data Recharge Plan', 'Recharge');
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
      },
      dealer: selectedDealer,
      items: compiledBill.items,
      fromDate,
      toDate,
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
        items: compiledBill.items,
        notes,
        allImeis,
      };

      const res = await api.post('/invoices/generate-dealer-bill', payload);
      setSaveSuccess(`Consolidated bill ${res.data.invoiceNo} (PI: ${res.data.piNo}) created and saved successfully!`);

      fetchNextNumbers();

      if (onBillSaved) {
        onBillSaved(res.data);
      }
    } catch (err) {
      console.error('Failed to save dealer bill:', err);
      setErrorMessage(err.response?.data?.message || 'Failed to save bill to database.');
    } finally {
      setSavingBill(false);
    }
  };

  // Render individual category block with search, selection, and manual adder
  const renderCategoryBlock = (catKey, catTitle, badgeClass) => {
    const allItems = categoryItems[catKey] || [];
    const selectedSet = selectedItemsByCat[catKey] || new Set();
    const searchTerm = (searchTermByCat[catKey] || '').toLowerCase().trim();

    // Filter items according to search input
    const filteredItems = allItems.filter(it => {
      if (!searchTerm) return true;
      const imei = String(it.imei || '').toLowerCase();
      const dev = String(it.deviceName || '').toLowerCase();
      const cust = String(it.customerName || '').toLowerCase();
      const veh = String(it.vehicleNo || '').toLowerCase();
      const iccid = String(it.iccid || '').toLowerCase();
      return imei.includes(searchTerm) || dev.includes(searchTerm) || cust.includes(searchTerm) || veh.includes(searchTerm) || iccid.includes(searchTerm);
    });

    const selectedCount = selectedSet.size;
    const categoryGross = roundCurrency(selectedCount * catState[catKey].priceWithGst);

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
                  placeholder={`Search ${catTitle} by IMEI, Vehicle No, Customer...`}
                  value={searchTermByCat[catKey] || ''}
                  onChange={(e) => setSearchTermByCat(prev => ({ ...prev, [catKey]: e.target.value }))}
                />
              </div>
            </div>

            {/* Table of IMEIs */}
            {filteredItems.length > 0 ? (
              <div className="imei-table-wrapper">
                <table className="imei-table">
                  <thead>
                    <tr>
                      <th style={{ width: '50px', textAlign: 'center' }}>Tick</th>
                      <th style={{ width: '50px' }}>#</th>
                      <th>IMEI Number</th>
                      <th>Device / Details</th>
                      <th>Customer / Vehicle</th>
                      <th>Date</th>
                      <th style={{ width: '40px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((it, idx) => {
                      const itemKey = getItemKey(it, idx);
                      const isSelected = selectedSet.has(itemKey);

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
                          <td>{idx + 1}</td>
                          <td style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#0f172a' }}>
                            {it.imei || 'N/A'}
                          </td>
                          <td>{it.deviceName || it.plan || it.validity || 'VLTD Device'}</td>
                          <td>
                            {it.customerName ? <strong>{it.customerName}</strong> : ''}
                            {it.vehicleNo ? ` (${it.vehicleNo})` : ''}
                            {!it.customerName && !it.vehicleNo ? '-' : ''}
                          </td>
                          <td>{it.date ? new Date(it.date).toLocaleDateString('en-GB') : '-'}</td>
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

            {/* Manual IMEI Adder */}
            <div className="cat-manual-add-row">
              <input 
                type="text" 
                className="cat-manual-input"
                placeholder={`Type or paste additional IMEI to add in ${catTitle}...`}
                value={manualInputs[catKey] || ''}
                onChange={(e) => setManualInputs(prev => ({ ...prev, [catKey]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddManualImei(catKey);
                  }
                }}
              />
              <button 
                type="button" 
                className="btn-add-manual-imei"
                onClick={() => handleAddManualImei(catKey)}
              >
                <FaPlus /> Add IMEI
              </button>
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

      {/* 4 Categorized Sections with Full Search & Multi-Selection */}
      {billableData && (
        <div className="categories-container">
          {renderCategoryBlock('twoYear', '2-Year Activations', 'cat-badge-2yr')}
          {renderCategoryBlock('oneYear', '1-Year Activations', 'cat-badge-1yr')}
          {renderCategoryBlock('topup', 'Top-up / Recharge Plans', 'cat-badge-topup')}
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
              <div className="calc-row grand-total">
                <span>Grand Total:</span>
                <span>₹{formatCurrency(compiledBill.grandTotal)}</span>
              </div>
              <div className="amount-in-words">
                In words: {numberToWords(compiledBill.grandTotal)}
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
