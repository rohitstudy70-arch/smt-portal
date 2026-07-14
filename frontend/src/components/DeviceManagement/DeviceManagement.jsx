import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { FaMobileAlt, FaCloudUploadAlt, FaDownload, FaSearch, FaTrash } from 'react-icons/fa';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import './DeviceManagement.css';

const DeviceManagement = () => {
  const { user } = useAuth();
  const getRole = (u) => {
    if (u?.role === 'partner') return 'ADMIN';
    if (u?.userType === 'Administration') return 'ADMIN';
    if (u?.userType === 'Sub Dealer') return 'SUB_DEALER';
    return 'DEALER';
  };
  const role = getRole(user);

  const [subUsers, setSubUsers] = useState([]);
  const [allUsersMap, setAllUsersMap] = useState({}); // _id -> user, for quick lookup
  const [devices, setDevices] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form State
  const [selectedUser, setSelectedUser] = useState('');
  const [assignType, setAssignType] = useState('Assign');
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [imeisText, setImeisText] = useState('');

  // Filters State
  const [activeTab, setActiveTab] = useState('Unassigned'); // 'Unassigned', 'Assigned', or 'all'
  const [limit, setLimit] = useState(100);
  const [page, setPage] = useState(1);
  const [filterUser, setFilterUser] = useState('');
  const [filterDealer, setFilterDealer] = useState('');
  const [filterSubDealer, setFilterSubDealer] = useState('');
  const [filterVendor, setFilterVendor] = useState('');
  const [search, setSearch] = useState('');

  const location = useLocation();

  useEffect(() => {
    // Fetch sub-users
    const fetchSubUsers = async () => {
      try {
        const res = await api.get('/users/sub-users');
        setSubUsers(res.data);
        // Build a quick-lookup map for parent dealer names
        const map = {};
        res.data.forEach(u => { map[u._id] = u; });
        setAllUsersMap(map);
      } catch (err) {
        console.error('Error fetching sub-users:', err);
      }
    };
    fetchSubUsers();
  }, []);

  const fetchDevices = async (searchOverride) => {
    try {
      setLoading(true);
      const activeSearch = searchOverride !== undefined ? searchOverride : search;
      const params = {
          status: activeTab,
          assignedTo: filterUser,
          vendor: filterVendor,
          search: activeSearch,
          limit,
          page,
        };
      if (filterDealer) params.dealerId = filterDealer;
      if (filterSubDealer) params.subDealerId = filterSubDealer;
      const res = await api.get('/devices', { params });
      setDevices(res.data.devices);
      setTotal(res.data.total);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch devices list. Please try again.');
      setLoading(false);
    }
  };

  // Watch URL query parameter for search
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const searchVal = searchParams.get('search') || '';
    setSearch(searchVal);
    setPage(1);
    fetchDevices(searchVal);
  }, [location.search]);

  // Refetch when other filters or page changes (excluding search parameter change, which is handled above)
  useEffect(() => {
    fetchDevices();
  }, [activeTab, filterUser, filterDealer, filterSubDealer, filterVendor, limit, page]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchDevices();
  };

  const handleExportDevices = async () => {
    try {
      const params = {
        status: activeTab,
        assignedTo: filterUser,
        vendor: filterVendor,
        search,
      };
      if (filterDealer) params.dealerId = filterDealer;
      if (filterSubDealer) params.subDealerId = filterSubDealer;

      const res = await api.get('/devices/export', {
        responseType: 'blob',
        params,
      });

      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `device_report_${new Date().toISOString().slice(0, 10)}.xlsx`);
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to export devices. Please try again.');
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setFileName(e.target.files[0].name);
    }
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!selectedUser) {
      alert('Please select a user.');
      return;
    }

    try {
      setUploading(true);
      const res = await api.post('/devices/assign', {
        subUserId: selectedUser,
        type: assignType,
        imeisText
      });

      setSuccess(res.data.message);
      alert(res.data.message);
      resetAssignForm();
      setPage(1);
      fetchDevices();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to assign devices. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const resetAssignForm = () => {
    setSelectedUser('');
    setAssignType('Assign');
    setFileName('');
    setImeisText('');
  };

  const canDeleteDevice = (device) => {
    if (user?.role !== 'partner') {
      return false;
    }

    let targetOwnerRole = 'DEALER';
    if (device.assignedTo) {
      const assigneeType = device.assignedTo.userType || 'Dealer';
      if (assigneeType === 'Sub Dealer') {
        targetOwnerRole = 'SUB_DEALER';
      } else {
        targetOwnerRole = 'DEALER';
      }
    } else if (device.subDealerId) {
      targetOwnerRole = 'SUB_DEALER';
    }

    if (targetOwnerRole === 'DEALER') {
      return true;
    }
    if (targetOwnerRole === 'SUB_DEALER') {
      return true;
    }

    return false;
  };

  const handleDeleteDevice = async (deviceId, imei) => {
    if (window.confirm(`Are you sure you want to permanently delete device with IMEI "${imei}"?`)) {
      try {
        const res = await api.delete(`/devices/${deviceId}`);
        setSuccess(res.data.message || 'Device deleted successfully.');
        alert(res.data.message || 'Device deleted successfully.');
        fetchDevices();
      } catch (err) {
        console.error(err);
        setError(err.response?.data?.message || 'Failed to delete device. Please try again.');
      }
    }
  };

  const handleDownloadFormat = () => {
    const csvContent = 'imei,iccid\n350000000000001,89910000000000000001F\n350000000000002,89910000000000000002F';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'Device_Assign_Template.csv');
    link.click();
  };

  const totalPages = Math.ceil(total / limit);

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
    <div className="device-management-container">
      {/* Top Card: Assign Devices */}
      true && (
        <div className="card-panel">
          <div className="card-panel-header">
            <FaMobileAlt className="panel-icon" />
            <span className="panel-title">ASSIGN DEVICES</span>
            <button className="btn-si-partner" onClick={() => alert('Opening SI Partner Details...')}>
              SI Partner
            </button>
          </div>

          <div className="card-panel-body">
            {error && <div className="alert-message error">{error}</div>}
            {success && <div className="alert-message success">{success}</div>}

            <form onSubmit={handleAssignSubmit} className="form-assign">
              <div className="form-row">
                <div className="form-group-horizontal">
                  <label>User *</label>
                  <div className="input-wrapper">
                    <select 
                      value={selectedUser} 
                      onChange={(e) => setSelectedUser(e.target.value)}
                      required
                    >
                      <option value="">-Select User-</option>
                      {role === 'ADMIN' ? (
                        // For Admin: show Dealers and Sub Dealers in separate groups
                        // so Admin can directly assign to any Sub Dealer without choosing Dealer first
                        <>
                          {subUsers.filter(u => u.userType !== 'Sub Dealer' && u.userType !== 'Administration' && u.role !== 'partner').length > 0 && (
                            <optgroup label="── Dealers ──">
                              {subUsers
                                .filter(u => u.userType !== 'Sub Dealer' && u.userType !== 'Administration' && u.role !== 'partner')
                                .map(u => (
                                  <option key={u._id} value={u._id}>
                                    {u.displayName || u.username}
                                  </option>
                                ))}
                            </optgroup>
                          )}
                          {subUsers.filter(u => u.userType === 'Sub Dealer').length > 0 && (
                            <optgroup label="── Sub Dealers ──">
                              {subUsers
                                .filter(u => u.userType === 'Sub Dealer')
                                .map(u => {
                                  const parentDealer = u.parentId ? allUsersMap[u.parentId] : null;
                                  const parentLabel = parentDealer ? ` [${parentDealer.displayName || parentDealer.username}]` : '';
                                  return (
                                    <option key={u._id} value={u._id}>
                                      {u.displayName || u.username}{parentLabel}
                                    </option>
                                  );
                                })}
                            </optgroup>
                          )}
                        </>
                      ) : (
                        // For Dealer: show their own sub dealers directly
                        subUsers.map(u => (
                          <option key={u._id} value={u._id}>{u.displayName || u.username}</option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                <div className="form-group-horizontal">
                  <label>Type *</label>
                  <div className="input-wrapper">
                    <select 
                      value={assignType} 
                      onChange={(e) => setAssignType(e.target.value)}
                      required
                    >
                      <option value="Assign">Assign</option>
                      <option value="Unassign">Unassign</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="form-row" style={{ display: 'block', marginBottom: '15px' }}>
                <div className="form-group-horizontal" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                  <label style={{ fontWeight: '600', color: '#ccc', marginBottom: '2px' }}>Enter IMEIs/ICCIDs manually (comma or newline separated)</label>
                  <div className="input-wrapper" style={{ width: '100%' }}>
                    <textarea 
                      value={imeisText} 
                      onChange={(e) => setImeisText(e.target.value)}
                      placeholder="e.g. 542307, 000002 or paste full/partial (6-digit) IMEI numbers..."
                      rows={3}
                      style={{ 
                        width: '100%', 
                        padding: '10px', 
                        background: '#1e1e1e', 
                        color: '#fff', 
                        border: '1px solid #444', 
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="form-row upload-row">
                <div className="form-group-horizontal">
                  <label>Upload ICCID/IMEI details</label>
                  <div className="input-wrapper file-input-wrapper">
                    <input 
                      type="file" 
                      id="excel-file" 
                      onChange={handleFileChange}
                      accept=".xlsx, .xls, .csv"
                    />
                    <label htmlFor="excel-file" className="btn-choose-file">
                      Choose file
                    </label>
                    <span className="file-name">{fileName || 'No file chosen'}</span>
                    <div className="help-text">In Excel Format...</div>
                  </div>
                </div>

                <div className="upload-format-wrapper">
                  <label>Upload Format</label>
                  <button 
                    type="button" 
                    className="btn-download-format"
                    onClick={handleDownloadFormat}
                  >
                    <FaCloudUploadAlt />
                  </button>
                </div>
              </div>

              <div className="form-actions-assign">
                <button type="button" className="btn-cancel" onClick={resetAssignForm}>
                  Cancel
                </button>
                <button type="submit" className="btn-submit" disabled={uploading}>
                  {uploading ? 'Processing...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bottom Card: Unassigned/Assigned Devices */}
      <div className="card-panel">
        <div className="card-panel-header tabs-header">
          <FaMobileAlt className="panel-icon" />
          <span className="panel-title uppercase-title">
            {activeTab === 'all' ? 'ALL DEVICES' : activeTab === 'Unassigned' ? 'UNASSIGNED DEVICES' : 'ASSIGNED DEVICES'}
          </span>
          
          <div className="header-tabs-group">
            <button 
              className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => { setActiveTab('all'); setPage(1); }}
            >
              All Devices
            </button>
            <button 
              className={`tab-btn tab-assigned ${activeTab === 'Assigned' ? 'active' : ''}`}
              onClick={() => { setActiveTab('Assigned'); setPage(1); }}
            >
              Assigned Devices
            </button>
            <button 
              className={`tab-btn tab-unassigned ${activeTab === 'Unassigned' ? 'active' : ''}`}
              onClick={() => { setActiveTab('Unassigned'); setPage(1); }}
            >
              Unassigned Devices
            </button>
          </div>

          <button className="btn-export-devices" onClick={handleExportDevices}>
            Export
          </button>
        </div>

        <div className="card-panel-body">
          {/* Table Filters Bar */}
          <div className="table-filters-bar">
            <div className="filters-left">
              <div className="filter-item">
                <label>Show</label>
                <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              {/* Show Dealer filter ONLY for ADMIN role */}
              {role === 'ADMIN' && (
                <div className="filter-item">
                  <select 
                    value={filterDealer} 
                    onChange={(e) => { 
                      setFilterDealer(e.target.value); 
                      setFilterSubDealer(''); // reset subdealer selection when dealer changes
                      setPage(1); 
                    }}
                  >
                    <option value="">-Select Dealer-</option>
                    {subUsers
                      .filter(u => u.userType === 'Dealer' || u.userType === '' || u.userType === 'Administration' || u.role === 'partner')
                      .map(u => (
                        <option key={u._id} value={u._id}>
                          {u.displayName || u.username} ({u.deviceCount ?? 0} devices)
                        </option>
                      ))
                    }
                  </select>
                </div>
              )}

              {/* Show Sub Dealer filter for ADMIN and DEALER roles */}
              {(role === 'ADMIN' || role === 'DEALER') && (
                <div className="filter-item">
                  <select 
                    value={filterSubDealer} 
                    onChange={(e) => { 
                      setFilterSubDealer(e.target.value); 
                      setPage(1); 
                    }}
                  >
                    <option value="">-Select Sub Dealer-</option>
                    {subUsers
                      .filter(u => u.userType === 'Sub Dealer')
                      .filter(u => !filterDealer || u.parentId === filterDealer)
                      .map(u => {
                        const parentDealer = u.parentId ? allUsersMap[u.parentId] : null;
                        const parentLabel = parentDealer ? ` (Dealer: ${parentDealer.displayName || parentDealer.username})` : '';
                        return (
                          <option key={u._id} value={u._id}>
                            {u.displayName || u.username}{parentLabel}
                          </option>
                        );
                      })
                    }
                  </select>
                </div>
              )}

              {activeTab === 'Assigned' && (
                <div className="filter-item">
                  <select value={filterUser} onChange={(e) => { setFilterUser(e.target.value); setPage(1); }}>
                    <option value="">-Select User-</option>
                    {subUsers.map(u => (
                      <option key={u._id} value={u._id}>{u.displayName || u.username}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="filter-item">
                <select value={filterVendor} onChange={(e) => { setFilterVendor(e.target.value); setPage(1); }}>
                  <option value="">-Select Model-</option>
                  <option value="iTriangle">iTriangle</option>
                  <option value="Acute">Acute</option>
                  <option value="Markon">Markon</option>
                  <option value="RDM">RDM</option>
                  <option value="BB">BB</option>
                  <option value="TrackNow">TrackNow</option>
                  <option value="Road point">Road point</option>
                  <option value="Others">Others</option>
                </select>
              </div>
            </div>

            <form className="filters-right" onSubmit={handleSearchSubmit}>
              <div className="search-input-group">
                <input 
                  type="text" 
                  placeholder="Search..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button type="submit"><FaSearch /></button>
              </div>
            </form>
          </div>

          {/* Devices Table */}
          <div className="table-responsive">
            <table className="table-custom">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>Sl No.</th>
                  <th>Model</th>
                  <th>Type</th>
                  <th>Device</th>
                  <th>IMEI No</th>
                  <th>ICCID No</th>
                  <th>Serial No</th>
                  <th>MSISDN 1</th>
                  <th>TSP 1</th>
                  <th>MSISDN 2</th>
                  <th>TSP 2</th>
                  {(activeTab === 'Assigned' || activeTab === 'all' || search) && <th>Assigned To (Customer)</th>}
                  <th>Status</th>
                  <th style={{ width: '80px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={(activeTab === 'Assigned' || activeTab === 'all' || search) ? 14 : 13} className="text-center">
                      Loading devices list...
                    </td>
                  </tr>
                ) : devices.length > 0 ? (
                  devices.map((d, index) => (
                    <tr key={d._id || `device-${index}`}>
                      <td>{((page - 1) * limit) + index + 1}</td>
                      <td>{d.vendor}</td>
                      <td>{d.deviceType}</td>
                      <td>{d.deviceName}</td>
                      <td className="text-semibold text-teal">{d.imei}</td>
                      <td className="text-semibold">{d.iccid}</td>
                      <td>{d.serialNo}</td>
                      <td>{d.msisdn1 || '-'}</td>
                      <td>{d.tsp1}</td>
                      <td>{d.msisdn2 || '-'}</td>
                      <td>{d.tsp2}</td>
                      {(activeTab === 'Assigned' || activeTab === 'all' || search) && (
                        <td className="text-semibold text-teal">
                          {d.assignedTo ? (d.assignedTo.displayName || d.assignedTo.username) : <span style={{ color: '#888' }}>Unassigned</span>}
                        </td>
                      )}
                      <td>
                        <span className={`badge-activated status-${String(d.status || '').toLowerCase()}`}>{d.status}</span>
                      </td>
                      <td>
                        <div className="action-buttons">
                          {canDeleteDevice(d) ? (
                            <button 
                              className="btn-action delete" 
                              title="Delete Device"
                              onClick={() => handleDeleteDevice(d._id, d.imei)}
                              style={{ background: '#d32f2f', color: '#fff', border: 'none', padding: '6px', borderRadius: '3px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <FaTrash />
                            </button>
                          ) : (
                            <span style={{ color: '#666' }}>-</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={(activeTab === 'Assigned' || activeTab === 'all' || search) ? 14 : 13} className="text-center">
                      No device records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Row */}
          <div className="table-pagination-row">
            <div className="pagination-info">
              Showing {total > 0 ? ((page - 1) * limit) + 1 : 0} to {Math.min(page * limit, total)} of {total} records
            </div>
            
            {totalPages > 1 && (
              <div className="pagination-controls">
                <button 
                  disabled={page === 1} 
                  onClick={() => setPage(page - 1)}
                  className="btn-page-arrow"
                >
                  &lt;
                </button>
                
                {getPageNumbers().map((p, idx) => (
                  p === '...' ? (
                    <span key={`ell-${idx}`} className="pagination-ellipsis" style={{ padding: '6px 12px', color: '#888', background: 'transparent', display: 'inline-block' }}>
                      ...
                    </span>
                  ) : (
                    <button 
                      key={p}
                      onClick={() => setPage(p)}
                      className={`btn-page-number ${page === p ? 'active' : ''}`}
                    >
                      {p}
                    </button>
                  )
                ))}
                
                <button 
                  disabled={page === totalPages} 
                  onClick={() => setPage(page + 1)}
                  className="btn-page-arrow"
                >
                  &gt;
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeviceManagement;
