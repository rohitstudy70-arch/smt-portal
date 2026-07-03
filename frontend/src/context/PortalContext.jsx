import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useAuth } from './AuthContext';

const PortalContext = createContext(null);

export const usePortal = () => {
  const context = useContext(PortalContext);
  if (!context) {
    throw new Error('usePortal must be used within a PortalProvider');
  }
  return context;
};

export const PortalProvider = ({ children }) => {
  const { user } = useAuth();
  
  const [summary, setSummary] = useState(null);
  const [dueSummary, setDueSummary] = useState(null);
  const [renewalDueSummary, setRenewalDueSummary] = useState(null);
  const [dealers, setDealers] = useState([]);
  const [deviceDealerOptions, setDeviceDealerOptions] = useState([]);
  const [subDealers, setSubDealers] = useState([]);
  const [users, setUsers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [devices, setDevices] = useState([]);
  const [renewals, setRenewals] = useState([]);
  const [reports, setReports] = useState(null);
  const [loginLogs, setLoginLogs] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState('');

  const userRole = user?.role === 'partner' ? 'ADMIN' : user?.userType === 'Administration' ? 'ADMIN' : user?.userType === 'Sub Dealer' ? 'SUB_DEALER' : 'DEALER';

  const loadPortalData = useCallback(async (force = false) => {
    // If already loaded and not forced, skip showing loading screen/refetching
    if (hasLoaded && !force) {
      return;
    }

    try {
      if (!hasLoaded) {
        setLoading(true);
      }
      setError('');

      const canManageUsers = userRole === 'ADMIN' || userRole === 'DEALER';
      const isOps = userRole === 'ADMIN' || userRole === 'DEALER' || userRole === 'SUB_DEALER';

      const [
        summaryRes,
        dealersRes,
        subDealersRes,
        usersRes,
        customersRes,
        devicesRes,
        renewalsRes,
        reportsRes,
        loginLogsRes,
        dueSummaryRes,
        renewalDueSummaryRes,
      ] = await Promise.all([
        api.get('/portal/summary'),
        canManageUsers ? api.get('/portal/users', { params: { type: 'dealer' } }) : Promise.resolve({ data: [] }),
        canManageUsers ? api.get('/portal/users', { params: { type: 'subDealer' } }) : Promise.resolve({ data: [] }),
        canManageUsers ? api.get('/portal/users', { params: { type: 'all' } }) : Promise.resolve({ data: [] }),
        api.get('/portal/customers'),
        api.get('/portal/devices', { params: { limit: 1000 } }),
        api.get('/portal/renewals'),
        api.get('/portal/reports'),
        canManageUsers ? api.get('/portal/login-logs').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        isOps ? api.get('/due-dashboard/summary').catch(() => ({ data: null })) : Promise.resolve({ data: null }),
        api.get('/portal/renewals/due-summary').catch(() => ({ data: null })),
      ]);

      setSummary(summaryRes.data);
      setDueSummary(dueSummaryRes?.data || null);
      setRenewalDueSummary(renewalDueSummaryRes?.data || null);
      setDealers(dealersRes.data || []);
      setUsers(usersRes.data || []);
      setCustomers(customersRes.data || []);
      setDevices(devicesRes.data?.devices || []);
      setRenewals(renewalsRes.data || []);
      setReports(reportsRes.data || null);
      setLoginLogs(loginLogsRes.data || []);

      const allUsers = usersRes.data || [];
      
      // Identify dealers
      let dealerList = [];
      if (userRole === 'ADMIN') {
        const listFromDb = allUsers.filter(
          (item) => item.userType === 'Dealer' || item.userType === '' || item.role === 'partner'
        );
        if (user && !listFromDb.some((u) => u._id === user._id)) {
          listFromDb.unshift(user);
        }
        dealerList = listFromDb;
      } else {
        dealerList = user ? [user] : [];
      }
      setDeviceDealerOptions(dealerList);

      // Identify sub-dealers
      const subDealerList = allUsers.filter((item) => item.userType === 'Sub Dealer');
      setSubDealers(subDealerList);
      setHasLoaded(true);
    } catch (err) {
      console.error('Error fetching portal data:', err);
      setError(err.response?.data?.message || 'Failed to load portal data.');
    } finally {
      setLoading(false);
    }
  }, [user, userRole, hasLoaded]);

  const refreshPortalData = useCallback(async () => {
    // Run fetch in background without turning on the loading spinner
    try {
      const canManageUsers = userRole === 'ADMIN' || userRole === 'DEALER';
      const isOps = userRole === 'ADMIN' || userRole === 'DEALER' || userRole === 'SUB_DEALER';

      const [
        summaryRes,
        dealersRes,
        subDealersRes,
        usersRes,
        customersRes,
        devicesRes,
        renewalsRes,
        reportsRes,
        loginLogsRes,
        dueSummaryRes,
        renewalDueSummaryRes,
      ] = await Promise.all([
        api.get('/portal/summary'),
        canManageUsers ? api.get('/portal/users', { params: { type: 'dealer' } }) : Promise.resolve({ data: [] }),
        canManageUsers ? api.get('/portal/users', { params: { type: 'subDealer' } }) : Promise.resolve({ data: [] }),
        canManageUsers ? api.get('/portal/users', { params: { type: 'all' } }) : Promise.resolve({ data: [] }),
        api.get('/portal/customers'),
        api.get('/portal/devices', { params: { limit: 1000 } }),
        api.get('/portal/renewals'),
        api.get('/portal/reports'),
        canManageUsers ? api.get('/portal/login-logs').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        isOps ? api.get('/due-dashboard/summary').catch(() => ({ data: null })) : Promise.resolve({ data: null }),
        api.get('/portal/renewals/due-summary').catch(() => ({ data: null })),
      ]);

      setSummary(summaryRes.data);
      setDueSummary(dueSummaryRes?.data || null);
      setRenewalDueSummary(renewalDueSummaryRes?.data || null);
      setDealers(dealersRes.data || []);
      setUsers(usersRes.data || []);
      setCustomers(customersRes.data || []);
      setDevices(devicesRes.data?.devices || []);
      setRenewals(renewalsRes.data || []);
      setReports(reportsRes.data || null);
      setLoginLogs(loginLogsRes.data || []);

      const allUsers = usersRes.data || [];
      let dealerList = [];
      if (userRole === 'ADMIN') {
        const listFromDb = allUsers.filter(
          (item) => item.userType === 'Dealer' || item.userType === '' || item.role === 'partner'
        );
        if (user && !listFromDb.some((u) => u._id === user._id)) {
          listFromDb.unshift(user);
        }
        dealerList = listFromDb;
      } else {
        dealerList = user ? [user] : [];
      }
      setDeviceDealerOptions(dealerList);

      const subDealerList = allUsers.filter((item) => item.userType === 'Sub Dealer');
      setSubDealers(subDealerList);
    } catch (err) {
      console.error('Background refresh failed:', err);
    }
  }, [user, userRole]);

  // Clean data on logout / user change
  useEffect(() => {
    if (!user) {
      setSummary(null);
      setDueSummary(null);
      setRenewalDueSummary(null);
      setDealers([]);
      setDeviceDealerOptions([]);
      setSubDealers([]);
      setUsers([]);
      setCustomers([]);
      setDevices([]);
      setRenewals([]);
      setReports(null);
      setLoginLogs([]);
      setHasLoaded(false);
    }
  }, [user]);

  const value = {
    summary,
    dueSummary,
    renewalDueSummary,
    dealers,
    deviceDealerOptions,
    subDealers,
    users,
    customers,
    devices,
    renewals,
    reports,
    loginLogs,
    loading,
    hasLoaded,
    error,
    userRole,
    loadPortalData,
    refreshPortalData,
  };

  return (
    <PortalContext.Provider value={value}>
      {children}
    </PortalContext.Provider>
  );
};
