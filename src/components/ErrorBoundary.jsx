import { Component } from 'react';

/**
 * ErrorBoundary catches any runtime UI or 3D errors, preventing the whole
 * page from disappearing.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, color: '#f87171', fontFamily: 'monospace', fontSize: 12 }}>
          <p style={{ fontWeight: 'bold' }}>Visualisation error encountered</p>
          <pre style={{ whiteSpace: 'pre-wrap', opacity: 0.85 }}>
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: 8,
              padding: '4px 10px',
              background: 'rgba(30, 58, 138, 0.4)',
              border: '1px solid #38bdf8',
              color: '#38bdf8',
              cursor: 'pointer',
            }}
          >
            Retry Visualisation
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
