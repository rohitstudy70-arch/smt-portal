import { useCallback, useMemo, useRef, useState } from 'react';
import {
  FaCloudUploadAlt,
  FaDownload,
  FaFileExcel,
  FaTimes,
  FaCheckCircle,
  FaExclamationTriangle,
  FaTrash,
  FaArrowRight,
  FaArrowLeft,
  FaSpinner,
} from 'react-icons/fa';
import api from '../../utils/api';

const ACCEPTED_TYPES = [
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];
const ACCEPTED_EXTENSIONS = ['.csv', '.xlsx', '.xls'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const REQUIRED_HEADERS = ['IMEI', 'Serial No', 'ICCID No', 'Model'];

const getName = (item) => item?.displayName || item?.companyName || item?.username || 'N/A';

const BulkUploadDevices = ({ isOpen, onClose, onUploadSuccess, dealers = [], subDealers = [], role, user }) => {
  const [step, setStep] = useState('upload'); // upload | uploading | results
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [selectedDealerId, setSelectedDealerId] = useState('');
  const [selectedSubDealerId, setSelectedSubDealerId] = useState('');
  const fileInputRef = useRef(null);

  const filteredSubDealers = useMemo(() => {
    const parentId = role === 'ADMIN' ? selectedDealerId : user?._id;
    if (!parentId) return [];
    return subDealers.filter((sd) => sd.parentId?.toString() === parentId.toString());
  }, [subDealers, role, selectedDealerId, user]);

  const resetState = useCallback(() => {
    setStep('upload');
    setSelectedFile(null);
    setDragOver(false);
    setFileError('');
    setUploading(false);
    setUploadProgress(0);
    setUploadResult(null);
    setSelectedDealerId('');
    setSelectedSubDealerId('');
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const validateFile = useCallback((file) => {
    if (!file) return 'Please select a file.';
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return `Invalid file type "${ext}". Only .csv, .xlsx, and .xls files are accepted.`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds the 5MB limit.`;
    }
    return '';
  }, []);

  const handleFileSelect = useCallback((file) => {
    setFileError('');
    const error = validateFile(file);
    if (error) {
      setFileError(error);
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  }, [validateFile]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleInputChange = useCallback((e) => {
    const file = e.target.files[0];
    if (file) handleFileSelect(file);
    e.target.value = '';
  }, [handleFileSelect]);

  const handleDownloadSample = useCallback(async () => {
    setDownloading(true);
    try {
      const response = await api.get('/devices/bulk-upload/sample', {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'bulk_device_upload_sample.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download sample error:', err);
      setFileError('Failed to download sample file. Please try again.');
    } finally {
      setDownloading(false);
    }
  }, []);

  const handleDealerChange = (e) => {
    setSelectedDealerId(e.target.value);
    setSelectedSubDealerId('');
  };

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;
    setStep('uploading');
    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', selectedFile);
    if (selectedDealerId) formData.append('dealerId', selectedDealerId);
    if (selectedSubDealerId) formData.append('subDealerId', selectedSubDealerId);

    try {
      const response = await api.post('/devices/bulk-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percent = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total || progressEvent.loaded)
          );
          setUploadProgress(Math.min(percent, 95));
        },
      });
      setUploadProgress(100);
      setUploadResult(response.data);
      setStep('results');

      if (response.data.successCount > 0 && onUploadSuccess) {
        onUploadSuccess();
      }
    } catch (err) {
      if (err.response?.data && typeof err.response.data === 'object' && Array.isArray(err.response.data.errors)) {
        setUploadResult(err.response.data);
      } else {
        const msg = err.response?.data?.message || err.message || 'Upload failed.';
        setUploadResult({
          totalRows: 0,
          successCount: 0,
          errorCount: 1,
          errors: [{ row: '-', field: '-', message: msg }],
        });
      }
      setStep('results');
    } finally {
      setUploading(false);
    }
  }, [selectedFile, onUploadSuccess, selectedDealerId, selectedSubDealerId]);

  if (!isOpen) return null;

  return (
    <div className="bulk-modal-overlay" onClick={handleClose}>
      <div className="bulk-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bulk-modal-header">
          <div className="bulk-modal-header-left">
            <FaCloudUploadAlt className="bulk-modal-header-icon" />
            <span>Bulk Device Upload</span>
          </div>
          <button className="bulk-modal-close" onClick={handleClose}>
            <FaTimes />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="bulk-steps">
          <div className={`bulk-step ${step === 'upload' ? 'active' : (step !== 'upload' ? 'done' : '')}`}>
            <span className="bulk-step-num">1</span>
            <span className="bulk-step-label">Select File</span>
          </div>
          <div className="bulk-step-line" />
          <div className={`bulk-step ${step === 'uploading' ? 'active' : (step === 'results' ? 'done' : '')}`}>
            <span className="bulk-step-num">2</span>
            <span className="bulk-step-label">Upload</span>
          </div>
          <div className="bulk-step-line" />
          <div className={`bulk-step ${step === 'results' ? 'active' : ''}`}>
            <span className="bulk-step-num">3</span>
            <span className="bulk-step-label">Results</span>
          </div>
        </div>

        {/* Body */}
        <div className="bulk-modal-body">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <>
              {/* Download Sample */}
              <div className="bulk-sample-section">
                <div className="bulk-sample-info">
                  <FaFileExcel className="bulk-sample-icon" />
                  <div>
                    <strong>Download Sample Template</strong>
                    <p>Get the correct format with all required headers and example data before uploading.</p>
                  </div>
                </div>
                <button
                  className="bulk-btn-sample"
                  onClick={handleDownloadSample}
                  disabled={downloading}
                >
                  <FaDownload />
                  {downloading ? 'Downloading...' : 'Download Sample'}
                </button>
              </div>

              {/* Dealer and Sub-Dealer Dropdowns Selection */}
              <div className="bulk-dropdown-grid">
                {role === 'ADMIN' && (
                  <div className="form-group">
                    <label>Dealer Name (Optional)</label>
                    <select value={selectedDealerId} onChange={handleDealerChange}>
                      <option value="">-- Parse from Excel Sheet --</option>
                      {dealers.map((d) => (
                        <option key={d._id} value={d._id}>
                          {getName(d)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                
                {(role === 'DEALER' || selectedDealerId) && (
                  <div className="form-group">
                    <label>Sub Dealer Name (Optional)</label>
                    <select value={selectedSubDealerId} onChange={(e) => setSelectedSubDealerId(e.target.value)}>
                      <option value="">-- Parse from Excel Sheet --</option>
                      {filteredSubDealers.map((sd) => (
                        <option key={sd._id} value={sd._id}>
                          {getName(sd)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Dropzone */}
              <div
                className={`bulk-dropzone ${dragOver ? 'drag-over' : ''} ${selectedFile ? 'has-file' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleInputChange}
                  style={{ display: 'none' }}
                />
                {selectedFile ? (
                  <div className="bulk-file-selected">
                    <FaFileExcel className="bulk-file-icon" />
                    <div className="bulk-file-info">
                      <span className="bulk-file-name">{selectedFile.name}</span>
                      <span className="bulk-file-size">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                    <button
                      className="bulk-file-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                        setFileError('');
                      }}
                    >
                      <FaTrash />
                    </button>
                  </div>
                ) : (
                  <div className="bulk-dropzone-content">
                    <FaCloudUploadAlt className="bulk-dropzone-icon" />
                    <p className="bulk-dropzone-text">
                      Drag & drop your file here, or <span className="bulk-dropzone-link">click to browse</span>
                    </p>
                    <p className="bulk-dropzone-hint">Supports .csv, .xlsx, .xls (max 5MB)</p>
                  </div>
                )}
              </div>

              {fileError && (
                <div className="bulk-error-banner">
                  <FaExclamationTriangle />
                  <span>{fileError}</span>
                </div>
              )}

              {/* Required Fields Note */}
              <div className="bulk-required-note">
                <strong>Required columns:</strong> {REQUIRED_HEADERS.join(', ')}, Dealer Name (for Admin)
              </div>
            </>
          )}

          {/* Step 2: Uploading */}
          {step === 'uploading' && (
            <div className="bulk-uploading-section">
              <div className="bulk-uploading-spinner">
                <FaSpinner className="bulk-spin-icon" />
              </div>
              <h3>Uploading & Processing...</h3>
              <p>Validating and importing your devices. Please wait.</p>
              <div className="bulk-progress-container">
                <div className="bulk-progress-bar">
                  <div
                    className="bulk-progress-fill"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <span className="bulk-progress-text">{uploadProgress}%</span>
              </div>
            </div>
          )}

          {/* Step 3: Results */}
          {step === 'results' && uploadResult && (
            <div className="bulk-results-section">
              {/* Summary Cards */}
              <div className="bulk-results-summary">
                <div className="bulk-result-card result-total">
                  <span className="bulk-result-num">{uploadResult.totalRows}</span>
                  <span className="bulk-result-label">Total Rows</span>
                </div>
                <div className="bulk-result-card result-success">
                  <FaCheckCircle />
                  <span className="bulk-result-num">{uploadResult.successCount}</span>
                  <span className="bulk-result-label">Successful</span>
                </div>
                <div className="bulk-result-card result-error">
                  <FaExclamationTriangle />
                  <span className="bulk-result-num">{uploadResult.errorCount}</span>
                  <span className="bulk-result-label">Failed</span>
                </div>
              </div>

              {/* Success Message */}
              {uploadResult.successCount > 0 && (
                <div className="bulk-success-banner">
                  <FaCheckCircle />
                  <span>
                    {uploadResult.successCount} of {uploadResult.totalRows} devices uploaded successfully!
                    {' '}They are now visible in the Device Table.
                  </span>
                </div>
              )}

              {/* Error Table */}
              {uploadResult.errors && uploadResult.errors.length > 0 && (
                <div className="bulk-error-details">
                  <h4>
                    <FaExclamationTriangle /> Error Details ({uploadResult.errors.length} issue{uploadResult.errors.length !== 1 ? 's' : ''})
                  </h4>
                  <div className="bulk-error-table-wrap">
                    <table className="bulk-error-table">
                      <thead>
                        <tr>
                          <th>Row #</th>
                          <th>Field</th>
                          <th>Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadResult.errors.map((err, idx) => (
                          <tr key={idx}>
                            <td className="bulk-err-row">{err.row}</td>
                            <td className="bulk-err-field">{err.field}</td>
                            <td className="bulk-err-msg">{err.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bulk-modal-footer">
          {step === 'upload' && (
            <>
              <button className="bulk-btn-cancel" onClick={handleClose}>
                Cancel
              </button>
              <button
                className="bulk-btn-upload"
                disabled={!selectedFile || uploading}
                onClick={handleUpload}
              >
                <FaArrowRight /> Upload & Process
              </button>
            </>
          )}
          {step === 'uploading' && (
            <button className="bulk-btn-cancel" disabled>
              Processing...
            </button>
          )}
          {step === 'results' && (
            <>
              <button
                className="bulk-btn-cancel"
                onClick={() => {
                  resetState();
                }}
              >
                <FaArrowLeft /> Upload Another
              </button>
              <button className="bulk-btn-done" onClick={handleClose}>
                <FaCheckCircle /> Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BulkUploadDevices;
