import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import * as Sentry from "@sentry/react";
import { logClientError } from './components/utils/error_logging';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN, 
  sendDefaultPii: false,
  beforeSend(event) {
    // get to clean the data
    if (event.request && event.request.url) {
      // Remove sensitive query parameters from URLs
      delete event.request.cookies;
    }
    return event;
  },
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
      debug: true,
    }),
    
  ],

  // Performance Monitoring
  tracesSampleRate: 1.0, 
  
  // Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
// send Warning Interceptor to the backend .log
const originalConsoleError = console.error;
console.error = (...args) => {
  const message = args[0];
  // If it's the specific table warning, send it to  backend .log
  if (typeof message === 'string' && message.includes('validateDOMNesting')) {
    logClientError(
      new Error(`DOM Nesting Warning: ${message}`),
      { component: 'Table/History' },
      'REACT_DOM_WARNING'
    );
  }
  originalConsoleError.apply(console, args);
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);