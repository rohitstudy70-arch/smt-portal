import { useState, useEffect } from 'react';
import { 
  FaUserPlus, FaUser, FaList, FaEdit, FaCheck, FaTimes, FaSearch, 
  FaTrash, FaDatabase, FaDownload, FaRedo, FaUsers, FaUserShield, 
  FaStore, FaThLarge, FaColumns, FaShieldAlt
} from 'react-icons/fa';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import './UserManagement.css';

const getRole = (user) => {
  if (user?.role === 'partner') return 'ADMIN';
  if (user?.userType === 'Administration') return 'ADMIN';
  if (user?.userType === 'Sub Dealer') return 'SUB_DEALER';
  return 'DEALER';
};

const userTypesByRole = {
  ADMIN: ['Administration', 'Dealer', 'Sub Dealer'],
  DEALER: ['Sub Dealer'],
  SUB_DEALER: [],
};

const UserManagement = () => {
  const { user } = useAuth();
  const role = getRole(user);
  const isFullAdmin = user?.role === 'partner' && user?.userType !== 'Administration';
  const allowedUserTypes = userTypesByRole[role] || [];

  const [subUsers, setSubUsers] = useState([]);
  const [dealers, setDealers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  

  // Filter & Search states
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');

  // Database Backup States
  const [backups, setBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);

  // Form State
  const [userType, setUserType] = useState(allowedUserTypes[0] || 'Sub Dealer');
  const [displayName, setDisplayName] = useState('');
  const [mobileNo, setMobileNo] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [parentId, setParentId] = useState('');
  
  // Edit State
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);

  const fetchSubUsers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/users/sub-users');
      setSubUsers(res.data || []);
      setLoading(false);
    } catch (err) {
      console.error('Fetch users error:', err);
      setError('Failed to fetch users list. Please try again.');
      setLoading(false);
    }
  };

  const fetchBackups = async () => {
    if (role !== 'ADMIN') return;
    try {
      setBackupsLoading(true);
      const res = await api.get('/backups');
      setBackups(res.data || []);
    } catch (err) {
      console.error('Fetch backups error:', err);
    } finally {
      setBackupsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubUsers();
    if (role === 'ADMIN') {
      fetchBackups();
      api.get('/users/sub-users').then((res) => {
        const dealerList = (res.data || []).filter(
          (u) => u.userType === 'Dealer' || u.userType === '' || u.role === 'partner'
        );
        setDealers(dealerList);
      }).catch(console.error);
    }
  }, [role]);

  useEffect(() => {
    if (allowedUserTypes.length > 0 && !allowedUserTypes.includes(userType)) {
      setUserType(allowedUserTypes[0]);
    }
  }, [allowedUserTypes, userType]);

  const handleCreateBackup = async () => {
    try {
      setCreatingBackup(true);
      setError('');
      const res = await api.post('/backups/create');
      setSuccess(res.data.message || 'Backup created successfully!');
      fetchBackups();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create backup.');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleDownloadBackup = async (filename) => {
    try {
      const res = await api.get(`/backups/download/${filename}`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/gzip' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download backup file.');
    }
  };

  const handleRestoreBackup = async (filename) => {
    if (!window.confirm(`⚠️ CAUTION: Restoring database from backup "${filename}" will overwrite current data. Do you want to proceed?`)) {
      return;
    }
    try {
      setLoading(true);
      setError('');
      const res = await api.post(`/backups/restore/${filename}`);
      setSuccess(res.data.message || 'Database restored successfully!');
      fetchSubUsers();
      fetchBackups();
    } catch (err) {
      const errorMsg = err.response?.data?.error 
        ? `${err.response.data.message || 'Failed to restore database'}: ${err.response.data.error}`
        : (err.response?.data?.message || 'Failed to restore database.');
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!displayName.trim() || !username.trim() || (!isEditMode && !password.trim())) {
      setError('Display Name, Username and Password are required.');
      return;
    }

    if (role === 'ADMIN' && userType === 'Sub Dealer' && !parentId) {
      setError('Please select a parent Dealer for this Sub Dealer.');
      return;
    }

    try {
      if (isEditMode) {
        const payload = { userType, displayName, mobileNo, email, username };
        if (role === 'ADMIN' && userType === 'Sub Dealer') payload.parentId = parentId;
        await api.put(`/users/sub-user/${editingUserId}`, payload);
        setSuccess('User details updated successfully!');
        resetForm();
      } else {
        const payload = { userType, displayName, mobileNo, email, username, password };
        if (role === 'ADMIN' && userType === 'Sub Dealer') payload.parentId = parentId;
        await api.post('/users/sub-user', payload);
        setSuccess('New user registered successfully!');
        resetForm();
      }
      fetchSubUsers();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to submit form. Please try again.');
    }
  };

  const handleEditClick = (targetUser) => {
    setIsEditMode(true);
    setEditingUserId(targetUser._id);
    setUserType(targetUser.userType || 'Dealer');
    setDisplayName(targetUser.displayName || '');
    setMobileNo(targetUser.mobileNo || '');
    setEmail(targetUser.email || '');
    setUsername(targetUser.username || '');
    setParentId(targetUser.parentId || '');
    setPassword('');
    // Smooth scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleStatus = async (userId) => {
    try {
      const res = await api.delete(`/users/sub-user/${userId}`);
      setSuccess(res.data.message || 'User status updated!');
      fetchSubUsers();
    } catch (err) {
      console.error(err);
      setError('Failed to update status. Please try again.');
    }
  };

  const canManageUser = (targetUser) => {
    if (role !== 'ADMIN') return false;
    const targetUserType = targetUser.userType;
    if (targetUserType === 'Administration') {
      return user?.role === 'partner' && user?.userType !== 'Administration';
    }
    if (targetUser.role === 'partner') {
      return false;
    }
    return true;
  };

  const canDeleteUser = (targetUser) => {
    if (role !== 'ADMIN') return false;
    if (!canManageUser(targetUser)) return false;

    const targetUserType = targetUser.userType || 'Dealer';
    if (targetUserType === 'Dealer' || targetUserType === 'Sub Dealer') {
      return true;
    }
    if (targetUserType === 'Administration') {
      return isFullAdmin;
    }
    return false;
  };

  const handleDeleteUser = async (userId, targetName) => {
    if (window.confirm(`Are you sure you want to permanently delete user "${targetName}"? This will also unassign their devices.`)) {
      try {
        const res = await api.delete(`/users/sub-user/${userId}/permanent`);
        setSuccess(res.data.message || 'User deleted successfully.');
        fetchSubUsers();
      } catch (err) {
        console.error(err);
        setError(err.response?.data?.message || 'Failed to delete user. Please try again.');
      }
    }
  };

  const resetForm = () => {
    setIsEditMode(false);
    setEditingUserId(null);
    setUserType(allowedUserTypes[0] || 'Sub Dealer');
    setDisplayName('');
    setMobileNo('');
    setEmail('');
    setUsername('');
    setPassword('');
    setParentId('');
  };

  // Filter & Search Logic
  const filteredUsers = subUsers.filter(u => {
    // Role filter
    if (roleFilter !== 'ALL') {
      if (roleFilter === 'Administration' && u.userType !== 'Administration') return false;
      if (roleFilter === 'Dealer' && u.userType !== 'Dealer' && u.userType !== '') return false;
      if (roleFilter === 'Sub Dealer' && u.userType !== 'Sub Dealer') return false;
    }
    // Text search
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (u.displayName || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.mobileNo || '').includes(q)
    );
  });

  const displayedUsers = filteredUsers.slice(0, limit);

  // Quick statistics
  const adminCount = subUsers.filter(u => u.userType === 'Administration' || u.role === 'partner').length;
  const dealerCount = subUsers.filter(u => u.userType === 'Dealer' || u.userType === '').length;
  const subDealerCount = subUsers.filter(u => u.userType === 'Sub Dealer').length;
  const activeCount = subUsers.filter(u => u.status !== 'Inactive').length;

  return (
    <div className="user-management-container">
      {/* Top Global Alerts */}
      {error && (
        <div className="alert-message error">
          <span>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>
      )}
      {success && (
        <div className="alert-message success">
          <span>{success}</span>
          <button onClick={() => setSuccess('')} style={{ background: 'none', border: 'none', color: '#15803d', cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* Top Quick Stats Summary Bar */}
      <div className="um-stats-grid">
        <div className="um-stat-card">
          <div className="um-stat-icon blue">
            <FaUsers />
          </div>
          <div className="um-stat-info">
            <span className="um-stat-value">{subUsers.length}</span>
            <span className="um-stat-label">Total Users</span>
          </div>
        </div>

        <div className="um-stat-card">
          <div className="um-stat-icon green">
            <FaCheck />
          </div>
          <div className="um-stat-info">
            <span className="um-stat-value">{activeCount}</span>
            <span className="um-stat-label">Active Users</span>
          </div>
        </div>

        <div className="um-stat-card">
          <div className="um-stat-icon purple">
            <FaUserShield />
          </div>
          <div className="um-stat-info">
            <span className="um-stat-value">{adminCount}</span>
            <span className="um-stat-label">Admins</span>
          </div>
        </div>

        <div className="um-stat-card">
          <div className="um-stat-icon amber">
            <FaStore />
          </div>
          <div className="um-stat-info">
            <span className="um-stat-value">{dealerCount}</span>
            <span className="um-stat-label">Dealers</span>
          </div>
        </div>

        {role === 'ADMIN' && (
          <div className="um-stat-card">
            <div className="um-stat-icon cyan">
              <FaDatabase />
            </div>
            <div className="um-stat-info">
              <span className="um-stat-value">{backups.length}</span>
              <span className="um-stat-label">Backups Available</span>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area: Split layout (Side-by-side) */}
      <div className="layout-split">
        
        {/* ==================================================================
            1. USER DETAILS FORM (Create / Edit User)
            ================================================================== */}
        <div className={`card-panel ${isEditMode ? 'editing-mode' : ''}`}>
          <div className="card-panel-header">
            <div className="panel-header-left">
              <FaUserPlus className="panel-icon" />
              <div>
                <span className="panel-title">{isEditMode ? 'Edit User Details' : 'User Details'}</span>
                <span className="panel-subtitle">({isEditMode ? 'Modify account information' : 'Create & assign new user access'})</span>
              </div>
            </div>

            <div className="panel-header-right">
              {isEditMode ? (
                <div className="edit-indicator-badge">
                  <span>Editing: <strong>{displayName || username}</strong></span>
                  <button type="button" className="edit-cancel-link" onClick={resetForm}>Cancel Edit</button>
                </div>
              ) : (
                <span className="required-note">* All fields required</span>
              )}

            </div>
          </div>

          <div className="card-panel-body">
            <form onSubmit={handleSubmit}>
              <div className="form-grid-responsive">
                {/* User Type */}
                <div className="form-field-group">
                  <label htmlFor="userType">
                    User Type <span className="field-required">*</span>
                  </label>
                  <select
                    id="userType"
                    value={userType}
                    onChange={(e) => { setUserType(e.target.value); setParentId(''); }}
                  >
                    {allowedUserTypes.map((type) => (
                      <option value={type} key={type}>{type}</option>
                    ))}
                  </select>
                </div>

                {/* Parent Dealer (When Sub Dealer) */}
                {role === 'ADMIN' && userType === 'Sub Dealer' && (
                  <div className="form-field-group">
                    <label htmlFor="parentId">
                      Parent Dealer <span className="field-required">*</span>
                    </label>
                    <select
                      id="parentId"
                      value={parentId}
                      onChange={(e) => setParentId(e.target.value)}
                      required
                    >
                      <option value="">-- Select Parent Dealer --</option>
                      {dealers.map((d) => (
                        <option value={d._id} key={d._id}>{d.displayName || d.username}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Display Name */}
                <div className="form-field-group">
                  <label htmlFor="displayName">
                    Display Name / Company <span className="field-required">*</span>
                  </label>
                  <input
                    type="text"
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Ramesh Enterprises"
                    required
                  />
                </div>

                {/* Mobile No */}
                <div className="form-field-group">
                  <label htmlFor="mobileNo">
                    Mobile Number <span className="field-required">*</span>
                  </label>
                  <input
                    type="text"
                    id="mobileNo"
                    value={mobileNo}
                    onChange={(e) => setMobileNo(e.target.value)}
                    placeholder="10-digit mobile number"
                    maxLength={15}
                  />
                </div>

                {/* Email */}
                <div className="form-field-group">
                  <label htmlFor="email">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                  />
                </div>

                {/* Username */}
                <div className="form-field-group">
                  <label htmlFor="username">
                    User ID / Username <span className="field-required">*</span>
                  </label>
                  <input
                    type="text"
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. ramesh@cdb.in"
                    required
                  />
                </div>

                {/* Password (only on add mode) */}
                {!isEditMode && (
                  <div className="form-field-group">
                    <label htmlFor="password">
                      Account Password <span className="field-required">*</span>
                    </label>
                    <input
                      type="password"
                      id="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter strong password"
                      required
                    />
                  </div>
                )}
              </div>

              <div className="form-actions-bar">
                <button type="button" className="btn-reset-form" onClick={resetForm}>
                  <FaTimes /> {isEditMode ? 'Cancel' : 'Reset Form'}
                </button>
                <button type="submit" className="btn-submit-form">
                  {isEditMode ? <><FaCheck /> Update User Details</> : <><FaUserPlus /> Submit & Register User</>}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ==================================================================
            2. USERS LIST DIRECTORY (Full Width, Ample Space, Side Scroller)
            ================================================================== */}
        <div className="card-panel">
          <div className="card-panel-header">
            <div className="panel-header-left">
              <FaList className="panel-icon" />
              <div>
                <span className="panel-title">Users List</span>
                <span className="panel-subtitle">({filteredUsers.length} total records found)</span>
              </div>
            </div>

            {/* Role Filter Pills */}
            <div className="role-filter-pills">
              <button
                type="button"
                className={`role-pill-btn ${roleFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setRoleFilter('ALL')}
              >
                All ({subUsers.length})
              </button>
              {adminCount > 0 && (
                <button
                  type="button"
                  className={`role-pill-btn ${roleFilter === 'Administration' ? 'active' : ''}`}
                  onClick={() => setRoleFilter('Administration')}
                >
                  Admins ({adminCount})
                </button>
              )}
              <button
                type="button"
                className={`role-pill-btn ${roleFilter === 'Dealer' ? 'active' : ''}`}
                onClick={() => setRoleFilter('Dealer')}
              >
                Dealers ({dealerCount})
              </button>
              {subDealerCount > 0 && (
                <button
                  type="button"
                  className={`role-pill-btn ${roleFilter === 'Sub Dealer' ? 'active' : ''}`}
                  onClick={() => setRoleFilter('Sub Dealer')}
                >
                  Sub Dealers ({subDealerCount})
                </button>
              )}
            </div>
          </div>

          <div className="card-panel-body">
            {/* Table Search and Limit Controls */}
            <div className="table-controls-bar">
              <div className="limit-selector">
                <label>Show records:</label>
                <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                  <option value={5}>5 records</option>
                  <option value={10}>10 records</option>
                  <option value={25}>25 records</option>
                  <option value={50}>50 records</option>
                </select>
              </div>

              <div className="search-input-box">
                <div className="search-icon-adornment"><FaSearch /></div>
                <input 
                  type="text" 
                  placeholder="Search user, mobile, email..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button type="button" className="search-clear-btn" onClick={() => setSearch('')} title="Clear search">✕</button>
                )}
              </div>
            </div>

            {/* User Directory Table with Horizontal Scroller */}
            <div className="custom-table-scroller">
              <table className="table-custom">
                <thead>
                  <tr>
                    <th style={{ width: '36px', textAlign: 'center' }}>#</th>
                    <th>User Details</th>
                    <th style={{ width: '105px' }}>Role / Type</th>
                    <th style={{ width: '110px' }}>Mobile No</th>
                    <th style={{ width: '130px' }}>User ID</th>
                    <th style={{ width: '75px', textAlign: 'center' }}>Status</th>
                    <th style={{ width: '175px', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="text-center" style={{ padding: '36px' }}>
                        Loading users directory...
                      </td>
                    </tr>
                  ) : displayedUsers.length > 0 ? (
                    displayedUsers.map((targetUser, index) => {
                      const userInitial = (targetUser.displayName || targetUser.username || 'U').charAt(0).toUpperCase();
                      const isTargetAdmin = targetUser.userType === 'Administration' || targetUser.role === 'partner';
                      const isTargetSubDealer = targetUser.userType === 'Sub Dealer';
                      const avatarClass = isTargetAdmin ? 'admin' : isTargetSubDealer ? 'subdealer' : 'dealer';
                      const typeBadgeClass = isTargetAdmin ? 'admin' : isTargetSubDealer ? 'subdealer' : 'dealer';
                      const isActive = targetUser.status !== 'Inactive';

                      return (
                        <tr key={targetUser._id || `user-${index}`} className={!isActive ? 'row-inactive' : ''}>
                          <td style={{ textAlign: 'center', fontWeight: 600, color: '#94a3b8' }}>{index + 1}</td>
                          
                          {/* User Identity */}
                          <td>
                            <div className="user-identity-cell">
                              <div className={`user-avatar-circle ${avatarClass}`}>
                                {userInitial}
                              </div>
                              <div className="user-names">
                                <span className="user-display-name">{targetUser.displayName || targetUser.username}</span>
                                {targetUser.email && (
                                  <span className="user-sub-email">{targetUser.email}</span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Role / Type */}
                          <td>
                            <span className={`type-badge ${typeBadgeClass}`}>
                              {targetUser.userType || (targetUser.role === 'partner' ? 'Administration' : 'Dealer')}
                            </span>
                          </td>

                          {/* Mobile No */}
                          <td>
                            <span style={{ fontWeight: 600, color: '#334155' }}>
                              {targetUser.mobileNo || '-'}
                            </span>
                          </td>

                          {/* Username / User ID */}
                          <td>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0f172a', background: '#f8fafc', padding: '3px 6px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                              {targetUser.username || '-'}
                            </span>
                          </td>

                          {/* Status */}
                          <td>
                            <span className={`status-pill ${isActive ? 'active' : 'inactive'}`}>
                              <span className="status-dot"></span>
                              {isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>

                          {/* Actions (Pill buttons with ample space, never overlap) */}
                          <td style={{ textAlign: 'center' }}>
                            <div className="action-buttons-wrap" style={{ justifyContent: 'center' }}>
                              {canManageUser(targetUser) && (
                                <>
                                  <button 
                                    className="action-pill-btn edit" 
                                    title="Edit User"
                                    onClick={() => handleEditClick(targetUser)}
                                  >
                                    <FaEdit /> <span>Edit</span>
                                  </button>
                                  <button 
                                    className={`action-pill-btn ${isActive ? 'toggle-active' : 'toggle-inactive'}`} 
                                    title={isActive ? 'Deactivate User' : 'Activate User'}
                                    onClick={() => handleToggleStatus(targetUser._id)}
                                  >
                                    {isActive ? <><FaCheck /> <span>Active</span></> : <><FaTimes /> <span>Inactive</span></>}
                                  </button>
                                </>
                              )}
                              {canDeleteUser(targetUser) && (
                                <button 
                                  className="action-pill-btn delete" 
                                  title="Delete User"
                                  onClick={() => handleDeleteUser(targetUser._id, targetUser.displayName || targetUser.username)}
                                >
                                  <FaTrash /> <span>Delete</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="text-center" style={{ padding: '36px' }}>
                        No user records found matching the filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: '14px', fontSize: '12px', color: '#64748b', fontWeight: 500, display: 'flex', justifyContent: 'space-between' }}>
              <span>Showing 1 to {displayedUsers.length} of {filteredUsers.length} matching records</span>
              <span>Total Database Users: {subUsers.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================
          3. AUTOMATED DATABASE BACKUPS & 1-CLICK RESTORE (ADMIN ONLY)
             With horizontal side-scroller & vertical scroller
          ================================================================== */}
      {role === 'ADMIN' && (
        <div className="card-panel" style={{ marginTop: '10px' }}>
          <div className="card-panel-header backup-card-header">
            <div className="backup-title-group">
              <FaDatabase style={{ color: '#38bdf8', fontSize: '20px' }} />
              <div>
                <h3 className="backup-header-title">Automated Weekly & Monthly Backups & 1-Click Restore</h3>
                <p className="backup-header-desc">Full snapshot of all 10 MongoDB collections (users, devices, requests, transactions, invoices, audit logs)</p>
              </div>
            </div>

            <button
              onClick={handleCreateBackup}
              disabled={creatingBackup}
              className="btn-create-backup"
            >
              <FaDatabase /> {creatingBackup ? 'Creating Snapshot...' : 'Create Backup Now'}
            </button>
          </div>

          <div className="card-panel-body">
            <div className="backup-notice-box">
              📅 <strong>Automated Schedule:</strong> Database backups are automatically created every week (<code>smt_backup_weekly_*</code>) and on the 1st of every month (<code>smt_backup_monthly_*</code>). You can download backup snapshots (<code>.json.gz</code>) to your computer for safe keeping or restore database state anytime.
            </div>

            {/* Side-scroller + Vertical scroller wrapper */}
            <div className="backup-scroller">
              <table className="backup-table">
                <thead>
                  <tr>
                    <th style={{ width: '50px', textAlign: 'center' }}>#</th>
                    <th style={{ minWidth: '320px' }}>Backup File Name</th>
                    <th style={{ minWidth: '180px' }}>Created Timestamp</th>
                    <th style={{ minWidth: '110px' }}>File Size</th>
                    <th style={{ minWidth: '220px', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backupsLoading ? (
                    <tr>
                      <td colSpan={5} className="text-center" style={{ padding: '30px' }}>Loading backups repository...</td>
                    </tr>
                  ) : backups.length > 0 ? (
                    backups.map((b, idx) => (
                      <tr key={b.filename}>
                        <td style={{ textAlign: 'center', fontWeight: 600, color: '#94a3b8' }}>{idx + 1}</td>
                        <td>
                          <span className="backup-filename-badge">
                            📦 {b.filename}
                          </span>
                        </td>
                        <td style={{ color: '#475569', fontWeight: 500 }}>
                          {new Date(b.createdAt).toLocaleString('en-IN')}
                        </td>
                        <td>
                          <span className="backup-size-pill">
                            {b.sizeFormatted || `${(b.sizeBytes / 1024).toFixed(1)} KB`}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                            <button 
                              onClick={() => handleDownloadBackup(b.filename)} 
                              style={{ 
                                backgroundColor: '#10b981', color: '#fff', padding: '6px 14px', 
                                borderRadius: '20px', border: 'none', cursor: 'pointer', 
                                display: 'inline-flex', alignItems: 'center', gap: '6px', 
                                fontWeight: 650, fontSize: '11.5px', boxShadow: '0 1px 3px rgba(16, 185, 129, 0.3)'
                              }}
                              title="Download backup file to your computer"
                            >
                              <FaDownload /> Download
                            </button>
                            <button 
                              onClick={() => handleRestoreBackup(b.filename)} 
                              style={{ 
                                backgroundColor: '#f59e0b', color: '#fff', padding: '6px 14px', 
                                borderRadius: '20px', border: 'none', cursor: 'pointer', 
                                display: 'inline-flex', alignItems: 'center', gap: '6px', 
                                fontWeight: 650, fontSize: '11.5px', boxShadow: '0 1px 3px rgba(245, 158, 11, 0.3)'
                              }}
                              title="Restore MongoDB database from this snapshot"
                            >
                              <FaRedo /> Restore
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="text-center" style={{ padding: '30px', color: '#64748b' }}>
                        No backup files created yet. Click "Create Backup Now" above to make the first snapshot.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
