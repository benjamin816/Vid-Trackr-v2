
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

const init = () => {
  const rootElement = document.getElementById('root');
  if (!rootElement) return;

  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    
    // Smoothly transition away from the loader
    const loader = document.getElementById('app-loader');
    if (loader) {
      setTimeout(() => {
        loader.style.opacity = '0';
        setTimeout(() => loader.remove(), 500);
      }, 500);
    }
  } catch (error) {
    console.error("Mount Error:", error);
    const errorDisplay = document.getElementById('error-display');
    if (errorDisplay) {
      errorDisplay.style.display = 'block';
      errorDisplay.innerHTML = `
        <h1 style="font-size: 24px; margin-bottom: 20px;">Kernel Panic</h1>
        <p>The application failed to mount. This usually happens if dependencies fail to load from the CDN.</p>
        <pre style="background: #1e293b; color: #f87171; padding: 20px; border-radius: 8px; margin-top: 20px;">${error.message}</pre>
        <button onclick="location.reload()" style="margin-top: 20px; padding: 12px 24px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">Force Restart</button>
      `;
    }
  }
};

// Ensure scripts are fully ready
if (document.readyState === 'complete') {
  init();
} else {
  window.addEventListener('load', init);
}
