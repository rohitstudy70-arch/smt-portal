import { useState } from 'react';
import { FaStore, FaPlus, FaTrash, FaCheck, FaTimes } from 'react-icons/fa';
import './SubdealerPlans.css';

const SubdealerPlans = () => {
  const [plans, setPlans] = useState([
    { id: 1, name: '1 Year AIS140 Commercial Plan', cost: 1200, price: 1500, type: 'Esim', status: 'Active' },
    { id: 2, name: '2 Years AIS140 Commercial Plan', cost: 2200, price: 2800, type: 'Esim', status: 'Active' },
    { id: 3, name: '1 Month Top-up SIM Plan', cost: 100, price: 150, type: 'Physical SIM', status: 'Active' }
  ]);

  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  const [type, setType] = useState('Esim');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!name.trim() || !cost || !price) {
      setError('Please fill in all fields.');
      return;
    }

    if (Number(cost) < 0 || Number(price) < 0) {
      setError('Values cannot be negative.');
      return;
    }

    const newPlan = {
      id: plans.length + 1,
      name,
      cost: Number(cost),
      price: Number(price),
      type,
      status: 'Active'
    };

    setPlans([...plans, newPlan]);
    setSuccess('New Subdealer plan created successfully!');
    setName('');
    setCost('');
    setPrice('');
    setType('Esim');
  };

  const handleToggleStatus = (id) => {
    setPlans(plans.map(p => {
      if (p.id === id) {
        const nextStatus = p.status === 'Active' ? 'Inactive' : 'Active';
        return { ...p, status: nextStatus };
      }
      return p;
    }));
    setSuccess('Plan status updated successfully.');
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this plan?')) {
      setPlans(plans.filter(p => p.id !== id));
      setSuccess('Plan deleted successfully.');
    }
  };

  return (
    <div className="subdealer-plans-container">
      <h1 className="page-heading">Subdealer <span className="subtitle">Plans Management</span></h1>
      
      <div className="layout-columns">
        {/* Left Column: Form to create a plan */}
        <div className="form-column">
          <div className="card-panel">
            <div className="card-panel-header">
              <FaPlus className="panel-icon" />
              <span className="panel-title">CREATE SUBDEALER PLAN</span>
            </div>

            <div className="card-panel-body">
              {error && <div className="alert-message error">{error}</div>}
              {success && <div className="alert-message success">{success}</div>}

              <form onSubmit={handleSubmit} className="form-horizontal">
                <div className="form-group-horizontal">
                  <label htmlFor="planName">Plan Name</label>
                  <div className="input-wrapper">
                    <input 
                      type="text" 
                      id="planName"
                      value={name} 
                      onChange={(e) => setName(e.target.value)} 
                      placeholder="e.g. 1 Year AIS140 Custom"
                      required
                    />
                  </div>
                </div>

                <div className="form-group-horizontal">
                  <label htmlFor="costPrice">Cost Price (₹)</label>
                  <div className="input-wrapper">
                    <input 
                      type="number" 
                      id="costPrice"
                      value={cost} 
                      onChange={(e) => setCost(e.target.value)} 
                      placeholder="e.g. 1200"
                      required
                    />
                  </div>
                </div>

                <div className="form-group-horizontal">
                  <label htmlFor="sellingPrice">Selling Price (₹)</label>
                  <div className="input-wrapper">
                    <input 
                      type="number" 
                      id="sellingPrice"
                      value={price} 
                      onChange={(e) => setPrice(e.target.value)} 
                      placeholder="e.g. 1500"
                      required
                    />
                  </div>
                </div>

                <div className="form-group-horizontal">
                  <label htmlFor="deviceType">Device Type</label>
                  <div className="input-wrapper">
                    <select 
                      id="deviceType"
                      value={type} 
                      onChange={(e) => setType(e.target.value)}
                    >
                      <option value="Esim">Esim</option>
                      <option value="Physical SIM">Physical SIM</option>
                    </select>
                  </div>
                </div>

                <div className="form-actions-horizontal">
                  <button type="submit" className="btn-create-plan">
                    Create Custom Plan
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Right Column: Plans List */}
        <div className="list-column">
          <div className="card-panel">
            <div className="card-panel-header">
              <FaStore className="panel-icon" />
              <span className="panel-title">SUBDEALERS PLANS LIST</span>
            </div>

            <div className="card-panel-body">
              <div className="table-responsive">
                <table className="table-custom">
                  <thead>
                    <tr>
                      <th>Sno</th>
                      <th>Plan Name</th>
                      <th>Cost (₹)</th>
                      <th>Selling (₹)</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((p, idx) => (
                      <tr key={p.id} className={p.status === 'Inactive' ? 'row-inactive' : ''}>
                        <td>{idx + 1}</td>
                        <td className="text-semibold">{p.name}</td>
                        <td>{p.cost}</td>
                        <td>{p.price}</td>
                        <td>{p.type}</td>
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
                            <button 
                              className="btn-action delete"
                              onClick={() => handleDelete(p.id)}
                              title="Delete Plan"
                            >
                              <FaTrash />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubdealerPlans;
