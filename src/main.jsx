import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';
import { I18nProvider } from './lib/i18n.jsx';

const isElectronRuntime =
  typeof window !== 'undefined' &&
  Boolean(window.electronAPI?.isElectron || navigator.userAgent.includes('Electron'));

const Router = isElectronRuntime ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <Router>
        <App />
      </Router>
    </I18nProvider>
  </React.StrictMode>
);
