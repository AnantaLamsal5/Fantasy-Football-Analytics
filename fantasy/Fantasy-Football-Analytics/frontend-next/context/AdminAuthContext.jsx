'use client';

import React, { createContext, useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '@/utils/constants';

export const AdminAuthContext = createContext();

export default function AdminAuthProvider({ children }) {
  const [adminAuth, setAdminAuth] = useState(null);
  const [adminLoading, setAdminLoading] = useState(true);
  const [adminError, setAdminError] = useState('');
  const lastActivityRef = useRef(null);

  // Constants for admin auth
  const ADMIN_TOKEN_KEY = 'ff_admin_token';
  const ADMIN_EMAIL_KEY = 'ff_admin_email';
  const ADMIN_INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes

  function setCookie(name, value, maxAgeSeconds) {
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds};`;
  }

  function clearAdminStorage() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_EMAIL_KEY);
    localStorage.removeItem('ff_access');
    localStorage.removeItem('ff_refresh');
    localStorage.removeItem('ff_user');
    document.cookie = 'ff_access=; Path=/; Max-Age=0;';
    document.cookie = 'ff_refresh=; Path=/; Max-Age=0;';
    document.cookie = 'ff_role=; Path=/; Max-Age=0;';
  }

  function isTokenExpired(token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return !payload?.exp || Date.now() >= payload.exp * 1000;
    } catch (e) {
      return true;
    }
  }

  function logoutAdmin() {
    clearAdminStorage();
    setAdminAuth(null);
  }

  // Initialize admin auth from localStorage
  useEffect(() => {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    const email = localStorage.getItem(ADMIN_EMAIL_KEY);

    if (token && email && !isTokenExpired(token)) {
      Promise.resolve().then(() => setAdminAuth({ token, email }));
    } else if (token) {
      clearAdminStorage();
    }

    Promise.resolve().then(() => setAdminLoading(false));
  }, []);

  // Monitor inactivity
  useEffect(() => {
    if (!adminAuth) return;

    lastActivityRef.current = Date.now();

    const resetTimer = () => {
      lastActivityRef.current = Date.now();
    };

    const checkInactivity = setInterval(() => {
      if (lastActivityRef.current && Date.now() - lastActivityRef.current > ADMIN_INACTIVITY_TIMEOUT) {
        logoutAdmin();
      }
    }, 60000); // Check every minute

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keypress', resetTimer);
    window.addEventListener('click', resetTimer);

    return () => {
      clearInterval(checkInactivity);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keypress', resetTimer);
      window.removeEventListener('click', resetTimer);
    };
  }, [adminAuth]);

  useEffect(() => {
    if (!adminAuth?.token) return;

    let active = true;
    fetch(`${API_BASE_URL}/api/admin/stats/`, {
      headers: { Authorization: `Bearer ${adminAuth.token}` },
    }).then((response) => {
      if (active && response.status === 401) {
        logoutAdmin();
      }
    }).catch(() => {});

    return () => {
      active = false;
    };
  }, [adminAuth?.token]);

  // Admin login
  const loginAdmin = async (email, password) => {
    setAdminLoading(true);
    setAdminError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/admin/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setAdminError(data.detail || 'Login failed');
        setAdminLoading(false);
        return false;
      }

      const accessToken = data?.tokens?.access || data?.token;
      const refreshToken = data?.tokens?.refresh;
      const admin = data?.admin || data?.user;
      if (!accessToken || admin?.role !== 'admin') {
        setAdminError('Only authenticated admin users can access the admin portal.');
        setAdminLoading(false);
        return false;
      }

      localStorage.setItem(ADMIN_TOKEN_KEY, accessToken);
      localStorage.setItem(ADMIN_EMAIL_KEY, admin.email);
      localStorage.setItem('ff_access', accessToken);
      if (refreshToken) localStorage.setItem('ff_refresh', refreshToken);
      localStorage.setItem('ff_user', JSON.stringify(admin));
      setCookie('ff_access', accessToken, 30 * 60);
      if (refreshToken) setCookie('ff_refresh', refreshToken, 7 * 24 * 60 * 60);
      setCookie('ff_role', 'admin', 7 * 24 * 60 * 60);

      setAdminAuth({
        token: accessToken,
        email: admin.email,
      });

      setAdminLoading(false);
      return true;
    } catch (error) {
      setAdminError(error.message || 'Network error');
      setAdminLoading(false);
      return false;
    }
  };

  // Check if admin is authenticated
  const isAdminAuthenticated = !!adminAuth?.token;

  return (
    <AdminAuthContext.Provider
      value={{
        adminAuth,
        adminLoading,
        adminError,
        isAdminAuthenticated,
        loginAdmin,
        logoutAdmin,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}
