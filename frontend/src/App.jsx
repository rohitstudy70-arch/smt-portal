import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './components/Login/Login';
import Dashboard from './components/Dashboard/Dashboard';
import ActivationRequests from './components/ServiceRequests/ActivationRequests';
import CommonLayerRequests from './components/ServiceRequests/CommonLayerRequests';
import Layout from './components/Layout/Layout';
import EditProfile from './components/AccountSettings/EditProfile';
import ChangePassword from './components/AccountSettings/ChangePassword';
import WalletSystem from './components/WalletSystem/WalletSystem';
import UserManagement from './components/UserManagement/UserManagement';
import DeviceManagement from './components/DeviceManagement/DeviceManagement';
import IccidSearch from './components/IccidSearch/IccidSearch';
import Certificates from './components/Certificates/Certificates';
import Config360 from './components/Config360/Config360';
import SIMActivationPlans from './components/SubdealerPlans/SIMActivationPlans';
import PaySubdealer from './components/PaySubdealer/PaySubdealer';
import InvoiceGenerator from './components/InvoiceGenerator/InvoiceGenerator';

// Protected Route wrapper component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
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
                <Dashboard />
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
          path="/service-requests/common-layer" 
          element={
            <ProtectedRoute>
              <Layout>
                <CommonLayerRequests />
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
            <ProtectedRoute>
              <Layout>
                <WalletSystem />
              </Layout>
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/user-management" 
          element={
            <ProtectedRoute>
              <Layout>
                <UserManagement />
              </Layout>
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/device-management" 
          element={
            <ProtectedRoute>
              <Layout>
                <DeviceManagement />
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
          path="/config-360" 
          element={
            <ProtectedRoute>
              <Layout>
                <Config360 />
              </Layout>
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/subdealer-plans/sim-activation" 
          element={
            <ProtectedRoute>
              <Layout>
                <SIMActivationPlans mode="sim" />
              </Layout>
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/subdealer-plans/cla-plans" 
          element={
            <ProtectedRoute>
              <Layout>
                <SIMActivationPlans mode="cla" />
              </Layout>
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/pay-subdealer" 
          element={
            <ProtectedRoute>
              <Layout>
                <PaySubdealer />
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
