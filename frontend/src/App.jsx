import React, { useState, useEffect } from 'react';
import AuthScreen from './components/AuthScreen';
import FileManager from './components/FileManager';
import PortalManager from './components/PortalManager';
import { authMe, portalMe } from './api';

function App() {
  const [token, setToken] = useState(localStorage.getItem('td_token'));
  const [portalToken, setPortalToken] = useState(localStorage.getItem('td_portal_token'));
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const verify = async () => {
      if (token) {
        try {
          await authMe();
          setToken(token);
        } catch (e) {
          localStorage.removeItem('td_token');
          setToken(null);
        }
      }
      if (!token && portalToken) {
        try {
          await portalMe();
          setPortalToken(portalToken);
        } catch (e) {
          localStorage.removeItem('td_portal_token');
          setPortalToken(null);
        }
      }
      setChecking(false);
    };
    verify();
  }, []);

  const handleLogin = (t, mode = 'owner') => {
    if (mode === 'portal') {
      setPortalToken(t);
      setToken(null);
      return;
    }
    localStorage.removeItem('td_portal_token');
    setPortalToken(null);
    setToken(t);
  };

  const handleLogout = () => {
    localStorage.removeItem('td_token');
    localStorage.removeItem('td_portal_token');
    setToken(null);
    setPortalToken(null);
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse text-gray-600 font-medium">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen">
      {token ? <FileManager onLogout={handleLogout} /> : portalToken ? <PortalManager onLogout={handleLogout} /> : <AuthScreen onLogin={handleLogin} />}
    </div>
  );
}

export default App;
