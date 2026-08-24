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

      // --- PHASE 1: Instant Critical Load (<200ms) ---
      const [
        summaryRes,
        usersRes,
        dueSummaryRes,
        renewalDueSummaryRes,
      ] = await Promise.all([
        api.get('/portal/summary'),
        canManageUsers ? api.get('/portal/users', { params: { type: 'all' } }) : Promise.resolve({ data: [] }),
        isOps ? api.get('/due-dashboard/summary').catch(() => ({ data: null })) : Promise.resolve({ data: null }),
        api.get('/portal/renewals/due-summary').catch(() => ({ data: null })),
      ]);

      setSummary(summaryRes.data);
      setDueSummary(dueSummaryRes?.data || null);
      setRenewalDueSummary(renewalDueSummaryRes?.data || null);
      setUsers(usersRes.data || []);

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
      setDealers(dealerList);

      const subDealerList = allUsers.filter((item) => item.userType === 'Sub Dealer');
      setSubDealers(subDealerList);

      // Unblock UI immediately after Phase 1
      setHasLoaded(true);
      setLoading(false);

      // --- PHASE 2: Silent Background Asynchronous Load ---
      Promise.all([
        api.get('/portal/customers').catch(() => ({ data: [] })),
        api.get('/portal/devices', { params: { limit: 'all' } }).catch(() => ({ data: { devices: [] } })),
        api.get('/portal/renewals').catch(() => ({ data: [] })),
        api.get('/portal/reports').catch(() => ({ data: null })),
        canManageUsers ? api.get('/portal/login-logs').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      ]).then(([customersRes, devicesRes, renewalsRes, reportsRes, loginLogsRes]) => {
        setCustomers(customersRes.data || []);
        setDevices(devicesRes.data?.devices || []);
        setRenewals(renewalsRes.data || []);
        setReports(reportsRes.data || null);
        setLoginLogs(loginLogsRes.data || []);
      }).catch(bgErr => {
        console.warn('Background secondary load warning:', bgErr);
      });

    } catch (err) {
      console.error('Error fetching critical portal data:', err);
      setError(err.response?.data?.message || 'Failed to load portal data.');
      setLoading(false);
    }
  }, [user, userRole, hasLoaded]);

  const refreshPortalData = useCallback(async () => {
    try {
      const canManageUsers = userRole === 'ADMIN' || userRole === 'DEALER';
      const isOps = userRole === 'ADMIN' || userRole === 'DEALER' || userRole === 'SUB_DEALER';

      const [
        summaryRes,
        usersRes,
        dueSummaryRes,
        renewalDueSummaryRes,
      ] = await Promise.all([
        api.get('/portal/summary'),
        canManageUsers ? api.get('/portal/users', { params: { type: 'all' } }) : Promise.resolve({ data: [] }),
        isOps ? api.get('/due-dashboard/summary').catch(() => ({ data: null })) : Promise.resolve({ data: null }),
        api.get('/portal/renewals/due-summary').catch(() => ({ data: null })),
      ]);

      setSummary(summaryRes.data);
      setDueSummary(dueSummaryRes?.data || null);
      setRenewalDueSummary(renewalDueSummaryRes?.data || null);
      setUsers(usersRes.data || []);

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
      setDealers(dealerList);
      setSubDealers(allUsers.filter((item) => item.userType === 'Sub Dealer'));

      // Fetch background detailed data
      Promise.all([
        api.get('/portal/customers').catch(() => ({ data: [] })),
        api.get('/portal/devices', { params: { limit: 'all' } }).catch(() => ({ data: { devices: [] } })),
        api.get('/portal/renewals').catch(() => ({ data: [] })),
        api.get('/portal/reports').catch(() => ({ data: null })),
        canManageUsers ? api.get('/portal/login-logs').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      ]).then(([customersRes, devicesRes, renewalsRes, reportsRes, loginLogsRes]) => {
        setCustomers(customersRes.data || []);
        setDevices(devicesRes.data?.devices || []);
        setRenewals(renewalsRes.data || []);
        setReports(reportsRes.data || null);
        setLoginLogs(loginLogsRes.data || []);
      });

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
