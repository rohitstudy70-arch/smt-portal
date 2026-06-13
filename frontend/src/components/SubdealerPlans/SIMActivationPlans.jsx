import { useState, useEffect } from 'react';
import { FaGlobe, FaPlus, FaCheck, FaTimes, FaEdit } from 'react-icons/fa';
import api from '../../utils/api';
import './SIMActivationPlans.css';

const SIMActivationPlans = ({ mode }) => {
  const [subUsers, setSubUsers] = useState([]);
  const [selectedSubUser, setSelectedSubUser] = useState('');
  const [selectedType, setSelectedType] = useState('');
  
  // Plans data
  const [subdealerPlans, setSubdealerPlans] = useState([
    { id: 1, name: '1 Year AIS140 Commercial Plan', cost: 1200, price: 1500, type: 'Commercial Plan', status: 'Active', dealerId: 'linkbirds' },
    { id: 2, name: '2 Years AIS140 Commercial Plan', cost: 2200, price: 2800, type: 'Commercial Plan', status: 'Active', dealerId: 'linkbirds' },
    { id: 3, name: '1 Month Top-up SIM Plan', cost: 100, price: 150, type: 'Top-up', status: 'Active', dealerId: 'linkbirds' },
    { id: 4, name: 'Standard Common Layer Plan', cost: 100, price: 120, type: 'Common Layer', status: 'Active', dealerId: 'linkbirds' }
  ]);

  // Form fields for assigning new plan
  const [globalPlans, setGlobalPlans] = useState([
    { id: 101, name: '1 Year AIS140 Commercial Plan', cost: 1200, type: 'Commercial Plan' },
    { id: 102, name: '2 Years AIS140 Commercial Plan', cost: 2200, type: 'Commercial Plan' },
    { id: 103, name: '1 Month Top-up SIM Plan', cost: 100, type: 'Top-up' },
    { id: 104, name: 'Standard Common Layer Plan', cost: 100, type: 'Common Layer' }
  ]);
  const [selectedGlobalPlanId, setSelectedGlobalPlanId] = useState('');
  const [customPrice, setCustomPrice] = useState('');
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

  // Reset form selections when switching mode (sim vs cla)
  useEffect(() => {
    setSelectedSubUser('');
    setSelectedType('');
    setSelectedGlobalPlanId('');
    setCustomPrice('');
    setSuccess('');
  }, [mode]);

  const handleTypeChange = (e) => {
    setSelectedType(e.target.value);
    setSelectedGlobalPlanId('');
  };

  const handleAssignPlanSubmit = (e) => {
    e.preventDefault();
    setSuccess('');

    if (!selectedSubUser || !selectedType || !selectedGlobalPlanId || !customPrice) {
      alert('Please fill in all fields.');
      return;
    }

    const selectedGlobalPlan = globalPlans.find(p => p.id === Number(selectedGlobalPlanId));
    if (!selectedGlobalPlan) return;

    const newAssignment = {
      id: subdealerPlans.length + 1,
      name: selectedGlobalPlan.name,
      cost: selectedGlobalPlan.cost,
      price: Number(customPrice),
      type: selectedGlobalPlan.type,
      status: 'Active',
      dealerId: selectedSubUser
    };

    setSubdealerPlans([...subdealerPlans, newAssignment]);
    setSuccess('Plan assigned to subdealer successfully!');
    setSelectedGlobalPlanId('');
    setCustomPrice('');
  };

  const handleToggleStatus = (id) => {
    setSubdealerPlans(subdealerPlans.map(p => {
      if (p.id === id) {
        const nextStatus = p.status === 'Active' ? 'Inactive' : 'Active';
        return { ...p, status: nextStatus };
      }
      return p;
    }));
    setSuccess('Plan status updated.');
  };

  // Filter plans list based on selection
  const activeSubdealer = subUsers.find(u => u._id === selectedSubUser);
  const activeSubdealerIdString = activeSubdealer ? 'linkbirds' : ''; // Mock mappings to seed data ID

  const assignedPlansFiltered = subdealerPlans.filter(p => 
    p.dealerId === activeSubdealerIdString && 
    p.type === selectedType
  );

  const availableGlobalPlans = globalPlans.filter(p => p.type === selectedType);

  return (
    <div className="sim-activation-plans-container">
      {/* Selector Card */}
      <div className="card-panel">
        <div className="card-panel-header">
          <FaGlobe className="panel-icon" />
          <span className="panel-title text-uppercase">SELECT DEALER</span>
        </div>

        <div className="card-panel-body">
          {success && <div className="alert-message success">{success}</div>}

          <div className="horizontal-dropdowns-row">
            <div className="dropdown-col">
              <label htmlFor="dealerSelect">Dealers</label>
              <select 
                id="dealerSelect" 
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
              <label htmlFor="typeSelect">Select Type</label>
              <select 
                id="typeSelect" 
                value={selectedType} 
                onChange={handleTypeChange}
              >
                <option value="">Select type</option>
                {mode === 'sim' ? (
                  <>
                    <option value="Commercial Plan">Commercial Plan</option>
                    <option value="Top-up">Top-up</option>
                  </>
                ) : (
                  <option value="Common Layer">Common Layer</option>
                )}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Detail Sections: Assigned plans table & New Assignment form */}
      {selectedSubUser && selectedType && (
        <div className="layout-columns">
          {/* Left Column: Form to assign plan */}
          <div className="form-column">
            <div className="card-panel">
              <div className="card-panel-header">
                <FaPlus className="panel-icon" />
                <span className="panel-title">ASSIGN NEW PLAN</span>
              </div>
              <div className="card-panel-body">
                <form onSubmit={handleAssignPlanSubmit} className="form-horizontal">
                  <div className="form-group-horizontal">
                    <label htmlFor="globalPlan">Select Plan *</label>
                    <div className="input-wrapper">
                      <select
                        id="globalPlan"
                        value={selectedGlobalPlanId}
                        onChange={(e) => setSelectedGlobalPlanId(e.target.value)}
                        required
                      >
                        <option value="">-Select Plan-</option>
                        {availableGlobalPlans.map(gp => (
                          <option key={gp.id} value={gp.id}>{gp.name} (Cost: ₹{gp.cost})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="form-group-horizontal">
                    <label htmlFor="price">Selling Price *</label>
                    <div className="input-wrapper">
                      <input
                        type="number"
                        id="price"
                        value={customPrice}
                        onChange={(e) => setCustomPrice(e.target.value)}
                        placeholder="Enter subdealer selling price"
                        required
                      />
                    </div>
                  </div>

                  <div className="form-actions-horizontal">
                    <button type="submit" className="btn-assign-submit">
                      Assign Plan
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>

          {/* Right Column: Assigned plans list */}
          <div className="list-column">
            <div className="card-panel">
              <div className="card-panel-header">
                <FaGlobe className="panel-icon" />
                <span className="panel-title">ASSIGNED PLANS FOR THIS DEALER</span>
              </div>
              <div className="card-panel-body">
                <div className="table-responsive">
                  <table className="table-custom">
                    <thead>
                      <tr>
                        <th>Sno</th>
                        <th>Plan Name</th>
                        <th>Cost Price (₹)</th>
                        <th>Subdealer Selling Price (₹)</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignedPlansFiltered.length > 0 ? (
                        assignedPlansFiltered.map((p, idx) => (
                          <tr key={p.id} className={p.status === 'Inactive' ? 'row-inactive' : ''}>
                            <td>{idx + 1}</td>
                            <td className="text-semibold">{p.name}</td>
                            <td>₹{p.cost}</td>
                            <td className="text-bold text-teal">₹{p.price}</td>
                            <td>
                              <span className={`badge-status ${p.status.toLowerCase()}`}>
                                {p.status}
                              </span>
                            </td>
                            <td>
                              <div className="action-buttons">
                                <button 
                                  className={`btn-action status ${p.status === 'Active' ? 'active' : 'inactive'}`}
                                  onClick={() => handleToggleStatus(p.id)}
                                  title={p.status === 'Active' ? 'Deactivate' : 'Activate'}
                                >
                                  {p.status === 'Active' ? <FaCheck /> : <FaTimes />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="text-center">No assigned plans found for this selection.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SIMActivationPlans;
