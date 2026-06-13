import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

window.addEventListener('error', (event) => {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="padding:30px;color:#721c24;background:#f8d7da;border:1px solid #f5c6cb;margin:20px;border-radius:4px;font-family:monospace;">
      <h2>Uncaught Global Error</h2>
      <pre style="background:#fff;padding:15px;border-radius:4px;overflow:auto;border:1px solid #eee;">
        ${event.message}
        at ${event.filename}:${event.lineno}:${event.colno}
        \n\nStack:\n${event.error ? event.error.stack : 'No stack trace available'}
      </pre>
    </div>`;
  }
});

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      hasError: true,
      error: error,
      errorInfo: errorInfo
    });
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
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
