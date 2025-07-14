import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css'; // Standard-CSS-Datei, die von Vite erstellt wird (kann leer sein oder Tailwind-Direktiven enthalten)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
