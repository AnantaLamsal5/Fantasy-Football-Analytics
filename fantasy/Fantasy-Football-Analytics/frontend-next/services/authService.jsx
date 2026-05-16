import { apiPost, apiGet } from "@/services/api";

function setCookie(name, value, maxAgeSeconds) {
  const encoded = encodeURIComponent(value);
  document.cookie = `${name}=${encoded}; Path=/; Max-Age=${maxAgeSeconds};`;
}

function persistAuthResponse(res) {
  if (typeof window === "undefined") return;

  if (res?.tokens?.access) {
    // access token: 30 minutes
    setCookie("ff_access", res.tokens.access, 30 * 60);
    localStorage.setItem("ff_access", res.tokens.access);
  }

  if (res?.tokens?.refresh) {
    // refresh token: 7 days
    setCookie("ff_refresh", res.tokens.refresh, 7 * 24 * 60 * 60);
    localStorage.setItem("ff_refresh", res.tokens.refresh);
  }

  if (res?.user) {
    try {
      localStorage.setItem("ff_user", JSON.stringify(res.user));
    } catch (e) {
      console.warn("Failed to store user in localStorage", e);
    }
  }

  if (res?.user?.role) {
    setCookie("ff_role", res.user.role, 7 * 24 * 60 * 60);
  }
}

// Decode JWT token to extract payload
function decodeJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = parts[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded;
  } catch (e) {
    console.warn("Failed to decode JWT", e);
    return null;
  }
}

// Check if JWT token is expired
export function isTokenExpired(token) {
  if (!token) return true;
  
  const decoded = decodeJWT(token);
  if (!decoded || !decoded.exp) return true;
  
  // Check if token expires within the next 5 seconds
  const expirationTime = decoded.exp * 1000; // Convert to milliseconds
  const currentTime = Date.now();
  
  return currentTime >= expirationTime - 5000;
}

// Validate token with backend
export async function validateTokenWithBackend() {
  try {
    const accessToken = typeof window !== "undefined" 
      ? localStorage.getItem("ff_access") 
      : null;
    
    if (!accessToken) {
      return null;
    }

    // Use dashboard endpoint to validate token - it requires authentication
    const response = await apiGet("/api/user/dashboard/");
    return response?.user || response;
  } catch (e) {
    console.warn("Token validation failed", e);
    return null;
  }
}

// Clear all auth data
function clearAuthData() {
  try {
    if (typeof window !== "undefined") {
      localStorage.removeItem("ff_access");
      localStorage.removeItem("ff_refresh");
      localStorage.removeItem("ff_user");
      document.cookie = "ff_access=; Path=/; Max-Age=0;";
      document.cookie = "ff_refresh=; Path=/; Max-Age=0;";
      document.cookie = "ff_role=; Path=/; Max-Age=0;";
    }
  } catch (e) {
    console.warn("Failed to clear auth data", e);
  }
}

export async function login(payload) {
  const res = await apiPost("/api/auth/login/", payload);
  try {
    persistAuthResponse(res);
  } catch (e) {
    // non-fatal: continue returning response
    console.warn("Failed to set auth cookies", e);
  }
  return res;
}

export async function signup(payload) {
  const res = await apiPost("/api/register/", payload);
  try {
    persistAuthResponse(res);
  } catch (e) {
    console.warn("Failed to set auth cookies", e);
  }
  return res;
}

export function requestSignupCode(payload) {
  return apiPost("/api/register/code/", payload);
}

export function verify2FA(payload) {
  return apiPost("/api/auth/2fa/verify/", payload);
}

export function requestPasswordReset(payload) {
  return apiPost("/api/auth/password-reset/request/", payload);
}

export function confirmPasswordReset(payload) {
  return apiPost("/api/auth/password-reset/confirm/", payload);
}

export { clearAuthData };
