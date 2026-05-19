import React, { useState, useEffect } from 'react';
import AuthScreen from './components/AuthScreen';
import FileManager from './components/FileManager';
import PortalManager from './components/PortalManager';
import { authMe, portalMe } from './api';

function App() {
  const [token, setToken] = useState(localStorage.getItem('td_token'));
  const [portalToken, setPortalToken] = useState(localStorage.getItem('td_portal_token'));
  const [checking, setChecking] = useState(true);
  const [theme, setTheme] = useState(localStorage.getItem('td_theme') || 'light');

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

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('td_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

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
      {token ? (
        <FileManager onLogout={handleLogout} theme={theme} onToggleTheme={toggleTheme} />
      ) : portalToken ? (
        <PortalManager onLogout={handleLogout} theme={theme} onToggleTheme={toggleTheme} />
      ) : (
        <AuthScreen onLogin={handleLogin} theme={theme} onToggleTheme={toggleTheme} />
      )}
    </div>
  );
}

export default App;
