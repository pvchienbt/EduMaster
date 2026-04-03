import React, {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      console.error("React ErrorBoundary caught an error:", this.state.error);
      return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif', color: 'red' }}>
          <h2>Đã xảy ra lỗi ứng dụng!</h2>
          <p>Trang web không thể hiển thị do lỗi sau:</p>
          <pre style={{ background: '#fee', padding: '10px', borderRadius: '5px', overflow: 'auto' }}>
            {this.state.error?.stack || this.state.error?.message || 'Unknown error'}
          </pre>
          <p>Vui lòng kiểm tra lại console (F12) để xem chi tiết hoặc liên hệ tác giả.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

console.log("App starting...");
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
