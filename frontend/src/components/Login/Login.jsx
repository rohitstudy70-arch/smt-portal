import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { FaMapMarkerAlt, FaEye, FaEyeSlash } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import './Login.css';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { login, loading, isAuthenticated, checkingAuth } = useAuth();
  const navigate = useNavigate();

  if (checkingAuth) {
    return <div style={{ padding: '20px', textAlign: 'center', fontSize: '14px', color: '#666' }}>Checking login session...</div>;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password.');
      return;
    }

    const result = await login(username, password);
    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="login-page">
      <div className="login-top-bar">
        <span className="portal-badge">CDB PORTAL V2</span>
        <a href="#" className="partner-link">SI Partner Login</a>
      </div>

      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <div className="login-brand-icon">
              <span className="brand-badge-text">CDB</span>
              <FaMapMarkerAlt className="map-icon" />
            </div>
            <h1>CDB Portal V2</h1>
            <p className="login-subtitle">Customer Self Service Portal</p>
          </div>

          <div className="login-body">
            {error && <div className="login-error">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="username">Username</label>
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  autoComplete="username"
                />
              </div>

              <div className="form-group password-group">
                <label htmlFor="password">Password</label>
                <div className="password-input-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              </div>

              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? 'Logging in...' : 'Login'}
              </button>
            </form>
          </div>

          <div className="login-footer">
            <p>{new Date().getFullYear()} &copy; CDB Portal V2. All rights reserved.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
