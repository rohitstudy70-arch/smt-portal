import { useState } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { FaBars, FaBell, FaUser, FaCaretDown, FaSignOutAlt } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import './Header.css';

const Header = () => {
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const location = useLocation();

  const handleLogout = () => {
    logout();
  };

  // Generate breadcrumbs based on pathname
  const getBreadcrumbs = () => {
    const path = location.pathname;
    const view = new URLSearchParams(location.search).get('view') || 'dashboard';
    const portalLabels = {
      dashboard: 'Dashboard',
      dealers: 'Dealer Management',
      subdealers: 'Sub Dealer Management',
      users: 'User Management',
      devices: 'Device Management',
      customers: 'Customer Database',
      reports: 'Reports',
      profile: 'My Profile',
      mydevices: 'My Devices',
      renewals: 'Renewal Requests',
    };

    if (path === '/dashboard') {
      return (
        <div className="breadcrumbs">
          <Link to="/dashboard">Home</Link>
          <span>/</span>
          <span className="active-crumb">{portalLabels[view] || 'Dashboard'}</span>
        </div>
      );
    }
    if (path === '/invoice-generator') {
      return (
        <div className="breadcrumbs">
          <Link to="/dashboard">Home</Link>
          <span>/</span>
          <span className="active-crumb">Invoice Generator</span>
        </div>
      );
    }
    if (path === '/service-requests/activation') {
      return (
        <div className="breadcrumbs">
          <Link to="/dashboard">Home</Link>
          <span>/</span>
          <span>Activation Request</span>
          <span>/</span>
          <span className="active-crumb">Activation Requests List</span>
        </div>
      );
    }
    if (path === '/account/edit-profile') {
      return (
        <div className="breadcrumbs">
          <Link to="/dashboard">Home</Link>
          <span>/</span>
          <span className="active-crumb">Edit Profile</span>
        </div>
      );
    }
    if (path === '/account/change-password') {
      return (
        <div className="breadcrumbs">
          <Link to="/dashboard">Home</Link>
          <span>/</span>
          <span className="active-crumb">Password Reset</span>
        </div>
      );
    }
    if (path === '/wallet-system') {
      return (
        <div className="breadcrumbs">
          <Link to="/dashboard">Home</Link>
          <span>/</span>
          <span className="active-crumb">Wallet System</span>
        </div>
      );
    }
    if (path === '/user-management') {
      return (
        <div className="breadcrumbs">
          <Link to="/dashboard">Home</Link>
          <span>/</span>
          <span>User Management</span>
          <span>/</span>
          <span className="active-crumb">Create User</span>
        </div>
      );
    }
    if (path === '/device-management') {
      return (
        <div className="breadcrumbs">
          <Link to="/dashboard">Home</Link>
          <span>/</span>
          <span className="active-crumb">Device Assignment</span>
          <span>/</span>
        </div>
      );
    }

    if (path === '/add-device') {
      return (
        <div className="breadcrumbs">
          <Link to="/dashboard">Home</Link>
          <span>/</span>
          <span className="active-crumb">Add Device</span>
        </div>
      );
    }

    if (path === '/certificates') {
      return (
        <div className="breadcrumbs">
          <Link to="/dashboard">Home</Link>
          <span>/</span>
          <span className="active-crumb">Certificates</span>
        </div>
      );
    }

    return (
      <div className="breadcrumbs">
        <Link to="/dashboard">Home</Link>
      </div>
    );
  };

  const [globalSearch, setGlobalSearch] = useState('');
  const navigate = useNavigate();

  const handleGlobalSearchSubmit = (e) => {
    e.preventDefault();
    if (globalSearch.trim()) {
      navigate(`/dashboard?view=devices&search=${encodeURIComponent(globalSearch.trim())}`);
      setGlobalSearch('');
    }
  };

  // Determine if file upload bar should be shown (matches screenshot for userdashboard page)
  const showUpload = false;

  return (
    <div className="header-wrapper">
      <div className="header">
        <div className="header-left">
          <FaBars className="menu-toggle" />
          <div className="balance-info">
            <div className="bal-avail">
              Available Balance : <span>{user?.availableBalance?.toFixed(2) || '0.00'}</span>
            </div>
            <div className="bal-overdrawn">
              Over Drawn Amount : <span>{user?.overDrawnAmount?.toFixed(2) || '0.00'}</span>
            </div>
          </div>
        </div>

        <div className="header-right">
          <form className="search-box" onSubmit={handleGlobalSearchSubmit}>
            <input 
              type="text" 
              placeholder="Customer / IMEI / ICCID / Serial No" 
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
            />
            <button type="submit">Search</button>
          </form>

          <div className="notification-bell">
            <FaBell />
          </div>

          <div className="profile-menu" onClick={() => setDropdownOpen(!dropdownOpen)}>
            <FaUser />
            <span>{user?.username || 'User'}</span>
            <FaCaretDown />

            {dropdownOpen && (
              <ul className="profile-dropdown">
                <li onClick={handleLogout}>
                  <FaSignOutAlt style={{ marginRight: '5px' }} /> Logout
                </li>
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="breadcrumb-bar">
        {getBreadcrumbs()}

        {showUpload && (
          <div className="upload-bar">
            <input type="file" id="dashboard-file" />
            <button onClick={() => alert('File upload simulated successfully!')}>Upload</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Header;
