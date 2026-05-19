import React, { useState } from 'react';
import { authStart, authCode, authPassword, portalLogin } from '../api';
import { Loader, Cloud, ShieldCheck, Zap, Moon, Sun } from 'lucide-react';

const AuthScreen = ({ onLogin, theme, onToggleTheme }) => {
  const [mode, setMode] = useState('owner');
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState('');
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [useProxy, setUseProxy] = useState(false);
  const [proxyType, setProxyType] = useState('socks5');
  const [proxyHost, setProxyHost] = useState('');
  const [proxyPort, setProxyPort] = useState('');
  const [proxySecret, setProxySecret] = useState('');
  const [proxyUsername, setProxyUsername] = useState('');
  const [proxyPassword, setProxyPassword] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [friendUsername, setFriendUsername] = useState('');
  const [friendPassword, setFriendPassword] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleStart = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('phone', phone);
      formData.append('api_id', apiId);
      formData.append('api_hash', apiHash);
      if (useProxy) {
        formData.append('proxy_type', proxyType);
        formData.append('proxy_host', proxyHost);
        formData.append('proxy_port', proxyPort);
        if (proxyType === 'mtproto') {
          formData.append('proxy_secret', proxySecret);
        }
        if (proxyType === 'socks5') {
          formData.append('proxy_username', proxyUsername);
          formData.append('proxy_password', proxyPassword);
        }
      } else {
        formData.append('proxy_type', 'none');
      }
      const res = await authStart(formData);
      setToken(res.data.token);
      if (res.data.status === 'already_authorized') {
        localStorage.setItem('td_token', res.data.token);
        onLogin(res.data.token);
      } else {
        setStep(2);
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    }
    setLoading(false);
  };

  const handleFriendLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('username', friendUsername);
      formData.append('password', friendPassword);
      const res = await portalLogin(formData);
      localStorage.removeItem('td_token');
      localStorage.setItem('td_portal_token', res.data.token);
      onLogin(res.data.token, 'portal');
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    }
    setLoading(false);
  };

  const handleCode = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('token', token);
      formData.append('code', code);
      const res = await authCode(formData);
      if (res.data.status === 'password_needed') {
        setStep(3);
      } else {
        localStorage.setItem('td_token', token);
        onLogin(token);
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    }
    setLoading(false);
  };

  const handlePassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('token', token);
      formData.append('password', password);
      await authPassword(formData);
      localStorage.setItem('td_token', token);
      onLogin(token);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] px-4">
      <button onClick={onToggleTheme} className="fixed right-4 top-4 rounded-xl border border-gray-200 bg-white p-2 text-gray-600 shadow-sm hover:bg-gray-50" title="Toggle theme">
        {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="flex items-center justify-center mb-6">
          <div className="mr-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Cloud className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Telegram Drive</h1>
            <p className="text-sm text-gray-500">Private cloud storage on Telegram</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-6 rounded-lg bg-gray-100 p-1">
          <button type="button" onClick={() => { setMode('owner'); setError(''); }} className={`py-2 text-sm font-medium rounded-md ${mode === 'owner' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600'}`}>
            Owner
          </button>
          <button type="button" onClick={() => { setMode('friend'); setError(''); }} className={`py-2 text-sm font-medium rounded-md ${mode === 'friend' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600'}`}>
            Friend
          </button>
        </div>
        {error && <div className="bg-red-100 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>}

        {mode === 'friend' && (
          <form onSubmit={handleFriendLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Username</label>
              <input type="text" value={friendUsername} onChange={e => setFriendUsername(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <input type="password" value={friendPassword} onChange={e => setFriendPassword(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition flex items-center justify-center">
              {loading ? <Loader className="w-5 h-5 animate-spin" /> : 'Login'}
            </button>
          </form>
        )}

        {mode === 'owner' && step === 1 && (
          <form onSubmit={handleStart} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Phone Number</label>
              <input type="text" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1234567890" className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">API ID</label>
              <input type="number" value={apiId} onChange={e => setApiId(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">API Hash</label>
              <input type="text" value={apiHash} onChange={e => setApiHash(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input type="checkbox" checked={useProxy} onChange={e => setUseProxy(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              Keep Telegram connected through a proxy
            </label>
            {useProxy && (
              <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-white p-1">
                  <button type="button" onClick={() => setProxyType('socks5')} className={`flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium ${proxyType === 'socks5' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}>
                    <Zap className="h-4 w-4" /> SOCKS5
                  </button>
                  <button type="button" onClick={() => setProxyType('mtproto')} className={`flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium ${proxyType === 'mtproto' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}>
                    <ShieldCheck className="h-4 w-4" /> MTProto
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Proxy Server</label>
                  <input type="text" value={proxyHost} onChange={e => setProxyHost(e.target.value)} placeholder="proxy.example.com" className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required={useProxy} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Proxy Port</label>
                  <input type="number" value={proxyPort} onChange={e => setProxyPort(e.target.value)} placeholder={proxyType === 'socks5' ? '1080' : '443'} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required={useProxy} />
                </div>
                {proxyType === 'mtproto' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Proxy Secret</label>
                    <input type="password" value={proxySecret} onChange={e => setProxySecret(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required={useProxy && proxyType === 'mtproto'} />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Username</label>
                      <input type="text" value={proxyUsername} onChange={e => setProxyUsername(e.target.value)} placeholder="Optional" className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Password</label>
                      <input type="password" value={proxyPassword} onChange={e => setProxyPassword(e.target.value)} placeholder="Optional" className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                )}
              </div>
            )}
            <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition flex items-center justify-center">
              {loading ? <Loader className="w-5 h-5 animate-spin" /> : 'Send Code'}
            </button>
          </form>
        )}

        {mode === 'owner' && step === 2 && (
          <form onSubmit={handleCode} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Verification Code</label>
              <input type="text" value={code} onChange={e => setCode(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition flex items-center justify-center">
              {loading ? <Loader className="w-5 h-5 animate-spin" /> : 'Verify'}
            </button>
          </form>
        )}

        {mode === 'owner' && step === 3 && (
          <form onSubmit={handlePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">2FA Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition flex items-center justify-center">
              {loading ? <Loader className="w-5 h-5 animate-spin" /> : 'Login'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default AuthScreen;
