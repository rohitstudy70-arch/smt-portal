import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('React ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '30px', color: '#721c24', background: '#f8d7da', border: '1px solid #f5c6cb', margin: '20px', borderRadius: '4px', fontFamily: 'monospace' }}>
          <h2 style={{ marginBottom: '15px' }}>React Application Error</h2>
          <pre style={{ background: '#fff', padding: '15px', borderRadius: '4px', overflow: 'auto', border: '1px solid #eee' }}>
            {this.state.error && this.state.error.toString()}
            {"\n\nComponent Stack:\n"}
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </pre>
          <button
            style={{ marginTop: '15px', padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}
            onClick={() => {
              this.setState({ hasError: false, error: null, errorInfo: null });
              window.location.href = '/dashboard';
            }}
          >
            Go to Dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ErrorBoundary>
);
