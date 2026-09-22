import { useState, useEffect } from 'react';
import { FaUserPlus, FaUser, FaList, FaEdit, FaCheck, FaTimes, FaSearch, FaTrash, FaDatabase, FaDownload, FaRedo } from 'react-icons/fa';
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
  
  // Filters State
  const [limit, setLimit] = useState(5);
  const [search, setSearch] = useState('');

  const fetchSubUsers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/users/sub-users');
      setSubUsers(res.data);
      setLoading(false);
    } catch (err) {
      console.error(err);
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
    }
  }, [role]);

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
      setError(err.response?.data?.message || 'Failed to restore database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubUsers();
    if (role === 'ADMIN') {
      api.get('/users/sub-users').then((res) => {
        const dealerList = res.data.filter(
          (u) => u.userType === 'Dealer' || u.userType === '' || u.role === 'partner'
        );
        setDealers(dealerList);
      }).catch(console.error);
    }
  }, []);

  useEffect(() => {
    if (allowedUserTypes.length > 0 && !allowedUserTypes.includes(userType)) {
      setUserType(allowedUserTypes[0]);
    }
  }, [allowedUserTypes, userType]);

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
        // Edit Mode
        const payload = { userType, displayName, mobileNo, email, username };
        if (role === 'ADMIN' && userType === 'Sub Dealer') payload.parentId = parentId;
        await api.put(`/users/sub-user/${editingUserId}`, payload);
        setSuccess('Sub-user updated successfully!');
        resetForm();
      } else {
        // Add Mode
        const payload = { userType, displayName, mobileNo, email, username, password };
        if (role === 'ADMIN' && userType === 'Sub Dealer') payload.parentId = parentId;
        await api.post('/users/sub-user', payload);
        setSuccess('New sub-user created successfully!');
        resetForm();
      }
      fetchSubUsers();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to submit form. Please try again.');
    }
  };

  const handleEditClick = (user) => {
    setIsEditMode(true);
    setEditingUserId(user._id);
    setUserType(user.userType || 'View Access User');
    setDisplayName(user.displayName || '');
    setMobileNo(user.mobileNo || '');
    setEmail(user.email || '');
    setUsername(user.username || '');
    setParentId(user.parentId || '');
    // Password isn't edited here
    setPassword('');
  };

  const handleToggleStatus = async (userId) => {
    try {
      const res = await api.delete(`/users/sub-user/${userId}`);
      setSuccess(res.data.message || 'User status updated!');
      fetchSubUsers();
    } catch (err) {
      console.error(err);
      alert('Failed to update status. Please try again.');
    }
  };

  const canManageUser = (targetUser) => {
    if (role !== 'ADMIN') return false;
    const targetUserType = targetUser.userType;
    if (targetUserType === 'Administration') {
      // Only full admin can manage Administration users
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
    if (targetUserType === 'Dealer') {
      return true;
    }
    if (targetUserType === 'Sub Dealer') {
      return true;
    }
    if (targetUserType === 'Administration') {
      return isFullAdmin;
    }
    return false;
  };

  const handleDeleteUser = async (userId, displayName) => {
    if (window.confirm(`Are you sure you want to permanently delete user "${displayName}"? This will also unassign their devices.`)) {
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
  const filteredUsers = subUsers.filter(user => {
    const query = search.toLowerCase();
    return (
      user.displayName?.toLowerCase().includes(query) ||
      user.username?.toLowerCase().includes(query) ||
      user.email?.toLowerCase().includes(query) ||
      user.mobileNo?.includes(query)
    );
  }).slice(0, limit);

  return (
    <div className="user-management-container">
      <div className="layout-columns">
        {/* Left Column: User Details Form */}
        <div className="form-column">
          <div className="card-panel">
            <div className="card-panel-header">
              <FaUserPlus className="panel-icon" />
              <span className="panel-title">USER DETAILS</span>
              <span className="required-note">Note: All fields are required.</span>
            </div>
            
            <div className="card-panel-body">
              {error && <div className="alert-message error">{error}</div>}
              {success && <div className="alert-message success">{success}</div>}
              
              <form onSubmit={handleSubmit} className="form-horizontal">
                <div className="form-group-horizontal">
                  <label htmlFor="userType">User Type</label>
                  <div className="input-wrapper">
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
                </div>

                {role === 'ADMIN' && userType === 'Sub Dealer' && (
                  <div className="form-group-horizontal">
                    <label htmlFor="parentId">Dealer / Parent *</label>
                    <div className="input-wrapper">
                      <select
                        id="parentId"
                        value={parentId}
                        onChange={(e) => setParentId(e.target.value)}
                        required
                      >
                        <option value="">-- Select Dealer --</option>
                        {dealers.map((d) => (
                          <option value={d._id} key={d._id}>{d.displayName || d.username}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                
                <div className="form-group-horizontal">
                  <label htmlFor="displayName">Display Name</label>
                  <div className="input-wrapper">
                    <input
                      type="text"
                      id="displayName"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Display Name"
                    />
                  </div>
                </div>
                
                <div className="form-group-horizontal">
                  <label htmlFor="mobileNo">Mobile No</label>
                  <div className="input-wrapper">
                    <input
                      type="text"
                      id="mobileNo"
                      value={mobileNo}
                      onChange={(e) => setMobileNo(e.target.value)}
                      placeholder="Mobile No"
                    />
                  </div>
                </div>
                
                <div className="form-group-horizontal">
                  <label htmlFor="email">Email</label>
                  <div className="input-wrapper">
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email ID"
                    />
                  </div>
                </div>
                
                <div className="form-group-horizontal">
                  <label htmlFor="username">Username</label>
                  <div className="input-wrapper">
                    <input
                      type="text"
                      id="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter Username"
                    />
                  </div>
                </div>
                
                {!isEditMode && (
                  <div className="form-group-horizontal">
                    <label htmlFor="password">Password</label>
                    <div className="input-wrapper">
                      <input
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter Password"
                      />
                    </div>
                  </div>
                )}
                
                <div className="form-actions-horizontal">
                  <button type="button" className="btn-cancel" onClick={resetForm}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-submit">
                    {isEditMode ? 'Update' : 'Submit'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Right Column: Users List */}
        <div className="list-column">
          <div className="card-panel">
            <div className="card-panel-header">
              <FaList className="panel-icon" />
              <span className="panel-title">USERS LIST</span>
            </div>
            
            <div className="card-panel-body">
              {/* Filters Bar */}
              <div className="table-filters-bar">
                <div className="filter-item">
                  <label>Show</label>
                  <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                  </select>
                </div>
                
                <div className="search-input-group">
                  <input 
                    type="text" 
                    placeholder="Search..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <button type="button"><FaSearch /></button>
                </div>
              </div>

              {/* Table Container */}
              <div className="table-responsive">
                <table className="table-custom">
                  <thead>
                    <tr>
                      <th style={{ width: '60px' }}>Sl No.</th>
                      <th>User</th>
                      <th>Type</th>
                      <th>Mobile No</th>
                      <th>User ID</th>
                      <th style={{ width: '100px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="text-center">Loading users list...</td>
                      </tr>
                    ) : filteredUsers.length > 0 ? (
                      filteredUsers.map((user, index) => (
                        <tr key={user._id || `user-${index}`} className={user.status === 'Inactive' ? 'row-inactive' : ''}>
                          <td>{index + 1}</td>
                          <td className="text-semibold">{user.displayName || user.username}</td>
                          <td>{user.userType || 'N/A'}</td>
                          <td>{user.mobileNo || '-'}</td>
                          <td>{user.username || '-'}</td>
                          <td>
                            <div className="action-buttons">
                              {canManageUser(user) && (
                                <>
                                  <button 
                                    className="btn-action edit" 
                                    title="Edit User"
                                    onClick={() => handleEditClick(user)}
                                  >
                                    <FaEdit />
                                  </button>
                                  <button 
                                    className={`btn-action status ${user.status === 'Active' ? 'active' : 'inactive'}`} 
                                    title={user.status === 'Active' ? 'Deactivate User' : 'Activate User'}
                                    onClick={() => handleToggleStatus(user._id)}
                                  >
                                    {user.status === 'Active' ? <FaCheck /> : <FaTimes />}
                                  </button>
                                </>
                              )}
                              {canDeleteUser(user) && (
                                <button 
                                  className="btn-action delete" 
                                  title="Delete User"
                                  onClick={() => handleDeleteUser(user._id, user.displayName || user.username)}
                                >
                                  <FaTrash />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="text-center">No user records found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="table-info-row">
                Showing 1 to {filteredUsers.length} of {filteredUsers.length} records
              </div>
            </div>
          </div>

          {role === 'ADMIN' && (
            <div className="card shadow-sm mt-4" style={{ marginTop: '24px' }}>
              <div className="card-header bg-dark text-white d-flex justify-content-between align-items-center" style={{ backgroundColor: '#1e293b', color: '#fff', padding: '14px 20px', borderRadius: '8px 8px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h5 className="mb-0 d-flex align-items-center gap-2" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', fontWeight: 600 }}>
                  <FaDatabase style={{ color: '#38bdf8' }} /> Automated Monthly Database Backups & 1-Click Restore
                </h5>
                <button
                  className="btn btn-primary btn-sm d-flex align-items-center gap-1"
                  onClick={handleCreateBackup}
                  disabled={creatingBackup}
                  style={{ backgroundColor: '#0284c7', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <FaDatabase /> {creatingBackup ? 'Creating Backup...' : 'Create Backup Now'}
                </button>
              </div>
              <div className="card-body" style={{ padding: '20px', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '0 0 8px 8px' }}>
                <p className="text-muted small mb-3" style={{ color: '#64748b', fontSize: '13px', marginBottom: '16px' }}>
                  Automated monthly database snapshots are generated on the 1st of every month. You can download compressed backup files (`.json.gz`) directly to your computer or restore database state anytime.
                </p>
                
                <div className="table-responsive">
                  <table className="user-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Backup File Name</th>
                        <th>Created Date</th>
                        <th>File Size</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backupsLoading ? (
                        <tr><td colSpan={5} className="text-center">Loading backups list...</td></tr>
                      ) : backups.length > 0 ? (
                        backups.map((b, idx) => (
                          <tr key={b.filename}>
                            <td>{idx + 1}</td>
                            <td className="text-semibold" style={{ fontWeight: 600, color: '#0f172a' }}>{b.filename}</td>
                            <td>{new Date(b.createdAt).toLocaleString('en-IN')}</td>
                            <td><span className="badge" style={{ backgroundColor: '#e2e8f0', color: '#334155', padding: '4px 8px', borderRadius: '4px', fontWeight: 600 }}>{b.sizeFormatted}</span></td>
                            <td style={{ textAlign: 'right' }}>
                              <div className="action-buttons" style={{ justifyContent: 'flex-end', display: 'flex', gap: '8px' }}>
                                <button
                                  className="btn-action edit"
                                  title="Download Backup"
                                  onClick={() => handleDownloadBackup(b.filename)}
                                  style={{ backgroundColor: '#10b981', color: '#fff', padding: '6px 12px', borderRadius: '4px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}
                                >
                                  <FaDownload /> Download
                                </button>
                                <button
                                  className="btn-action delete"
                                  title="Restore Database"
                                  onClick={() => handleRestoreBackup(b.filename)}
                                  style={{ backgroundColor: '#f59e0b', color: '#fff', padding: '6px 12px', borderRadius: '4px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}
                                >
                                  <FaRedo /> Restore
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan={5} className="text-center" style={{ padding: '20px', color: '#64748b' }}>No backup files created yet. Click "Create Backup Now" to make the first snapshot.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
