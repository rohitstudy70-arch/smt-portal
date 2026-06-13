import { useState, useEffect } from 'react';
import { FaTools, FaTerminal, FaPaperPlane, FaHistory } from 'react-icons/fa';
import api from '../../utils/api';
import './Config360.css';

const Config360 = () => {
  const [devices, setDevices] = useState([]);
  const [selectedImei, setSelectedImei] = useState('');
  const [imeiFilter, setImeiFilter] = useState('');
  const [ip, setIp] = useState('121.241.115.117');
  const [port, setPort] = useState('5001');
  const [apn, setApn] = useState('airtelgprs.com');
  const [interval, setInterval] = useState('60');
  const [history, setHistory] = useState([
    { id: 1, command: 'SET IP 121.241.115.117 5001', sentDate: '2026-06-02 11:30:15', status: 'Delivered' },
    { id: 2, command: 'SET APN airtelgprs.com', sentDate: '2026-06-02 11:31:02', status: 'Delivered' },
    { id: 3, command: 'SET TXINT 60', sentDate: '2026-06-02 11:32:00', status: 'Delivered' }
  ]);
  const [sending, setSending] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    // Fetch unassigned/assigned devices to populate selects
    const getDevices = async () => {
      try {
        const res = await api.get('/devices', { params: { limit: 1000 } });
        setDevices(res.data.devices || []);
        if (res.data.devices?.length > 0) {
          setSelectedImei(res.data.devices[0].imei);
        }
      } catch (err) {
        console.error(err);
      }
    };
    getDevices();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedImei) {
      alert('Please select a device.');
      return;
    }
    
    setSending(true);
    setSuccessMsg('');
    
    setTimeout(() => {
      const now = new Date().toLocaleString();
      const newCommands = [
        { id: history.length + 1, command: `SET IP ${ip} ${port}`, sentDate: now, status: 'Sent' },
        { id: history.length + 2, command: `SET APN ${apn}`, sentDate: now, status: 'Sent' },
        { id: history.length + 3, command: `SET TXINT ${interval}`, sentDate: now, status: 'Sent' }
      ];
      setHistory([ ...newCommands, ...history ]);
      setSending(false);
      setSuccessMsg('SMS GPRS Configuration commands sent successfully!');
    }, 1500);
  };

  return (
    <div className="config360-container">
      <h1 className="page-heading">Config <span className="subtitle">360v2</span></h1>
      
      <div className="layout-columns">
        {/* Left Column: Command form */}
        <div className="form-column">
          <div className="card-panel">
            <div className="card-panel-header">
              <FaTools className="panel-icon" />
              <span className="panel-title">DEVICE CONFIGURATION PANEL</span>
            </div>

            <div className="card-panel-body">
              {successMsg && <div className="alert-message success">{successMsg}</div>}
              
              <form onSubmit={handleSubmit} className="form-horizontal">
                <div className="form-group-horizontal">
                  <label htmlFor="deviceSelect">Select Device</label>
                  <div className="input-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input 
                      type="text" 
                      placeholder="Type IMEI (e.g. 6 digits) to filter list..." 
                      value={imeiFilter}
                      onChange={(e) => setImeiFilter(e.target.value)}
                      style={{ 
                        padding: '8px', 
                        background: '#2c2c2c', 
                        color: '#fff', 
                        border: '1px solid #444', 
                        borderRadius: '4px',
                        fontSize: '12px',
                        width: '100%',
                        boxSizing: 'border-box'
                      }}
                    />
                    <select 
                      id="deviceSelect"
                      value={selectedImei} 
                      onChange={(e) => setSelectedImei(e.target.value)}
                      required
                      style={{ width: '100%' }}
                    >
                      <option value="">-Select Device IMEI-</option>
                      {devices
                        .filter(d => !imeiFilter || d.imei.toLowerCase().includes(imeiFilter.toLowerCase()))
                        .map(d => (
                          <option key={d._id} value={d.imei}>{d.imei} ({d.deviceName})</option>
                        ))
                      }
                    </select>
                  </div>
                </div>

                <div className="form-group-horizontal">
                  <label htmlFor="ipAddress">Server IP</label>
                  <div className="input-wrapper">
                    <input 
                      type="text" 
                      id="ipAddress"
                      value={ip} 
                      onChange={(e) => setIp(e.target.value)} 
                      placeholder="e.g. 121.241.115.117"
                      required
                    />
                  </div>
                </div>

                <div className="form-group-horizontal">
                  <label htmlFor="port">Port</label>
                  <div className="input-wrapper">
                    <input 
                      type="text" 
                      id="port"
                      value={port} 
                      onChange={(e) => setPort(e.target.value)} 
                      placeholder="e.g. 5001"
                      required
                    />
                  </div>
                </div>

                <div className="form-group-horizontal">
                  <label htmlFor="apn">APN Name</label>
                  <div className="input-wrapper">
                    <input 
                      type="text" 
                      id="apn"
                      value={apn} 
                      onChange={(e) => setApn(e.target.value)} 
                      placeholder="e.g. airtelgprs.com"
                      required
                    />
                  </div>
                </div>

                <div className="form-group-horizontal">
                  <label htmlFor="interval">TX Interval (sec)</label>
                  <div className="input-wrapper">
                    <input 
                      type="number" 
                      id="interval"
                      value={interval} 
                      onChange={(e) => setInterval(e.target.value)} 
                      placeholder="60"
                      required
                    />
                  </div>
                </div>

                <div className="form-actions-horizontal">
                  <button type="submit" className="btn-send-sms" disabled={sending}>
                    <FaPaperPlane style={{ marginRight: '5px' }} /> 
                    {sending ? 'Sending Command SMS...' : 'Send GPRS Config'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Right Column: Console / Log history */}
        <div className="list-column">
          <div className="card-panel">
            <div className="card-panel-header">
              <FaHistory className="panel-icon" />
              <span className="panel-title">SMS COMMAND LOGS</span>
            </div>

            <div className="card-panel-body">
              <div className="table-responsive">
                <table className="table-custom">
                  <thead>
                    <tr>
                      <th>Sno</th>
                      <th>Command Issued</th>
                      <th>Sent Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, idx) => (
                      <tr key={h.id}>
                        <td>{idx + 1}</td>
                        <td className="text-monospace">{h.command}</td>
                        <td>{h.sentDate}</td>
                        <td>
                          <span className={`badge-status ${h.status.toLowerCase()}`}>
                            {h.status}
                          </span>
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

export default Config360;
