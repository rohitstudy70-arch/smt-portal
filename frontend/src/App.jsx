import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './components/Login/Login';
import CustomerDevicePortal from './components/Portal/CustomerDevicePortal';
import ActivationRequests from './components/ServiceRequests/ActivationRequests';
import Layout from './components/Layout/Layout';
import EditProfile from './components/AccountSettings/EditProfile';
import ChangePassword from './components/AccountSettings/ChangePassword';
import WalletSystem from './components/WalletSystem/WalletSystem';
import UserManagement from './components/UserManagement/UserManagement';
import DeviceManagement from './components/DeviceManagement/DeviceManagement';
import AddDevice from './components/DeviceManagement/AddDevice';
import Certificates from './components/Certificates/Certificates';
import InvoiceGenerator from './components/InvoiceGenerator/InvoiceGenerator';
import ProformaInvoice from './components/ProformaInvoice/ProformaInvoice';
import IccidSearch from './components/IccidSearch/IccidSearch';
import Ledger from './components/Ledger/Ledger';

const getRole = (user) => {
  if (user?.role === 'partner') return 'ADMIN';
  if (user?.userType === 'Administration') return 'ADMIN';
  if (user?.userType === 'Sub Dealer') return 'SUB_DEALER';
  if (user?.userType === 'End Customer') return 'CUSTOMER';
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
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

function App() {
  return (
    <AuthProvider>
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
            <ProtectedRoute allowedRoles={['ADMIN']}>
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
          path="/wallet-system" 
          element={
            <ProtectedRoute allowedRoles={operationsRoles}>
              <Layout>
                <WalletSystem />
              </Layout>
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/ledger" 
          element={
            <ProtectedRoute allowedRoles={operationsRoles}>
              <Layout>
                <Ledger />
              </Layout>
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/user-management" 
          element={
            <ProtectedRoute allowedRoles={operationsRoles}>
              <Layout>
                <UserManagement />
              </Layout>
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/device-management" 
          element={
            <ProtectedRoute allowedRoles={operationsRoles}>
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
          path="/certificates" 
          element={
            <ProtectedRoute>
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
    </AuthProvider>
  );
}

export default App;
