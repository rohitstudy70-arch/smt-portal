import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PortalProvider } from './context/PortalContext';
import Login from './components/Login/Login';
import CustomerDevicePortal from './components/Portal/CustomerDevicePortal';
import ActivationRequests from './components/ServiceRequests/ActivationRequests';
import Layout from './components/Layout/Layout';
import ChangePassword from './components/AccountSettings/ChangePassword';
import EditProfile from './components/AccountSettings/EditProfile';
import UserManagement from './components/UserManagement/UserManagement';
import DeviceManagement from './components/DeviceManagement/DeviceManagement';
import AddDevice from './components/DeviceManagement/AddDevice';
import AddProduct from './components/ProductManagement/AddProduct';
import Certificates from './components/Certificates/Certificates';
import InvoiceGenerator from './components/InvoiceGenerator/InvoiceGenerator';
import ProformaInvoice from './components/ProformaInvoice/ProformaInvoice';
import IccidSearch from './components/IccidSearch/IccidSearch';
import DueDashboard from './components/DueDashboard/DueDashboard';
import RenewalDueManagement from './components/RenewalDueManagement/RenewalDueManagement';

const getRole = (user) => {
  if (user?.role === 'partner') return 'ADMIN';
  if (user?.userType === 'Administration') return 'ADMIN';
  if (user?.userType === 'Sub Dealer') return 'SUB_DEALER';
  return 'DEALER';
};

const operationsRoles = ['ADMIN', 'DEALER', 'SUB_DEALER'];

// Protected Route wrapper component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, checkingAuth, user } = useAuth();

  if (checkingAuth) {
    return <div style={{ padding: '20px', textAlign: 'center', fontSize: '14px', color: '#666' }}>Checking login session...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(getRole(user))) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#0b0f19',
        color: '#f8fafc',
        fontFamily: "'Outfit', 'Inter', system-ui, -apple-system, sans-serif",
        textAlign: 'center',
        padding: '2rem',
        boxSizing: 'border-box',
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '3rem 2rem',
          maxWidth: '480px',
          width: '100%',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.5rem',
            boxShadow: '0 0 20px rgba(239, 68, 68, 0.15)',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h1 style={{
            fontSize: '2rem',
            fontWeight: '700',
            margin: '0 0 0.75rem 0',
            color: '#f8fafc',
            letterSpacing: '-0.025em',
          }}>
            Access Denied
          </h1>
          <p style={{
            fontSize: '0.95rem',
            color: '#94a3b8',
            lineHeight: '1.6',
            margin: '0 0 2rem 0',
          }}>
            You do not have permission to access this page. Please contact your administrator if you believe this is an error.
          </p>
          <a href="/dashboard" style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            textDecoration: 'none',
            fontWeight: '600',
            fontSize: '0.95rem',
            padding: '0.75rem 1.75rem',
            borderRadius: '8px',
            transition: 'background-color 0.2s',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)',
            border: 'none',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.target.style.backgroundColor = '#1d4ed8' }}
          onMouseLeave={(e) => { e.target.style.backgroundColor = '#2563eb' }}
          >
            Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return children;
};

function App() {
  return (
    <AuthProvider>
      <PortalProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <Layout>
                  <CustomerDevicePortal />
                </Layout>
              </ProtectedRoute>
            } 
          />

          <Route
            path="/invoice-generator"
            element={
              <ProtectedRoute>
                <Layout>
                  <InvoiceGenerator />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/invoice/:invoiceId"
            element={
              <ProtectedRoute>
                <Layout>
                  <ProformaInvoice />
                </Layout>
              </ProtectedRoute>
            }
          />
          
          <Route 
            path="/service-requests/activation" 
            element={
              <ProtectedRoute>
                <Layout>
                  <ActivationRequests />
                </Layout>
              </ProtectedRoute>
            } 
          />
          

          
          <Route 
            path="/account/change-password" 
            element={
              <ProtectedRoute>
                <Layout>
                  <ChangePassword />
                </Layout>
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/account/edit-profile" 
            element={
              <ProtectedRoute>
                <Layout>
                  <EditProfile />
                </Layout>
              </ProtectedRoute>
            } 
          />


          
          <Route 
            path="/user-management" 
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'DEALER']}>
                <Layout>
                  <UserManagement />
                </Layout>
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/due-dashboard" 
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'DEALER']}>
                <Layout>
                  <DueDashboard />
                </Layout>
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/renewal-due-management" 
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <Layout>
                  <RenewalDueManagement />
                </Layout>
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/device-management" 
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'DEALER']}>
                <Layout>
                  <DeviceManagement />
                </Layout>
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/add-device" 
            element={
              <ProtectedRoute allowedRoles={operationsRoles}>
                <Layout>
                  <AddDevice />
                </Layout>
              </ProtectedRoute>
            } 
          />

          <Route
            path="/add-product"
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'DEALER']}>
                <Layout>
                  <AddProduct />
                </Layout>
              </ProtectedRoute>
            }
          />



          <Route 
            path="/certificates" 
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'SUB_DEALER']}>
                <Layout>
                  <Certificates />
                </Layout>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/iccid-search" 
            element={
              <ProtectedRoute>
                <Layout>
                  <IccidSearch />
                </Layout>
              </ProtectedRoute>
            } 
          />
          


          {/* Fallback routes */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </PortalProvider>
    </AuthProvider>
  );
}

export default App;
