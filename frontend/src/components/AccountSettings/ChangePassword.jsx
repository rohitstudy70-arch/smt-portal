import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaLock } from 'react-icons/fa';
import api from '../../utils/api';
import './ChangePassword.css';

const ChangePassword = () => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!oldPassword || !newPassword || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirm password do not match.');
      return;
    }

    try {
      setLoading(true);
      const res = await api.post('/auth/change-password', {
        oldPassword,
        newPassword
      });
      setSuccess(res.data.message || 'Password changed successfully!');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to change password. Please try again.');
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/dashboard');
  };

  return (
    <div className="password-reset-container">
      <h1 className="page-heading">Password <span className="subtitle">Reset</span></h1>
      
      <div className="card-panel">
        <div className="card-panel-header">
          <FaLock className="panel-icon" />
          <span className="panel-title">PASSWORD RESET</span>
        </div>
        
        <div className="card-panel-body">
          {error && <div className="alert-message error">{error}</div>}
          {success && <div className="alert-message success">{success}</div>}
          
          <form onSubmit={handleSubmit} className="form-horizontal">
            <div className="form-group-horizontal">
              <label htmlFor="oldPassword">Old Password</label>
              <div className="input-wrapper">
                <input
                  type="password"
                  id="oldPassword"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="Old Password"
                />
              </div>
            </div>
            
            <div className="form-group-horizontal">
              <label htmlFor="newPassword">New Password</label>
              <div className="input-wrapper">
                <input
                  type="password"
                  id="newPassword"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New Password"
                />
              </div>
            </div>
            
            <div className="form-group-horizontal">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <div className="input-wrapper">
                <input
                  type="password"
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm Password"
                />
              </div>
            </div>
            
            <div className="form-actions-horizontal">
              <button type="button" className="btn-cancel" onClick={handleCancel}>
                Cancel
              </button>
              <button type="submit" className="btn-reset" disabled={loading}>
                {loading ? 'Resetting...' : 'Reset'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ChangePassword;
