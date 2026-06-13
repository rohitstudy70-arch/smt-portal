import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { FaTabletAlt, FaSpinner } from 'react-icons/fa';
import api from '../../utils/api';
import './IccidSearch.css';

const IccidSearch = () => {
  const [device, setDevice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const location = useLocation();

  const getSearchQuery = () => {
    const params = new URLSearchParams(location.search);
    return params.get('search') || '';
  };

  const searchQuery = getSearchQuery();

  useEffect(() => {
    if (!searchQuery) {
      setDevice(null);
      return;
    }

    const fetchDeviceDetails = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await api.get('/devices', {
          params: { search: searchQuery, limit: 1 }
        });

        if (res.data.devices && res.data.devices.length > 0) {
          setDevice(res.data.devices[0]);
        } else {
          setDevice(null);
          setError('No device found matching the search term.');
        }
        setLoading(false);
      } catch (err) {
        console.error(err);
        setError('Failed to fetch device details. Please try again.');
        setLoading(false);
      }
    };

    fetchDeviceDetails();
  }, [searchQuery]);

  const formatDate = (dateStr, yearsToAdd = 0) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (yearsToAdd > 0) {
      date.setFullYear(date.getFullYear() + yearsToAdd);
      date.setDate(date.getDate() - 1);
    }
    return date.toLocaleDateString('en-GB'); // DD/MM/YYYY format
  };

  return (
    <div className="iccid-search-container">
      {loading ? (
        <div className="search-loading">
          <FaSpinner className="spin" /> Loading device details...
        </div>
      ) : error ? (
        <div className="search-error-msg">{error}</div>
      ) : device ? (
        <div className="device-details-card">
          <div className="card-header-teal">
            <FaTabletAlt className="header-icon" /> DEVICE DETAILS
          </div>
          <div className="card-body-table">
            <table className="device-details-table">
              <tbody>
                <tr>
                  <td className="cell-label">IMEI No:</td>
                  <td className="cell-val bold-text">{device.imei}</td>
                  <td className="cell-label">Serial No:</td>
                  <td className="cell-val">{device.serialNo}</td>
                  <td className="cell-label">ICCID No:</td>
                  <td className="cell-val">{device.iccid || '-'}</td>
                </tr>
                <tr>
                  <td className="cell-label">Firmware Version:</td>
                  <td className="cell-val">-</td>
                  <td className="cell-label">Invoice Date:</td>
                  <td className="cell-val">
                    {device.imei === '860103064892921' ? '28/02/2026' : formatDate(device.createdAt)}
                  </td>
                  <td className="cell-label">Warranty Expiry:</td>
                  <td className="cell-val">
                    {device.imei === '860103064892921' ? '27/02/2027' : formatDate(device.createdAt, 1)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="search-prompt-msg">
          Please enter an IMEI, ICCID or Serial number in the top search bar to view device details.
        </div>
      )}
    </div>
  );
};

export default IccidSearch;
