import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  FaTachometerAlt, 
  FaClipboardList, 
  FaCog, 
  FaWallet, 
  FaUsers, 
  FaMobileAlt, 
  FaCertificate, 
  FaTools, 
  FaStore, 
  FaMoneyBillWave,
  FaChevronRight,
  FaSearch,
  FaFileInvoiceDollar
} from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import './Sidebar.css';

const Sidebar = () => {
  const { user } = useAuth();
  const [serviceRequestsOpen, setServiceRequestsOpen] = useState(true);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(true);
  const [subdealerPlansOpen, setSubdealerPlansOpen] = useState(true);
  const location = useLocation();

  const toggleServiceRequests = () => {
    setServiceRequestsOpen(!serviceRequestsOpen);
  };

  const isServiceRequestsActive = location.pathname.startsWith('/service-requests');

  return (
    <div className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-logo-container">
          <span className="brand-logo-text">AE</span>
        </div>
        <div className="brand-title-group">
          <h2>Arshi Enterprises</h2>
          <span>CUSTOMER SELF SERVICE</span>
        </div>
      </div>

      <ul className="sidebar-menu">
        <li className={`sidebar-menu-item ${location.pathname === '/dashboard' ? 'active' : ''}`}>
          <NavLink to="/dashboard">
            <FaTachometerAlt className="menu-icon" />
            <span className="menu-text">Dashboard</span>
          </NavLink>
        </li>

        {user?.userType === 'End Customer' ? (
          <>
            <li className={`sidebar-menu-item ${location.pathname === '/service-requests/common-layer' ? 'active' : ''}`}>
              <NavLink to="/service-requests/common-layer">
                <FaFileInvoiceDollar className="menu-icon" />
                <span className="menu-text">My Invoices</span>
              </NavLink>
            </li>

            <li className={`sidebar-menu-item ${location.pathname.startsWith('/account') ? 'active' : ''}`}>
              <div className="menu-link" onClick={() => setAccountSettingsOpen(!accountSettingsOpen)}>
                <FaCog className="menu-icon" />
                <span className="menu-text">Account Settings</span>
                <FaChevronRight className={`menu-arrow ${accountSettingsOpen ? 'open' : ''}`} />
              </div>
              <ul className={`sidebar-submenu ${accountSettingsOpen ? 'open' : ''}`}>
                <li className={location.pathname === '/account/edit-profile' ? 'active' : ''}>
                  <NavLink to="/account/edit-profile">Edit Profile</NavLink>
                </li>
                <li className={location.pathname === '/account/change-password' ? 'active' : ''}>
                  <NavLink to="/account/change-password">Change Password</NavLink>
                </li>
              </ul>
            </li>
          </>
        ) : (
          <>
            <li className={`sidebar-menu-item ${location.pathname === '/invoice-generator' ? 'active' : ''}`}>
              <NavLink to="/invoice-generator">
                <FaFileInvoiceDollar className="menu-icon" />
                <span className="menu-text">Invoice Generator</span>
              </NavLink>
            </li>

            <li className={`sidebar-menu-item ${isServiceRequestsActive ? 'active' : ''}`}>
              <div className="menu-link" onClick={toggleServiceRequests}>
                <FaClipboardList className="menu-icon" />
                <span className="menu-text">Service Requests</span>
                <FaChevronRight className={`menu-arrow ${serviceRequestsOpen ? 'open' : ''}`} />
              </div>
              <ul className={`sidebar-submenu ${serviceRequestsOpen ? 'open' : ''}`}>
                <li className={location.pathname === '/service-requests/activation' ? 'active' : ''}>
                  <NavLink to="/service-requests/activation">Activation Requests</NavLink>
                </li>
                <li className={location.pathname === '/service-requests/common-layer' ? 'active' : ''}>
                  <NavLink to="/service-requests/common-layer">Common Layer Requests</NavLink>
                </li>
              </ul>
            </li>

            <li className={`sidebar-menu-item ${location.pathname.startsWith('/account') ? 'active' : ''}`}>
              <div className="menu-link" onClick={() => setAccountSettingsOpen(!accountSettingsOpen)}>
                <FaCog className="menu-icon" />
                <span className="menu-text">Account Settings</span>
                <FaChevronRight className={`menu-arrow ${accountSettingsOpen ? 'open' : ''}`} />
              </div>
              <ul className={`sidebar-submenu ${accountSettingsOpen ? 'open' : ''}`}>
                <li className={location.pathname === '/account/edit-profile' ? 'active' : ''}>
                  <NavLink to="/account/edit-profile">Edit Profile</NavLink>
                </li>
                <li className={location.pathname === '/account/change-password' ? 'active' : ''}>
                  <NavLink to="/account/change-password">Change Password</NavLink>
                </li>
              </ul>
            </li>

            <li className={`sidebar-menu-item ${location.pathname === '/wallet-system' ? 'active' : ''}`}>
              <NavLink to="/wallet-system">
                <FaWallet className="menu-icon" />
                <span className="menu-text">Wallet System</span>
              </NavLink>
            </li>

            <li className={`sidebar-menu-item ${location.pathname === '/user-management' ? 'active' : ''}`}>
              <NavLink to="/user-management">
                <FaUsers className="menu-icon" />
                <span className="menu-text">User Management</span>
              </NavLink>
            </li>

            <li className={`sidebar-menu-item ${location.pathname === '/device-management' ? 'active' : ''}`}>
              <NavLink to="/device-management">
                <FaMobileAlt className="menu-icon" />
                <span className="menu-text">Device Management</span>
              </NavLink>
            </li>

            <li className={`sidebar-menu-item ${location.pathname === '/iccid-search' ? 'active' : ''}`}>
              <NavLink to="/iccid-search">
                <FaSearch className="menu-icon" />
                <span className="menu-text">ICCID Search</span>
              </NavLink>
            </li>

            <li className={`sidebar-menu-item ${location.pathname === '/certificates' ? 'active' : ''}`}>
              <NavLink to="/certificates">
                <FaCertificate className="menu-icon" />
                <span className="menu-text">Certificates</span>
              </NavLink>
            </li>

            <li className={`sidebar-menu-item ${location.pathname === '/config-360' ? 'active' : ''}`}>
              <NavLink to="/config-360">
                <FaTools className="menu-icon" />
                <span className="menu-text">Config 360v2</span>
              </NavLink>
            </li>

            <li className={`sidebar-menu-item ${location.pathname.startsWith('/subdealer-plans') ? 'active' : ''}`}>
              <div className="menu-link" onClick={() => setSubdealerPlansOpen(!subdealerPlansOpen)}>
                <FaStore className="menu-icon" />
                <span className="menu-text">Subdealers Plans</span>
                <FaChevronRight className={`menu-arrow ${subdealerPlansOpen ? 'open' : ''}`} />
              </div>
              <ul className={`sidebar-submenu ${subdealerPlansOpen ? 'open' : ''}`}>
                <li className={location.pathname === '/subdealer-plans/sim-activation' ? 'active' : ''}>
                  <NavLink to="/subdealer-plans/sim-activation">SIM Activation Plans</NavLink>
                </li>
                <li className={location.pathname === '/subdealer-plans/cla-plans' ? 'active' : ''}>
                  <NavLink to="/subdealer-plans/cla-plans">CLA Plans</NavLink>
                </li>
              </ul>
            </li>

            <li className={`sidebar-menu-item ${location.pathname === '/pay-subdealer' ? 'active' : ''}`}>
              <NavLink to="/pay-subdealer">
                <FaMoneyBillWave className="menu-icon" />
                <span className="menu-text">Pay to Subdealer</span>
              </NavLink>
            </li>
          </>
        )}
      </ul>
    </div>
  );
};

export default Sidebar;
