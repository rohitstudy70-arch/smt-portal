import { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch (e) {
      console.error('Error parsing user from localStorage:', e);
      return null;
    }
  });

  const [token, setToken] = useState(() => {
    return localStorage.getItem('token') || null;
  });

  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(() => {
    return !!localStorage.getItem('token');
  });

  const isAuthenticated = !!token;

  useEffect(() => {
    let isMounted = true;

    const validateStoredAuth = async () => {
      const savedToken = localStorage.getItem('token');

      if (!savedToken) {
        setCheckingAuth(false);
        return;
      }

      try {
        const response = await api.get('/auth/me');
        const userData = {
          _id: response.data._id,
          username: response.data.username,
          role: response.data.role,
          parentId: response.data.parentId || null,
          userType: response.data.userType || '',
          displayName: response.data.displayName || '',
          mobileNo: response.data.mobileNo || '',
          email: response.data.email || '',
          contactPerson: response.data.contactPerson || '',
          address: response.data.address || '',
          city: response.data.city || '',
          state: response.data.state || '',
          pincode: response.data.pincode || '',
          companyName: response.data.companyName,
          availableBalance: response.data.availableBalance,
          overDrawnAmount: response.data.overDrawnAmount
        };

        if (!isMounted) {
          return;
        }

        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        setToken(savedToken);
      } catch {
        if (!isMounted) {
          return;
        }

        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
        setToken(null);
      } finally {
        if (isMounted) {
          setCheckingAuth(false);
        }
      }
    };

    validateStoredAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (username, password) => {
    setLoading(true);
    try {
      const response = await api.post('/auth/login', { username, password });
      const { token: newToken, user: userData } = response.data;

      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(userData));

      setToken(newToken);
      setUser(userData);
      setLoading(false);

      return { success: true };
    } catch (error) {
      setLoading(false);
      const message = error.response?.data?.message || 'Login failed. Please try again.';
      return { success: false, message };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  const updateProfile = (updatedUserData) => {
    localStorage.setItem('user', JSON.stringify(updatedUserData));
    setUser(updatedUserData);
  };

  const value = {
    user,
    token,
    loading,
    checkingAuth,
    isAuthenticated,
    login,
    logout,
    updateProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
