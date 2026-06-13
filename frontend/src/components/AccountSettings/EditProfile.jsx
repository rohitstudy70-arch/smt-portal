import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUser } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import './EditProfile.css';

const EditProfile = () => {
  const { user, updateProfile } = useAuth();
  const [username, setUsername] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      setUsername(user.username || '');
      setCompanyName(user.companyName || '');
    }
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!username.trim()) {
      setError('Username cannot be empty.');
      return;
    }

    try {
      setLoading(true);
      const res = await api.put('/auth/update-profile', {
        username,
        companyName
      });
      
      // Update local storage and context state
      updateProfile(res.data);
      setSuccess('Profile updated successfully!');
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to update profile. Please try again.');
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/dashboard');
  };

  return (
    <div className="edit-profile-container">
      <h1 className="page-heading">Edit <span className="subtitle">Profile</span></h1>
      
      <div className="card-panel">
        <div className="card-panel-header">
          <FaUser className="panel-icon" />
          <span className="panel-title">EDIT PROFILE DETAILS</span>
        </div>
        
        <div className="card-panel-body">
          {error && <div className="alert-message error">{error}</div>}
          {success && <div className="alert-message success">{success}</div>}
          
          <form onSubmit={handleSubmit} className="form-horizontal">
            <div className="form-group-horizontal">
              <label htmlFor="username">Username</label>
              <div className="input-wrapper">
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                />
              </div>
            </div>
            
            <div className="form-group-horizontal">
              <label htmlFor="companyName">Company Name</label>
              <div className="input-wrapper">
                <input
                  type="text"
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Company Name"
                />
              </div>
            </div>
            
            <div className="form-actions-horizontal">
              <button type="button" className="btn-cancel" onClick={handleCancel}>
                Cancel
              </button>
              <button type="submit" className="btn-save" disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EditProfile;
