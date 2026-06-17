import { useState, useEffect } from 'react';
import { FaUserPlus, FaUser, FaList, FaEdit, FaCheck, FaTimes, FaSearch } from 'react-icons/fa';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import './UserManagement.css';

const getRole = (user) => {
  if (user?.role === 'partner') return 'ADMIN';
  if (user?.userType === 'Sub Dealer') return 'SUB_DEALER';
  if (user?.userType === 'End Customer') return 'CUSTOMER';
  return 'DEALER';
};

const userTypesByRole = {
  ADMIN: ['Dealer', 'Sub Dealer', 'End Customer'],
  DEALER: ['Sub Dealer', 'End Customer'],
  SUB_DEALER: ['End Customer'],
};

const UserManagement = () => {
  const { user } = useAuth();
  const role = getRole(user);
  const allowedUserTypes = userTypesByRole[role] || [];
  const [subUsers, setSubUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Form State
  const [userType, setUserType] = useState(allowedUserTypes[0] || 'End Customer');
  const [displayName, setDisplayName] = useState('');
  const [mobileNo, setMobileNo] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
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

  useEffect(() => {
    fetchSubUsers();
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

    try {
      if (isEditMode) {
        // Edit Mode
        const res = await api.put(`/users/sub-user/${editingUserId}`, {
          userType,
          displayName,
          mobileNo,
          email
        });
        setSuccess('Sub-user updated successfully!');
        resetForm();
      } else {
        // Add Mode
        const res = await api.post('/users/sub-user', {
          userType,
          displayName,
          mobileNo,
          email,
          username,
          password
        });
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

  const resetForm = () => {
    setIsEditMode(false);
    setEditingUserId(null);
    setUserType(allowedUserTypes[0] || 'End Customer');
    setDisplayName('');
    setMobileNo('');
    setEmail('');
    setUsername('');
    setPassword('');
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
                      onChange={(e) => setUserType(e.target.value)}
                    >
                      {allowedUserTypes.map((type) => (
                        <option value={type} key={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
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
                      disabled={isEditMode} // Cannot edit username once created
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
                      <th>Email ID</th>
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
                        <tr key={user._id || index} className={user.status === 'Inactive' ? 'row-inactive' : ''}>
                          <td>{index + 1}</td>
                          <td className="text-semibold">{user.displayName || user.username}</td>
                          <td>{user.userType || 'N/A'}</td>
                          <td>{user.mobileNo || '-'}</td>
                          <td>{user.email || '-'}</td>
                          <td>
                            <div className="action-buttons">
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
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
