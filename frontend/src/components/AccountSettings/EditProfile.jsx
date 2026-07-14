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
  const [displayName, setDisplayName] = useState('');
  const [mobileNo, setMobileNo] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [gstNo, setGstNo] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      setUsername(user.username || '');
      setCompanyName(user.companyName || '');
      setDisplayName(user.displayName || '');
      setMobileNo(user.mobileNo || '');
      setEmail(user.email || '');
      setAddress(user.address || '');
      setCity(user.city || '');
      setState(user.state || '');
      setPincode(user.pincode || '');
      setGstNo(user.gstNo || '');
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
        companyName,
        displayName,
        mobileNo,
        email,
        address,
        city,
        state,
        pincode,
        gstNo,
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

  if (user?.userType === 'Dealer') {
    return (
      <div className="edit-profile-container">
        <h1 className="page-heading">Edit <span className="subtitle">Profile</span></h1>
        <div className="card-panel" style={{ borderTop: '4px solid #f44336' }}>
          <div className="card-panel-header">
            <FaUser className="panel-icon" />
            <span className="panel-title">ACCESS DENIED</span>
          </div>
          <div className="card-panel-body" style={{ textAlign: 'center', padding: '40px 20px', color: '#ff6b6b' }}>
            <h2>Access Denied</h2>
            <p style={{ marginTop: '15px', color: '#aaa', fontSize: '1.1rem' }}>Dealers are not permitted to edit their profile details.</p>
            <button 
              type="button" 
              className="btn-cancel" 
              onClick={handleCancel} 
              style={{ marginTop: '20px', padding: '8px 24px', background: '#333', border: '1px solid #444', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

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
              <label htmlFor="displayName">Display Name</label>
              <div className="input-wrapper">
                <input
                  type="text"
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Display Name"
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

            <div className="form-group-horizontal">
              <label htmlFor="gstNo">GSTIN / GST No</label>
              <div className="input-wrapper">
                <input
                  type="text"
                  id="gstNo"
                  value={gstNo}
                  onChange={(e) => setGstNo(e.target.value)}
                  placeholder="GSTIN"
                />
              </div>
            </div>

            <div className="form-group-horizontal">
              <label htmlFor="mobileNo">Mobile No</label>
              <div className="input-wrapper">
                <input
                  type="text"
                  id="mobileNo"
                  value={mobileNo}
                  onChange={(e) => setMobileNo(e.target.value)}
                  placeholder="Mobile Number"
                />
              </div>
            </div>

            <div className="form-group-horizontal">
              <label htmlFor="email">Email</label>
              <div className="input-wrapper">
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email Address"
                />
              </div>
            </div>

            <div className="form-group-horizontal">
              <label htmlFor="address">Address</label>
              <div className="input-wrapper">
                <input
                  type="text"
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street Address"
                />
              </div>
            </div>

            <div className="form-group-horizontal">
              <label htmlFor="city">City</label>
              <div className="input-wrapper">
                <input
                  type="text"
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                />
              </div>
            </div>

            <div className="form-group-horizontal">
              <label htmlFor="state">State</label>
              <div className="input-wrapper">
                <input
                  type="text"
                  id="state"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="State"
                />
              </div>
            </div>

            <div className="form-group-horizontal">
              <label htmlFor="pincode">Pincode</label>
              <div className="input-wrapper">
                <input
                  type="text"
                  id="pincode"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  placeholder="Pincode"
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
