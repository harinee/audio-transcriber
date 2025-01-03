import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import reportWebVitals from './reportWebVitals.ts';

// Global error handler for uncaught promises
window.onunhandledrejection = function(event: PromiseRejectionEvent) {
  console.error('Unhandled promise rejection:', event.reason);
  // You could also send to an error reporting service here
};

// Global error handler for runtime errors
window.onerror = function(message, source, lineno, colno, error) {
  console.error('Global error:', {
    message,
    source,
    lineno,
    colno,
    error
  });
  // You could also send to an error reporting service here
  return false;
};

// Log when the app starts
console.log('Application starting:', {
  timestamp: new Date().toISOString(),
  userAgent: navigator.userAgent,
  windowSize: {
    width: window.innerWidth,
    height: window.innerHeight
  }
});

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Add performance monitoring
reportWebVitals(console.log);
