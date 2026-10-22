import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FaBoxes,
  FaPlusCircle,
  FaExchangeAlt,
  FaSearch,
  FaUserTie,
  FaMobileAlt,
  FaCheckCircle,
  FaExclamationTriangle,
  FaSpinner,
  FaTimesCircle,
  FaCheckSquare,
  FaSquare,
  FaListAlt,
  FaBuilding,
} from 'react-icons/fa';
import api from '../../utils/api';
import './StockInventory.css';

const DEVICE_MODELS = [
  'iTriangle',
  'Acute',
  'Markon',
  'RDM',
  'BB',
  'TrackNow',
  'Road point',
];

const StockInventory = ({ initialTab = 'add' }) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Determine active tab from URL path or prop
  const currentTab = useMemo(() => {
    if (location.pathname.endsWith('/move')) return 'move';
    if (location.pathname.endsWith('/add')) return 'add';
    if (location.pathname.endsWith('/overview')) return 'overview';
    return initialTab || 'add';
  }, [location.pathname, initialTab]);

  const [activeTab, setActiveTab] = useState(currentTab);

  useEffect(() => {
    setActiveTab(currentTab);
  }, [currentTab]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'add') navigate('/stock-inventory/add');
    else if (tab === 'move') navigate('/stock-inventory/move');
    else navigate('/stock-inventory/overview');
  };

  // Shared Data
  const [dealers, setDealers] = useState([]);
  const [loadingDealers, setLoadingDealers] = useState(false);
  const [toast, setToast] = useState({ show: false, type: '', message: '' });

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast({ show: false, type: '', message: '' }), 5000);
  };

  // Load dealers list reliably
  // Load users / dealers list reliably (matching User Management)
  const fetchDealers = useCallback(async () => {
    try {
      setLoadingDealers(true);
      let list = [];
      try {
        const res = await api.get('/users/sub-users');
        const raw = Array.isArray(res.data) ? res.data : (res.data?.dealers || res.data?.users || []);
        list = raw.filter(u => {
          const type = String(u.userType || '').toLowerCase();
          const role = String(u.role || '').toLowerCase();
          const uname = String(u.username || '').toLowerCase();
          return type !== 'administration' && role !== 'partner' && uname !== 'admin' && uname !== 'arshienterprises';
        });
      } catch (e) {
        console.warn('Fallback to /stock/dealers');
      }

      if (list.length === 0) {
        try {
          const res2 = await api.get('/stock/dealers');
          list = Array.isArray(res2.data) ? res2.data : [];
        } catch (e2) {
          console.error(e2);
        }
      }
      setDealers(list);
    } catch (err) {
      console.error('Failed to load users:', err);
      showToast('error', 'Failed to load users list.');
    } finally {
      setLoadingDealers(false);
    }
  }, []);

  useEffect(() => {
    fetchDealers();
  }, [fetchDealers]);

  // ==========================================
  // 1. ADD STOCK STATE & HANDLERS
  // ==========================================
  const [addForm, setAddForm] = useState({
    dealerId: 'admin',
    vendor: '',
    notes: '',
  });
  const [addImeisText, setAddImeisText] = useState('');
  const [addingStock, setAddingStock] = useState(false);
  const [addResult, setAddResult] = useState(null);

  // Parse IMEIs live for counter
  const detectedAddImeis = useMemo(() => {
    if (!addImeisText.trim()) return [];
    const lines = addImeisText.split(/[\r\n,;\s\t]+/);
    const cleaned = lines.map(s => s.trim().replace(/[^0-9]/g, '')).filter(s => s.length >= 10);
    return [...new Set(cleaned)];
  }, [addImeisText]);

  // Add Stock Page Mode: 'add' | 'move'
  const [addPageMode, setAddPageMode] = useState('add');

  // Direct move handler with ONLY Target User and IMEIs
  const handleDirectMoveSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setAddResult(null);

    if (!addForm.dealerId) {
      showToast('error', 'Please select a Target User.');
      return;
    }
    if (detectedAddImeis.length === 0) {
      showToast('error', 'Please enter at least one valid IMEI number to move.');
      return;
    }

    try {
      setAddingStock(true);
      const res = await api.post('/stock/move', {
        toDealerId: addForm.dealerId,
        imeisText: addImeisText,
        notes: addForm.notes || 'Moved directly to Target User via Stock Inventory',
      });

      const selectedUser = dealers.find(d => d._id === addForm.dealerId);
      const targetName = selectedUser ? (selectedUser.displayName || selectedUser.companyName || selectedUser.username) : (res.data?.toDealerName || 'Target User');

      setAddResult({
        ...res.data,
        isMoveAction: true,
        addedCount: res.data.movedCount || 0,
        dealerName: targetName,
        vendor: 'All Transferred Devices',
        message: res.data.message || `Successfully transferred ${res.data.movedCount} devices to ${targetName}!`,
      });
      showToast('success', res.data.message || `Successfully transferred ${res.data.movedCount} devices to ${targetName}!`);

      // Sync with Move Stock tab
      setMoveForm(prev => ({ ...prev, fromDealerId: addForm.dealerId }));
      fetchDealerStockDevices(addForm.dealerId, 'all', '');

      setAddImeisText('');
      setAddForm(prev => ({ ...prev, notes: '' }));
    } catch (err) {
      console.error('Error moving stock directly:', err);
      const msg = err.response?.data?.message || 'Failed to move stock devices.';
      showToast('error', msg);
    } finally {
      setAddingStock(false);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setAddResult(null);

    const targetUserId = addForm.dealerId || 'admin';

    if (!addForm.vendor) {
      showToast('error', 'Please select a Model Name.');
      return;
    }
    if (detectedAddImeis.length === 0) {
      showToast('error', 'Please enter at least one valid IMEI number.');
      return;
    }

    try {
      setAddingStock(true);
      const res = await api.post('/stock/add', {
        dealerId: targetUserId,
        vendor: addForm.vendor,
        notes: addForm.notes,
        imeisText: addImeisText,
      });

      setAddResult({ ...res.data, dealerId: targetUserId });
      showToast('success', res.data.message || 'Stock added successfully!');

      // Sync with Move Stock: immediately assign this target user as source dealer and load their stock
      setMoveForm(prev => ({ ...prev, fromDealerId: targetUserId }));
      fetchDealerStockDevices(targetUserId, 'all', '');

      setAddImeisText('');
      setAddForm(prev => ({ ...prev, notes: '' }));
    } catch (err) {
      console.error('Error adding stock:', err);
      const msg = err.response?.data?.message || 'Failed to add stock devices.';
      showToast('error', msg);
    } finally {
      setAddingStock(false);
    }
  };

  // ==========================================
  // 2. MOVE STOCK STATE & HANDLERS
  // ==========================================
  const [moveForm, setMoveForm] = useState({
    fromDealerId: 'admin',
    toDealerId: '',
    modelFilter: 'all',
    notes: '',
  });
  const [moveMode, setMoveMode] = useState('list'); // 'list' | 'paste'
  const [moveImeisText, setMoveImeisText] = useState('');
  const [dealerDevices, setDealerDevices] = useState([]);
  const [loadingDealerDevices, setLoadingDealerDevices] = useState(false);
  const [deviceSearch, setDeviceSearch] = useState('');
  const [selectedImeis, setSelectedImeis] = useState(new Set());
  const [movingStock, setMovingStock] = useState(false);
  const [moveResult, setMoveResult] = useState(null);

  // Fetch devices when From Dealer changes
  const fetchDealerStockDevices = useCallback(async (dealerId, vendor = 'all', search = '') => {
    if (!dealerId) {
      setDealerDevices([]);
      setSelectedImeis(new Set());
      return;
    }
    try {
      setLoadingDealerDevices(true);
      const res = await api.get(`/stock/dealer-devices/${dealerId}`, {
        params: { vendor, search }
      });
      setDealerDevices(res.data || []);
      setSelectedImeis(new Set());
    } catch (err) {
      console.error('Error loading dealer stock devices:', err);
      showToast('error', 'Failed to load stock devices for selected dealer.');
    } finally {
      setLoadingDealerDevices(false);
    }
  }, []);

  const handleFromDealerChange = (e) => {
    const dId = e.target.value;
    setMoveForm(prev => ({ ...prev, fromDealerId: dId }));
    setMoveResult(null);
    fetchDealerStockDevices(dId, moveForm.modelFilter, deviceSearch);
  };

  const handleModelFilterChange = (e) => {
    const mod = e.target.value;
    setMoveForm(prev => ({ ...prev, modelFilter: mod }));
    if (moveForm.fromDealerId) {
      fetchDealerStockDevices(moveForm.fromDealerId, mod, deviceSearch);
    }
  };

  const filteredDealerDevices = useMemo(() => {
    if (!deviceSearch.trim()) return dealerDevices;
    const q = deviceSearch.toLowerCase().trim();
    return dealerDevices.filter(d => 
      String(d.imei || '').toLowerCase().includes(q) ||
      String(d.vendor || '').toLowerCase().includes(q) ||
      String(d.vehicleNo || '').toLowerCase().includes(q)
    );
  }, [dealerDevices, deviceSearch]);

  const toggleSelectImei = (imei) => {
    setSelectedImeis(prev => {
      const next = new Set(prev);
      if (next.has(imei)) next.delete(imei);
      else next.add(imei);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedImeis.size === filteredDealerDevices.length && filteredDealerDevices.length > 0) {
      setSelectedImeis(new Set());
    } else {
      const all = new Set(filteredDealerDevices.map(d => d.imei));
      setSelectedImeis(all);
    }
  };

  // Parse pasted IMEIs for move
  const detectedMoveImeis = useMemo(() => {
    if (!moveImeisText.trim()) return [];
    const lines = moveImeisText.split(/[\r\n,;\s\t]+/);
    const cleaned = lines.map(s => s.trim().replace(/[^0-9]/g, '')).filter(s => s.length >= 10);
    return [...new Set(cleaned)];
  }, [moveImeisText]);

  const selectedTargetUser = useMemo(() => {
    return dealers.find(d => d._id === moveForm.toDealerId);
  }, [dealers, moveForm.toDealerId]);

  const targetUserLabel = selectedTargetUser 
    ? (selectedTargetUser.displayName || selectedTargetUser.companyName || selectedTargetUser.username)
    : 'Target User';

  const selectedSourceUser = useMemo(() => {
    if (moveForm.fromDealerId === 'admin') {
      return { displayName: 'Admin Stock (Arshi Enterprises)', username: 'admin' };
    }
    return dealers.find(d => d._id === moveForm.fromDealerId);
  }, [dealers, moveForm.fromDealerId]);

  const sourceUserLabel = selectedSourceUser 
    ? (selectedSourceUser.displayName || selectedSourceUser.companyName || selectedSourceUser.username)
    : (moveForm.fromDealerId === 'admin' ? 'Admin Stock (Arshi Enterprises)' : '');

  useEffect(() => {
    if (activeTab === 'move' && moveForm.fromDealerId) {
      fetchDealerStockDevices(moveForm.fromDealerId, moveForm.modelFilter, deviceSearch);
    }
  }, [activeTab, moveForm.fromDealerId, fetchDealerStockDevices]);

  const handleMoveSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setMoveResult(null);

    if (!moveForm.toDealerId) {
      showToast('error', 'Please select a Target User (Receiver).');
      return;
    }

    const imeisToMove = moveMode === 'list' ? Array.from(selectedImeis) : detectedMoveImeis;

    if (imeisToMove.length === 0) {
      if (moveMode === 'list') {
        showToast('error', 'Please select at least one device from the list to transfer.');
      } else {
        showToast('error', 'Please enter or paste at least one valid IMEI number to move.');
      }
      return;
    }

    try {
      setMovingStock(true);
      const res = await api.post('/stock/move', {
        fromDealerId: moveForm.fromDealerId || undefined,
        toDealerId: moveForm.toDealerId,
        imeisList: imeisToMove,
        notes: moveForm.notes || 'Moved via Stock Inventory',
      });

      setMoveResult(res.data);
      showToast('success', res.data.message || `Successfully transferred ${res.data.movedCount} devices!`);

      // Refresh devices if source dealer was selected
      if (moveForm.fromDealerId) {
        fetchDealerStockDevices(moveForm.fromDealerId, moveForm.modelFilter, deviceSearch);
      }
      setSelectedImeis(new Set());
      setMoveImeisText('');
      setMoveForm(prev => ({ ...prev, notes: '' }));
    } catch (err) {
      console.error('Error moving stock:', err);
      const msg = err.response?.data?.message || 'Failed to move stock devices.';
      showToast('error', msg);
    } finally {
      setMovingStock(false);
    }
  };

  // ==========================================
  // 3. OVERVIEW / STATS STATE & HANDLERS
  // ==========================================
  const [overview, setOverview] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(false);

  const fetchOverview = useCallback(async () => {
    try {
      setLoadingOverview(true);
      const res = await api.get('/stock/overview');
      setOverview(res.data);
    } catch (err) {
      console.error('Error loading stock overview:', err);
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'overview') {
      fetchOverview();
    }
  }, [activeTab, fetchOverview]);

  return (
    <div className="stock-inventory-container">
      {/* Toast Alert */}
      {toast.show && (
        <div className={`toast-notification ${toast.type}`}>
          {toast.type === 'success' ? <FaCheckCircle /> : <FaExclamationTriangle />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Main Header */}
      <div className="stock-header-card">
        <div className="stock-header-title">
          <div className="stock-icon-bubble">
            <FaBoxes />
          </div>
          <div>
            <h1>Stock Inventory Management</h1>
            <p>Add new stock for dealers, transfer inventory between dealers, and track stock allocation in real-time</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="stock-tab-bar">
          <button
            type="button"
            className={`stock-tab-btn ${activeTab === 'add' ? 'active' : ''}`}
            onClick={() => handleTabChange('add')}
          >
            <FaPlusCircle /> Add Stock
          </button>
          <button
            type="button"
            className={`stock-tab-btn ${activeTab === 'move' ? 'active' : ''}`}
            onClick={() => handleTabChange('move')}
          >
            <FaExchangeAlt /> Move Stock
          </button>
          <button
            type="button"
            className={`stock-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => handleTabChange('overview')}
          >
            <FaListAlt /> Stock Overview
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: ADD STOCK & DIRECT MOVE                           */}
      {/* ========================================================= */}
      {activeTab === 'add' && (
        <div className="stock-content-grid">
          <div className="stock-form-card">
            <div className="stock-card-header">
              <FaBoxes className="header-icon" />
              <span>ADD STOCK TO ADMIN INVENTORY</span>
            </div>

            <form onSubmit={handleAddSubmit} className="stock-form">
              {/* Informational banner confirming Admin Stock */}
              <div style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '8px',
                padding: '10px 14px',
                marginBottom: '18px',
                fontSize: '13px',
                color: '#166534',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: '500'
              }}>
                <FaBuilding style={{ color: '#15803d' }} />
                <span>Stock will be added directly into <strong>Admin Inventory (Arshi Enterprises)</strong>. You can distribute devices to dealers in the <strong>Move Stock</strong> tab.</span>
              </div>

              <div className="stock-form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
                {/* Model Name Dropdown */}
                <div className="stock-field-group">
                  <label>
                    <FaMobileAlt className="field-icon" /> Model Name <span className="req">*</span>
                  </label>
                  <select
                    value={addForm.vendor}
                    onChange={(e) => setAddForm(prev => ({ ...prev, vendor: e.target.value }))}
                    className="stock-select"
                    required
                  >
                    <option value="">-- Choose Device Model --</option>
                    {DEVICE_MODELS.map(model => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </select>
                </div>

                {/* Notes (Optional) */}
                <div className="stock-field-group">
                  <label>Notes / Batch Remarks (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Factory shipment batch #42 / invoice #104"
                    value={addForm.notes}
                    onChange={(e) => setAddForm(prev => ({ ...prev, notes: e.target.value }))}
                    className="stock-input"
                  />
                </div>
              </div>

              {/* Multiple IMEIs Textarea */}
              <div className="stock-imei-section">
                <div className="stock-imei-header">
                  <label>
                    IMEI Numbers to Add (Multiple) <span className="req">*</span>
                  </label>
                  <span className="stock-counter-badge">
                    {detectedAddImeis.length} {detectedAddImeis.length === 1 ? 'IMEI' : 'IMEIs'} Detected
                  </span>
                </div>
                <textarea
                  rows={8}
                  className="stock-textarea"
                  placeholder="Paste multiple IMEIs here...&#10;One IMEI per line, or comma-separated&#10;e.g.&#10;358250331072179&#10;358250331072180&#10;358250331072181"
                  value={addImeisText}
                  onChange={(e) => setAddImeisText(e.target.value)}
                  required
                />
                <span className="stock-hint">
                  Tip: You can copy and paste an entire column of IMEIs directly from Excel or Google Sheets.
                </span>
              </div>

              {/* Action Buttons */}
              <div className="stock-form-actions">
                <button
                  type="button"
                  className="btn-stock-reset"
                  onClick={() => {
                    setAddImeisText('');
                    setAddResult(null);
                  }}
                  disabled={addingStock}
                >
                  Clear IMEIs
                </button>

                <button
                  type="submit"
                  className="btn-stock-submit"
                  disabled={addingStock || detectedAddImeis.length === 0 || !addForm.vendor}
                >
                  {addingStock ? (
                    <><FaSpinner className="fa-spin" /> Adding {detectedAddImeis.length} Devices...</>
                  ) : (
                    <><FaPlusCircle /> Add Stock to {addForm.dealerId === 'admin' || !addForm.dealerId ? 'Admin Inventory' : 'Selected User'} ({detectedAddImeis.length} Units)</>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Result Card */}
          {addResult && (
            <div className="stock-result-card success">
              <div className="result-header">
                <FaCheckCircle className="result-icon success" />
                <h3>{addResult.isMoveAction ? 'Stock Transferred Successfully!' : 'Stock Added Successfully!'}</h3>
              </div>
              <p className="result-message">{addResult.message}</p>
              <div className="result-stats-row">
                <div className="result-stat-box">
                  <span className="stat-label">{addResult.isMoveAction ? 'Units Moved' : 'Units Added'}</span>
                  <span className="stat-val highlight">{addResult.addedCount || addResult.movedCount}</span>
                </div>
                {!addResult.isMoveAction && (
                  <div className="result-stat-box">
                    <span className="stat-label">Duplicates Skipped</span>
                    <span className="stat-val warning">{addResult.duplicatesCount}</span>
                  </div>
                )}
                <div className="result-stat-box">
                  <span className="stat-label">Target User</span>
                  <span className="stat-val highlight">{addResult.dealerName || addResult.toDealerName}</span>
                </div>
                <div className="result-stat-box">
                  <span className="stat-label">{addResult.isMoveAction ? 'Action' : 'Model'}</span>
                  <span className="stat-val">{addResult.vendor}</span>
                </div>
              </div>

              {addResult.duplicateImeis && addResult.duplicateImeis.length > 0 && (
                <div className="result-duplicates-accordion">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span className="dup-title">Existing / Duplicate IMEIs ({addResult.duplicateImeis.length}):</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAddImeisText(addResult.duplicateImeis.join('\n'));
                        handleDirectMoveSubmit();
                      }}
                      className="btn-stock-submit"
                      style={{ background: '#0d9488', padding: '6px 14px', fontSize: '12px' }}
                    >
                      <FaExchangeAlt /> Move All Duplicates to {addResult.dealerName} Now
                    </button>
                  </div>
                  <div className="dup-pill-list">
                    {addResult.duplicateImeis.map((im, idx) => (
                      <span key={idx} className="dup-pill">{im}</span>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-stock-submit"
                  style={{ background: '#2563eb', padding: '9px 18px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                  onClick={() => {
                    const targetId = addResult.dealerId || addForm.dealerId;
                    if (targetId) {
                      setMoveForm(prev => ({ ...prev, fromDealerId: targetId }));
                      fetchDealerStockDevices(targetId, 'all', '');
                    }
                    handleTabChange('move');
                  }}
                >
                  <FaExchangeAlt /> Open Move Stock Panel &rarr;
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: MOVE / TRANSFER STOCK                             */}
      {/* ========================================================= */}
      {activeTab === 'move' && (
        <div className="stock-content-grid">
          <div className="stock-form-card">
            <div className="stock-card-header">
              <FaExchangeAlt className="header-icon" />
              <span>MOVE / TRANSFER STOCK BETWEEN USERS / DEALERS</span>
            </div>

            <form onSubmit={handleMoveSubmit} className="stock-form">
              <div className="stock-form-grid">
                {/* Source User / Dealer */}
                <div className="stock-field-group">
                  <label>
                    <FaBuilding className="field-icon" /> Select User / Dealer (Whose Stock to Move)
                  </label>
                  <select
                    value={moveForm.fromDealerId}
                    onChange={handleFromDealerChange}
                    className="stock-select"
                  >
                    <option value="">-- Choose User / Dealer (e.g. Demo GPS Dealer) --</option>
                    <option value="admin">🏢 Admin Stock (Arshi Enterprises Central Inventory)</option>
                    {dealers.map(d => (
                      <option key={d._id} value={d._id}>
                        {d.displayName || d.companyName || d.username} ({d.userType || 'Dealer'}) {d.mobileNo ? `- ${d.mobileNo}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Target User (Receiver) */}
                <div className="stock-field-group">
                  <label>
                    <FaUserTie className="field-icon" /> Transfer To (Target Receiver User) <span className="req">*</span>
                  </label>
                  <select
                    value={moveForm.toDealerId}
                    onChange={(e) => setMoveForm(prev => ({ ...prev, toDealerId: e.target.value }))}
                    className="stock-select"
                    required
                  >
                    <option value="">-- Choose Target Receiver User --</option>
                    {dealers
                      .filter(d => !moveForm.fromDealerId || d._id !== moveForm.fromDealerId)
                      .map(d => (
                        <option key={d._id} value={d._id}>
                          {d.displayName || d.companyName || d.username} ({d.userType || 'Dealer'}) {d.mobileNo ? `- ${d.mobileNo}` : ''}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Transfer Remarks */}
                <div className="stock-field-group">
                  <label>Transfer Notes / Reason (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Stock allocation / Reassignment"
                    value={moveForm.notes}
                    onChange={(e) => setMoveForm(prev => ({ ...prev, notes: e.target.value }))}
                    className="stock-input"
                  />
                </div>
              </div>

              {/* Mode Switcher */}
              <div className="move-mode-bar">
                <span className="mode-label">Transfer Method:</span>
                <button
                  type="button"
                  className={`btn-mode-toggle ${moveMode === 'list' ? 'active' : ''}`}
                  onClick={() => setMoveMode('list')}
                >
                  <FaListAlt /> Select from Device List ({filteredDealerDevices.length} Available)
                </button>
                <button
                  type="button"
                  className={`btn-mode-toggle ${moveMode === 'paste' ? 'active' : ''}`}
                  onClick={() => setMoveMode('paste')}
                >
                  <FaMobileAlt /> Paste IMEIs Manually
                </button>
              </div>

              {/* MODE 1: SELECT FROM LIVE DEVICE TABLE */}
              {moveMode === 'list' && (
                <div style={{ marginTop: '12px' }}>
                  {!moveForm.fromDealerId ? (
                    <div style={{ padding: '36px 20px', textAlign: 'center', background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: '8px', color: '#64748b' }}>
                      <FaUserTie style={{ fontSize: '32px', color: '#94a3b8', marginBottom: '8px' }} />
                      <p style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: '600', color: '#334155' }}>
                        Please select a User / Dealer above (e.g. Demo GPS Dealer)
                      </p>
                      <p style={{ margin: 0, fontSize: '12.5px' }}>
                        All stock devices belonging to that dealer will instantly appear here with checkboxes so you can pick and transfer them.
                      </p>
                    </div>
                  ) : loadingDealerDevices ? (
                    <div className="loading-state" style={{ padding: '30px', textAlign: 'center' }}>
                      <FaSpinner className="fa-spin" /> Loading stock devices for {sourceUserLabel}...
                    </div>
                  ) : filteredDealerDevices.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#64748b' }}>
                      <FaBoxes style={{ fontSize: '28px', color: '#94a3b8', marginBottom: '6px' }} />
                      <p style={{ margin: 0, fontSize: '13.5px', fontWeight: '600', color: '#334155' }}>
                        No stock devices found under {sourceUserLabel}.
                      </p>
                      <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>
                        Add stock devices for this user in the &ldquo;Add Stock&rdquo; tab first.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="device-selection-toolbar">
                        <div className="search-box">
                          <FaSearch className="search-icon" />
                          <input
                            type="text"
                            placeholder="Search by IMEI or Model..."
                            value={deviceSearch}
                            onChange={(e) => setDeviceSearch(e.target.value)}
                            className="search-input"
                          />
                          {deviceSearch && (
                            <FaTimesCircle className="search-clear" onClick={() => setDeviceSearch('')} />
                          )}
                        </div>

                        <div className="selection-actions">
                          <select
                            value={moveForm.modelFilter}
                            onChange={handleModelFilterChange}
                            className="stock-select"
                            style={{ width: 'auto', padding: '6px 12px', fontSize: '12px' }}
                          >
                            <option value="all">All Models</option>
                            {DEVICE_MODELS.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>

                          <button
                            type="button"
                            className="btn-select-all"
                            onClick={toggleSelectAll}
                          >
                            {selectedImeis.size === filteredDealerDevices.length && filteredDealerDevices.length > 0 ? (
                              <><FaCheckSquare style={{ color: '#0f766e' }} /> Deselect All</>
                            ) : (
                              <><FaSquare style={{ color: '#94a3b8' }} /> Select All ({filteredDealerDevices.length})</>
                            )}
                          </button>

                          <span className="selected-tag">
                            Selected: <strong>{selectedImeis.size}</strong> of {filteredDealerDevices.length}
                          </span>
                        </div>
                      </div>

                      <div className="device-table-container">
                        <table className="stock-table">
                          <thead>
                            <tr>
                              <th style={{ width: '40px', textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={selectedImeis.size === filteredDealerDevices.length && filteredDealerDevices.length > 0}
                                  onChange={toggleSelectAll}
                                  className="stock-checkbox"
                                  title="Select / Deselect All"
                                />
                              </th>
                              <th style={{ width: '45px' }}>#</th>
                              <th>IMEI Number</th>
                              <th>Model / Vendor</th>
                              <th>Validity</th>
                              <th>Status</th>
                              <th>Assigned Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredDealerDevices.map((dev, idx) => {
                              const isPicked = selectedImeis.has(dev.imei);
                              return (
                                <tr
                                  key={dev._id || dev.imei}
                                  className={isPicked ? 'row-picked' : ''}
                                  onClick={() => toggleSelectImei(dev.imei)}
                                  style={{ cursor: 'pointer' }}
                                >
                                  <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={isPicked}
                                      onChange={() => toggleSelectImei(dev.imei)}
                                      className="stock-checkbox"
                                    />
                                  </td>
                                  <td style={{ color: '#64748b' }}>{idx + 1}</td>
                                  <td>
                                    <code style={{ fontWeight: '700', fontSize: '13px', color: '#0f172a', letterSpacing: '0.5px' }}>
                                      {dev.imei}
                                    </code>
                                  </td>
                                  <td>
                                    <span className="model-badge">{dev.vendor || 'Unknown'}</span>
                                  </td>
                                  <td>{dev.validity || '1 Year'}</td>
                                  <td>
                                    <span className="status-pill active">{dev.status || 'Active'}</span>
                                  </td>
                                  <td style={{ color: '#64748b', fontSize: '11.5px' }}>
                                    {dev.presentDate ? new Date(dev.presentDate).toLocaleDateString('en-GB') : '-'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* MODE 2: PASTE MULTIPLE IMEIS */}
              {moveMode === 'paste' && (
                <div className="stock-imei-section">
                  <div className="stock-imei-header">
                    <label>
                      IMEI Numbers to Move / Transfer (Multiple) <span className="req">*</span>
                    </label>
                    <span className="stock-counter-badge">
                      {detectedMoveImeis.length} {detectedMoveImeis.length === 1 ? 'IMEI' : 'IMEIs'} Entered
                    </span>
                  </div>
                  <textarea
                    rows={8}
                    className="stock-textarea"
                    placeholder="Paste multiple IMEIs here...&#10;One IMEI per line, or comma-separated&#10;e.g.&#10;358250331072179&#10;358250331072180&#10;358250331072181"
                    value={moveImeisText}
                    onChange={(e) => setMoveImeisText(e.target.value)}
                  />
                  <span className="stock-hint">
                    Tip: Any device matching these IMEIs in the database will be transferred directly to the selected Target Receiver.
                  </span>
                </div>
              )}

              {/* Submit Move Action */}
              <div className="stock-form-actions">
                <button
                  type="button"
                  className="btn-stock-reset"
                  onClick={() => {
                    setSelectedImeis(new Set());
                    setMoveImeisText('');
                    setMoveResult(null);
                  }}
                  disabled={movingStock}
                >
                  Reset Selection
                </button>
                <button
                  type="submit"
                  className="btn-stock-submit move-submit"
                  disabled={
                    movingStock ||
                    !moveForm.toDealerId ||
                    (moveMode === 'list' ? selectedImeis.size === 0 : detectedMoveImeis.length === 0)
                  }
                >
                  {movingStock ? (
                    <><FaSpinner className="fa-spin" /> Transferring Devices...</>
                  ) : (
                    <>
                      <FaExchangeAlt /> Transfer {moveMode === 'list' ? selectedImeis.size : detectedMoveImeis.length} Device(s) to {targetUserLabel}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Move Result Card */}
          {moveResult && (
            <div className="stock-result-card success">
              <div className="result-header">
                <FaCheckCircle className="result-icon success" />
                <h3>Stock Transfer Completed!</h3>
              </div>
              <p className="result-message">{moveResult.message}</p>
              <div className="result-stats-row">
                <div className="result-stat-box">
                  <span className="stat-label">Units Moved</span>
                  <span className="stat-val highlight">{moveResult.movedCount}</span>
                </div>
                <div className="result-stat-box">
                  <span className="stat-label">Target User</span>
                  <span className="stat-val highlight">{moveResult.toDealerName}</span>
                </div>
                {moveResult.fromDealerName && moveResult.fromDealerName !== 'Previous User' && (
                  <div className="result-stat-box">
                    <span className="stat-label">Previous Owner</span>
                    <span className="stat-val">{moveResult.fromDealerName}</span>
                  </div>
                )}
              </div>

              {moveResult.notFoundImeis && moveResult.notFoundImeis.length > 0 && (
                <div className="result-duplicates-accordion">
                  <span className="dup-title">IMEIs Not Found / Skipped:</span>
                  <div className="dup-pill-list">
                    {moveResult.notFoundImeis.map((im, idx) => (
                      <span key={idx} className="dup-pill">{im}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: STOCK OVERVIEW                                    */}
      {/* ========================================================= */}
      {activeTab === 'overview' && (
        <div className="stock-overview-grid">
          {loadingOverview ? (
            <div className="loading-state">
              <FaSpinner className="fa-spin" /> Loading stock overview...
            </div>
          ) : overview ? (
            <>
              {/* Summary Metrics */}
              <div className="overview-stats-cards">
                <div className="overview-card">
                  <div className="card-icon blue"><FaBoxes /></div>
                  <div className="card-info">
                    <span className="val">{overview.totalCount || 0}</span>
                    <span className="lbl">Total Devices in Inventory</span>
                  </div>
                </div>

                <div className="overview-card">
                  <div className="card-icon green"><FaMobileAlt /></div>
                  <div className="card-info">
                    <span className="val">{overview.modelStats?.length || 0}</span>
                    <span className="lbl">Active Models / Vendors</span>
                  </div>
                </div>

                <div className="overview-card">
                  <div className="card-icon amber"><FaBuilding /></div>
                  <div className="card-info">
                    <span className="val">{overview.dealerStats?.length || 0}</span>
                    <span className="lbl">Dealers with Allocated Stock</span>
                  </div>
                </div>
              </div>

              {/* Models Breakdown */}
              <div className="stock-split-section">
                <div className="stock-box">
                  <h3>Stock Breakdown by Model</h3>
                  <table className="stock-table">
                    <thead>
                      <tr>
                        <th>Model / Vendor</th>
                        <th style={{ textAlign: 'right' }}>Total Units</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(overview.modelStats || []).map(m => (
                        <tr key={m._id || 'other'}>
                          <td><strong>{m._id || 'Unassigned Vendor'}</strong></td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#0f766e' }}>{m.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Dealers Breakdown */}
                <div className="stock-box">
                  <h3>Stock Breakdown by Dealer</h3>
                  <table className="stock-table">
                    <thead>
                      <tr>
                        <th>Dealer Name</th>
                        <th style={{ textAlign: 'right' }}>Total Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(overview.dealerStats || []).map(d => (
                        <tr key={d.dealerId || 'other'}>
                          <td><strong>{d.dealerName}</strong></td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#2563eb' }}>{d.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default StockInventory;
