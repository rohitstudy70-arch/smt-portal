import { useState, useEffect } from 'react';
import { FaGlobe } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import './PaySubdealer.css';

const PaySubdealer = () => {
  const { user, updateProfile } = useAuth();
  const [subUsers, setSubUsers] = useState([]);
  
  // Selection fields
  const [selectedSubUser, setSelectedSubUser] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('');

  // Additional form fields (visible once dropdowns are selected)
  const [quantity, setQuantity] = useState(1);
  const [piNo, setPiNo] = useState('');
  const [remarks, setRemarks] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const fetchSubUsers = async () => {
      try {
        const res = await api.get('/users/sub-users');
        setSubUsers(res.data || []);
      } catch (err) {
        console.error('Error fetching sub-users:', err);
      }
    };
    fetchSubUsers();
  }, []);

  const handleTypeChange = (e) => {
    setSelectedType(e.target.value);
    setSelectedPlan(''); // reset plan selection when type changes
  };

  // Get plan choices based on selected type
  const getPlanOptions = () => {
    if (selectedType === 'Commercial Plan') {
      return (
        <>
          <option value="">Select type</option>
          <option value="1 Year">1 Year</option>
          <option value="2 Years">2 Years</option>
        </>
      );
    } else if (selectedType === 'Top-up') {
      return (
        <>
          <option value="">Select type</option>
          <option value="1 Month">1 Month</option>
        </>
      );
    } else if (selectedType === 'Common Layer') {
      return (
        <>
          <option value="">Select type</option>
          <option value="Common Layer Plan">Common Layer Plan</option>
        </>
      );
    }
    return <option value="">Select type</option>;
  };

  // Unit cost calculation
  const getUnitCost = () => {
    if (selectedType === 'Commercial Plan' && selectedPlan === '1 Year') return 472;
    if (selectedType === 'Commercial Plan' && selectedPlan === '2 Years') return 394;
    if (selectedType === 'Top-up') return 70.80;
    if (selectedType === 'Common Layer') return 100;
    return 0;
  };

  const calculatedAmount = getUnitCost() * quantity;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!selectedSubUser || !selectedType || !selectedPlan || !piNo || quantity <= 0) {
      setError('Please fill in all required fields.');
      return;
    }

    if (calculatedAmount > user.availableBalance) {
      setError('Insufficient available balance in your wallet to complete this payment.');
      return;
    }

    try {
      setLoading(true);
      const res = await api.post('/users/transfer', {
        subUserId: selectedSubUser,
        type: selectedType,
        plan: selectedPlan,
        quantity: Number(quantity),
        piNo,
        remarks
      });

      setSuccess(res.data.message);
      alert(res.data.message);
      
      // Update local storage balance
      updateProfile({
        ...user,
        availableBalance: res.data.availableBalance
      });

      // Reset Form
      setSelectedSubUser('');
      setSelectedType('');
      setSelectedPlan('');
      setQuantity(1);
      setPiNo('');
      setRemarks('');
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to complete payment. Please try again.');
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setSelectedSubUser('');
    setSelectedType('');
    setSelectedPlan('');
    setQuantity(1);
    setPiNo('');
    setRemarks('');
  };

  // Show secondary inputs only when all top dropdowns are chosen
  const showDetailInputs = selectedSubUser && selectedType && selectedPlan;

  return (
    <div className="pay-subdealer-container">
      {/* Title */}
      <h1 className="page-heading">Pay to <span className="subtitle">Subdealer</span></h1>

      {/* Main card */}
      <div className="card-panel">
        <div className="card-panel-header">
          <FaGlobe className="panel-icon" />
          <span className="panel-title">PAY TO SUBDEALER</span>
        </div>

        <div className="card-panel-body">
          {error && <div className="alert-message error">{error}</div>}
          {success && <div className="alert-message success">{success}</div>}

          <form onSubmit={handleSubmit}>
            {/* Top Dropdowns Row (Horizontal flex layout matching mockup) */}
            <div className="horizontal-dropdowns-row">
              <div className="dropdown-col">
                <label htmlFor="dealer">Dealers</label>
                <select 
                  id="dealer" 
                  value={selectedSubUser} 
                  onChange={(e) => setSelectedSubUser(e.target.value)}
                >
                  <option value="">Select Dealer</option>
                  {subUsers.map(u => (
                    <option key={u._id} value={u._id}>{u.displayName || u.username}</option>
                  ))}
                </select>
              </div>

              <div className="dropdown-col">
                <label htmlFor="selectType">Select Type</label>
                <select 
                  id="selectType" 
                  value={selectedType} 
                  onChange={handleTypeChange}
                >
                  <option value="">Select type</option>
                  <option value="Commercial Plan">Commercial Plan</option>
                  <option value="Top-up">Top-up</option>
                  <option value="Common Layer">Common Layer</option>
                </select>
              </div>

              <div className="dropdown-col">
                <label htmlFor="selectService">Select Service/CLA</label>
                <select 
                  id="selectService" 
                  value={selectedPlan} 
                  onChange={(e) => setSelectedPlan(e.target.value)}
                  disabled={!selectedType}
                >
                  {getPlanOptions()}
                </select>
              </div>
            </div>

            {/* Dynamic detailed form fields showing only once dropdowns are selected */}
            {showDetailInputs && (
              <div className="detail-form-section">
                <div className="detail-form-grid">
                  <div className="detail-field">
                    <label htmlFor="quantity">Quantity *</label>
                    <input 
                      type="number" 
                      id="quantity" 
                      value={quantity} 
                      onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      min="1"
                      required
                    />
                  </div>

                  <div className="detail-field">
                    <label htmlFor="piNo">PI No. *</label>
                    <input 
                      type="text" 
                      id="piNo" 
                      value={piNo} 
                      onChange={(e) => setPiNo(e.target.value)}
                      placeholder="e.g. iTR_PI_0626_43460"
                      required
                    />
                  </div>

                  <div className="detail-field">
                    <label htmlFor="remarks">Remarks</label>
                    <input 
                      type="text" 
                      id="remarks" 
                      value={remarks} 
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder="Remarks if any"
                    />
                  </div>

                  <div className="detail-field-cost">
                    <div className="cost-label">Total Amount:</div>
                    <div className="cost-value">₹{calculatedAmount.toFixed(2)}</div>
                    <div className="cost-help">(Unit cost: ₹{getUnitCost().toFixed(2)})</div>
                  </div>
                </div>

                <div className="detail-actions">
                  <button type="button" className="btn-cancel" onClick={handleCancel}>Cancel</button>
                  <button type="submit" className="btn-submit" disabled={loading}>
                    {loading ? 'Processing...' : 'Submit'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default PaySubdealer;
