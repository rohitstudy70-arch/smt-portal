import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FaBoxOpen,
  FaCheckCircle,
  FaChevronDown,
  FaFilter,
  FaRedo,
  FaSave,
  FaSearch,
  FaTimesCircle,
} from 'react-icons/fa';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import '../DeviceManagement/AddDevice.css';
import './AddProduct.css';

const getRole = (user) => {
  if (user?.role === 'partner') return 'ADMIN';
  if (user?.userType === 'Administration') return 'ADMIN';
  if (user?.userType === 'Sub Dealer') return 'SUB_DEALER';
  return 'DEALER';
};

const getName = (item) => item?.displayName || item?.companyName || item?.username || 'N/A';

const getLinkedName = (item, fallback = '-') => (
  item ? getName(item) : (fallback || '-')
);

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const getLocalDateString = (dateObj) => {
  const d = dateObj ? new Date(dateObj) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const validityYears = (validity) => {
  if (validity === '3 Year') return 3;
  if (validity === '2 Year') return 2;
  return 1;
};

const calculateExpiry = (dateValue, validity) => {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  date.setFullYear(date.getFullYear() + validityYears(validity));
  return date;
};

const createEmptyForm = (dealer) => ({
  dealerId: dealer?._id || '',
  dealerName: dealer ? getName(dealer) : '',
  vendor: 'iTriangle',
  productDescription: 'VLTD',
  existingDeviceSearch: '',
  imei: '',
  serialNo: '',
  iccid: '',
  msisdn1: '',
  msisdn2: '',
  itrNo: '',
  vehicleNumber: '',
  validity: '1 Year',
  activationDate: '',
  renewalDate: getLocalDateString(),
  billAmount: '',
});

const AddProduct = () => {
  const { user } = useAuth();
  const role = getRole(user);
  const [dealers, setDealers] = useState([]);
  const [products, setProducts] = useState([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [productsLoading, setProductsLoading] = useState(true);
  const [formData, setFormData] = useState(createEmptyForm());
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState({ show: false, type: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [searchingExisting, setSearchingExisting] = useState(false);
  const [dealerSearch, setDealerSearch] = useState('');
  const [dealerDropdownOpen, setDealerDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const [tableSearch, setTableSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const selectedDealer = useMemo(
    () => dealers.find((dealer) => dealer._id === formData.dealerId),
    [dealers, formData.dealerId]
  );

  const isRenewal = formData.productDescription === 'VLTD RENEWAL' || formData.productDescription === 'GPS RENEWAL' || formData.productDescription === 'Renewal';
  const isVltd = formData.productDescription === 'VLTD' || formData.productDescription === 'VLTD RENEWAL';
  const isGps = formData.productDescription === 'GPS' || formData.productDescription === 'GPS RENEWAL';

  const calculatedExpiry = useMemo(() => (
    isRenewal
      ? calculateExpiry(formData.renewalDate, formData.validity)
      : calculateExpiry(formData.activationDate, formData.validity)
  ), [formData.activationDate, formData.renewalDate, formData.validity, isRenewal]);

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    window.setTimeout(() => setToast({ show: false, type: '', message: '' }), 4000);
  };

  const fetchProducts = useCallback(async (searchQuery = '') => {
    try {
      setProductsLoading(true);
      const response = await api.get('/products', {
        params: {
          limit: 100,
          page: 1,
          search: searchQuery,
        },
      });
      setProducts(response.data.products || []);
      setTotalProducts(response.data.total || 0);
    } catch (error) {
      showToast('error', error.response?.data?.message || 'Failed to load products.');
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(tableSearch);
    }, 400);
    return () => clearTimeout(handler);
  }, [tableSearch]);

  useEffect(() => {
    fetchProducts(debouncedSearch);
  }, [debouncedSearch, fetchProducts]);

  useEffect(() => {
    const fetchDealers = async () => {
      try {
        const response = await api.get('/users/sub-users');
        const allUsers = response.data || [];

        let dealerList = [];
        if (role === 'ADMIN') {
          dealerList = allUsers.filter((item) => (
            item.userType === 'Dealer'
            || item.userType === ''
            || item.userType === 'Administration'
            || item.role === 'partner'
          ));
          if (user && !dealerList.some((u) => u._id === user._id)) {
            dealerList.unshift(user);
          }
        } else {
          dealerList = user ? [user] : [];
        }

        setDealers(dealerList);

        if (dealerList.length === 1) {
          setFormData(createEmptyForm(dealerList[0]));
        }
      } catch (error) {
        showToast('error', error.response?.data?.message || 'Failed to load dealers.');
      }
    };

    fetchDealers();
  }, [role, user]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDealerDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredDealers = dealers.filter((dealer) => (
    getName(dealer).toLowerCase().includes(dealerSearch.toLowerCase())
  ));

  const updateFormField = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }));
    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: '' }));
    }
  };

  const updateProductType = (value) => {
    setFormData((current) => ({
      ...current,
      productDescription: value,
      renewalDate: value === 'Renewal' ? (current.renewalDate || getLocalDateString()) : current.renewalDate,
    }));
    setErrors({});
  };

  const selectDealer = (dealer) => {
    setFormData((current) => ({
      ...current,
      dealerId: dealer._id,
      dealerName: getName(dealer),
    }));
    setDealerSearch('');
    setDealerDropdownOpen(false);
    if (errors.dealerId || errors.dealerName) {
      setErrors((current) => ({ ...current, dealerId: '', dealerName: '' }));
    }
  };

  const validate = () => {
    const nextErrors = {};
    if (!formData.dealerId && !formData.dealerName) {
      nextErrors.dealerId = 'Dealer is required';
    }
    if (isRenewal && !formData.existingDeviceSearch.trim()) {
      nextErrors.existingDeviceSearch = 'Existing Device Search is required';
    }
    if (formData.billAmount !== '' && Number(formData.billAmount) < 0) {
      nextErrors.billAmount = 'Bill Amount cannot be negative';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleExistingSearch = async () => {
    if (!formData.existingDeviceSearch.trim()) {
      setErrors((current) => ({
        ...current,
        existingDeviceSearch: 'Existing Device Search is required',
      }));
      return;
    }

    setSearchingExisting(true);
    try {
      const response = await api.get('/products/search-existing', {
        params: {
          query: formData.existingDeviceSearch.trim(),
          dealerId: formData.dealerId || undefined,
        },
      });
      const result = response.data || {};
      setFormData((current) => ({
        ...current,
        imei: result.imei || current.imei,
        vehicleNumber: result.vehicleNumber || current.vehicleNumber,
      }));
      showToast('success', result.vehicleNumber ? 'Vehicle details filled.' : 'Device found.');
    } catch (error) {
      showToast('error', error.response?.data?.message || 'No matching device found.');
    } finally {
      setSearchingExisting(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await api.post('/products', formData);
      showToast('success', 'Product added successfully!');
      handleReset();
      await fetchProducts(debouncedSearch);
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to add product. Please try again.';
      showToast('error', message);
      if (message.toLowerCase().includes('dealer')) {
        setErrors((current) => ({ ...current, dealerId: message }));
      }
      if (message.toLowerCase().includes('existing device')) {
        setErrors((current) => ({ ...current, existingDeviceSearch: message }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    const defaultDealer = dealers.length === 1 ? dealers[0] : selectedDealer;
    setFormData(createEmptyForm(defaultDealer));
    setErrors({});
    setDealerSearch('');
  };

  const renderDealerDropdown = () => (
    <div className={`form-group ${errors.dealerId ? 'has-error' : ''}`}>
      <label>Dealer Name <span className="required">*</span></label>
      <div className="searchable-dropdown" ref={dropdownRef}>
        <div
          className="dropdown-trigger"
          onClick={() => dealers.length > 1 && setDealerDropdownOpen(!dealerDropdownOpen)}
        >
          <span className={formData.dealerName ? '' : 'placeholder'}>
            {formData.dealerName || 'Select Dealer'}
          </span>
          <FaChevronDown className={`dropdown-arrow ${dealerDropdownOpen ? 'open' : ''}`} />
        </div>
        {dealerDropdownOpen && (
          <div className="dropdown-menu">
            <div className="dropdown-search">
              <FaSearch className="search-icon" />
              <input
                type="text"
                placeholder="Search dealer..."
                value={dealerSearch}
                onChange={(event) => setDealerSearch(event.target.value)}
                autoFocus
              />
            </div>
            <ul className="dropdown-list">
              {filteredDealers.length > 0 ? (
                filteredDealers.map((dealer) => (
                  <li key={dealer._id} onClick={() => selectDealer(dealer)}>
                    {getName(dealer)}
                  </li>
                ))
              ) : (
                <li className="no-results">No dealers found</li>
              )}
            </ul>
          </div>
        )}
      </div>
      {errors.dealerId && <span className="error-text">{errors.dealerId}</span>}
    </div>
  );

  return (
    <div className="add-device-container add-product-container">
      {toast.show && (
        <div className={`toast-notification ${toast.type}`}>
          {toast.type === 'success' ? <FaCheckCircle /> : <FaTimesCircle />}
          <span>{toast.message}</span>
        </div>
      )}

      {role === 'ADMIN' && (
        <div className="add-device-card">
          <div className="add-device-header">
            <FaBoxOpen className="header-icon" />
            <span>ADD PRODUCT</span>
          </div>

          <form className="add-device-form" onSubmit={handleSubmit}>
            <div className="form-grid">
              {renderDealerDropdown()}

              <div className="form-group">
                <label>Model</label>
                <select name="vendor" value={formData.vendor} onChange={(event) => updateFormField('vendor', event.target.value)}>
                  <option value="iTriangle">iTriangle</option>
                  <option value="Acute">Acute</option>
                  <option value="Markon">Markon</option>
                  <option value="RDM">RDM</option>
                  <option value="BB">BB</option>
                  <option value="TrackNow">TrackNow</option>
                  <option value="Road point">Road point</option>
                </select>
              </div>

              <div className="form-group">
                <label>Product Description</label>
                <select
                  name="productDescription"
                  value={formData.productDescription}
                  onChange={(event) => updateProductType(event.target.value)}
                >
                  <option value="VLTD">VLTD</option>
                  <option value="GPS">GPS</option>
                  <option value="VLTD RENEWAL">VLTD RENEWAL</option>
                  <option value="GPS RENEWAL">GPS RENEWAL</option>
                </select>
              </div>

              {isRenewal && (
                <div className={`form-group ${errors.existingDeviceSearch ? 'has-error' : ''}`}>
                  <label>Existing Device Search <span className="required">*</span></label>
                  <div className="inline-search-row">
                    <input
                      type="text"
                      name="existingDeviceSearch"
                      value={formData.existingDeviceSearch}
                      onChange={(event) => updateFormField('existingDeviceSearch', event.target.value)}
                      placeholder="IMEI / Vehicle Number"
                    />
                    <button
                      type="button"
                      className="btn-inline-search"
                      onClick={handleExistingSearch}
                      disabled={searchingExisting}
                      title="Search existing device"
                    >
                      <FaSearch />
                      <span>{searchingExisting ? 'Searching' : 'Search'}</span>
                    </button>
                  </div>
                  {errors.existingDeviceSearch && <span className="error-text">{errors.existingDeviceSearch}</span>}
                </div>
              )}

              {(isVltd || isGps) && (
                <div className="form-group">
                  <label>IMEI No.</label>
                  <input
                    type="text"
                    name="imei"
                    value={formData.imei}
                    onChange={(event) => updateFormField('imei', event.target.value)}
                    placeholder="Enter IMEI"
                  />
                </div>
              )}

              {(isVltd || isGps) && (
                <div className="form-group">
                  <label>Serial No.</label>
                  <input
                    type="text"
                    name="serialNo"
                    value={formData.serialNo}
                    onChange={(event) => updateFormField('serialNo', event.target.value)}
                    placeholder="Enter Serial Number"
                  />
                </div>
              )}

              {isVltd && (
                <div className="form-group">
                  <label>ICCID No.</label>
                  <input
                    type="text"
                    name="iccid"
                    value={formData.iccid}
                    onChange={(event) => updateFormField('iccid', event.target.value)}
                    placeholder="Enter ICCID"
                  />
                </div>
              )}

              {isVltd && (
                <div className="form-group">
                  <label>MSISDN 1</label>
                  <input
                    type="text"
                    name="msisdn1"
                    value={formData.msisdn1}
                    onChange={(event) => updateFormField('msisdn1', event.target.value)}
                    placeholder="Enter MSISDN 1"
                  />
                </div>
              )}

              {isVltd && (
                <div className="form-group">
                  <label>MSISDN 2</label>
                  <input
                    type="text"
                    name="msisdn2"
                    value={formData.msisdn2}
                    onChange={(event) => updateFormField('msisdn2', event.target.value)}
                    placeholder="Enter MSISDN 2"
                  />
                </div>
              )}

              {isVltd && (
                <div className="form-group">
                  <label>ITR No.</label>
                  <input
                    type="text"
                    name="itrNo"
                    value={formData.itrNo}
                    onChange={(event) => updateFormField('itrNo', event.target.value)}
                    placeholder="Enter ITR Number"
                  />
                </div>
              )}

              <div className="form-group">
                <label>Vehicle Number</label>
                <input
                  type="text"
                  name="vehicleNumber"
                  value={formData.vehicleNumber}
                  onChange={(event) => updateFormField('vehicleNumber', event.target.value)}
                  placeholder={isRenewal ? 'Auto-filled when found' : 'Enter Vehicle Number'}
                  readOnly={isRenewal}
                  className={isRenewal ? 'readonly-field' : ''}
                />
              </div>

              <div className="form-group">
                <label>Validity</label>
                <select
                  name="validity"
                  value={formData.validity}
                  onChange={(event) => updateFormField('validity', event.target.value)}
                >
                  <option value="1 Year">1 Year</option>
                  <option value="2 Year">2 Year</option>
                  <option value="3 Year">3 Year</option>
                </select>
              </div>

              {!isRenewal && (
                <div className="form-group">
                  <label>Activation Date</label>
                  <input
                    type="date"
                    name="activationDate"
                    value={formData.activationDate}
                    onChange={(event) => updateFormField('activationDate', event.target.value)}
                  />
                </div>
              )}

              {isRenewal && (
                <div className="form-group">
                  <label>Renewal Date</label>
                  <input
                    type="date"
                    name="renewalDate"
                    value={formData.renewalDate}
                    onChange={(event) => updateFormField('renewalDate', event.target.value)}
                  />
                </div>
              )}

              <div className="form-group">
                <label>{isRenewal ? 'New Expiry Date' : 'Expiry Date'}</label>
                <input
                  type="text"
                  value={formatDate(calculatedExpiry)}
                  readOnly
                  className="readonly-field"
                />
              </div>

              <div className={`form-group ${errors.billAmount ? 'has-error' : ''}`}>
                <label>Bill Amount</label>
                <input
                  type="number"
                  name="billAmount"
                  value={formData.billAmount}
                  onChange={(event) => updateFormField('billAmount', event.target.value)}
                  placeholder="Enter Bill Amount"
                  min="0"
                  step="0.01"
                />
                {errors.billAmount && <span className="error-text">{errors.billAmount}</span>}
              </div>
            </div>

            <div className="form-actions">
              <button type="button" className="btn-reset" onClick={handleReset}>
                <FaRedo /> Reset
              </button>
              <button type="submit" className="btn-save" disabled={submitting}>
                <FaSave /> {submitting ? 'Saving...' : 'Save Product'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="add-device-card device-list-card">
        <div className="add-device-header">
          <FaFilter className="header-icon" />
          <span>PRODUCT TABLE</span>
          <div className="table-header-search-wrap">
            <FaSearch className="search-box-icon" />
            <input
              type="text"
              placeholder="Search product, IMEI, vehicle..."
              value={tableSearch}
              onChange={(event) => setTableSearch(event.target.value)}
              className="table-header-search-input"
            />
            {tableSearch && (
              <FaTimesCircle
                onClick={() => setTableSearch('')}
                className="search-box-clear-icon"
              />
            )}
          </div>
        </div>

        <div className="device-table-meta">
          <span>{products.length} shown</span>
          <span>{totalProducts} total</span>
        </div>

        <div className="add-device-table-wrap">
          <table className="add-device-table add-product-table">
            <thead>
              <tr>
                <th>Dealer Name</th>
                <th>Product</th>
                <th>Model</th>
                <th>Existing Search</th>
                <th>IMEI</th>
                <th>Serial Number</th>
                <th>ICCID</th>
                <th>Vehicle Number</th>
                <th>Validity</th>
                <th>Activation Date</th>
                <th>Renewal Date</th>
                <th>Expiry Date</th>
                <th>Bill Amount</th>
                <th>Created By</th>
              </tr>
            </thead>
            <tbody>
              {productsLoading ? (
                <tr>
                  <td colSpan={14} className="table-empty">Loading products...</td>
                </tr>
              ) : products.length > 0 ? (
                products.map((product) => (
                  <tr key={product._id}>
                    <td>{getLinkedName(product.dealerId, product.dealerName)}</td>
                    <td>
                      <span className={`product-type-pill product-${String(product.productDescription || '').toLowerCase().replace(/\s+/g, '-')}`}>
                        {product.productDescription || '-'}
                      </span>
                    </td>
                    <td>{product.vendor || '-'}</td>
                    <td>{product.existingDeviceSearch || '-'}</td>
                    <td className={product.imei ? 'strong-cell' : ''}>{product.imei || '-'}</td>
                    <td>{product.serialNo || '-'}</td>
                    <td>{product.iccid || '-'}</td>
                    <td>{product.vehicleNumber || '-'}</td>
                    <td>{product.validity || '-'}</td>
                    <td>{formatDate(product.activationDate)}</td>
                    <td>{formatDate(product.renewalDate)}</td>
                    <td>{formatDate(product.newExpiryDate || product.expiryDate)}</td>
                    <td>INR {product.billAmount || 0}</td>
                    <td>{getLinkedName(product.createdBy)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={14} className="table-empty">No product records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AddProduct;
