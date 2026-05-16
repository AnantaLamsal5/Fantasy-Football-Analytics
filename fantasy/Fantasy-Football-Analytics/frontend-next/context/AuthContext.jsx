"use client";

import { createContext, useContext, useMemo, useState, useEffect, useRef } from "react";

const AuthContext = createContext(null);

// Inactivity timeout in milliseconds (15 minutes)
const INACTIVITY_TIMEOUT = 15 * 60 * 1000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isValidatingAuth, setIsValidatingAuth] = useState(true);
  const inactivityTimerRef = useRef(null);
  const lastActivityRef = useRef(null);

  // Function to reset inactivity timer
  const resetInactivityTimer = useRef((logout) => {
    // Clear existing timer
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }

    // Update last activity time
    lastActivityRef.current = Date.now();

    // Set new timer
    inactivityTimerRef.current = setTimeout(() => {
      console.warn("User inactive for 15 minutes. Logging out...");
      logout();
    }, INACTIVITY_TIMEOUT);
  });

  useEffect(() => {
    // On mount, validate auth state from localStorage
    const validateAuth = async () => {
      try {
        if (typeof window !== "undefined") {
          const storedToken = localStorage.getItem("ff_access");
          const storedUser = localStorage.getItem("ff_user");

          // Import validation functions
          const { isTokenExpired, validateTokenWithBackend, clearAuthData } = await import("@/services/authService");

          if (!storedToken) {
            // No token in localStorage - user is logged out
            setUser(null);
            setIsValidatingAuth(false);
            return;
          }

          // Check if token is expired locally
          if (isTokenExpired(storedToken)) {
            console.warn("Token is expired");
            clearAuthData();
            setUser(null);
            setIsValidatingAuth(false);
            return;
          }

          // Validate token with backend
          const userData = await validateTokenWithBackend();

          if (userData) {
            // Prefer persisted identity/role data for UI and role guards.
            let parsedStoredUser = null;
            try {
              parsedStoredUser = storedUser ? JSON.parse(storedUser) : null;
            } catch (parseError) {
              parsedStoredUser = null;
            }

            setUser(parsedStoredUser || userData || { username: null, role: null });
          } else {
            // Backend validation failed - clear auth data
            clearAuthData();
            setUser(null);
          }
        }
      } catch (e) {
        console.warn("Failed to validate auth", e);
        setUser(null);
      } finally {
        setIsValidatingAuth(false);
      }
    };

    validateAuth();

    // Listen for storage changes from other tabs
    const handleStorageChange = (e) => {
      if (e.key === "ff_access" && !e.newValue) {
        setUser(null);
        if (inactivityTimerRef.current) {
          clearTimeout(inactivityTimerRef.current);
        }
      }
    };
    window.addEventListener("storage", handleStorageChange);

    // Periodic validation of token in current tab (check every 5 minutes)
    const interval = setInterval(validateAuth, 5 * 60 * 1000);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };

  }, []);

  const logout = () => {
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem("ff_access");
        localStorage.removeItem("ff_refresh");
        localStorage.removeItem("ff_user");
        document.cookie = "ff_access=; Path=/; Max-Age=0;";
        document.cookie = "ff_refresh=; Path=/; Max-Age=0;";
        document.cookie = "ff_role=; Path=/; Max-Age=0;";
        
        // Clear inactivity timer
        if (inactivityTimerRef.current) {
          clearTimeout(inactivityTimerRef.current);
        }

        // Clear state
        setUser(null);

        // Redirect to landing page (home)
        window.location.href = "/";
      }
    } catch (e) {
      console.warn("Failed to clear auth data", e);
      setUser(null);
    }
  };

  // Set up inactivity timer when user logs in
  useEffect(() => {
    if (user && typeof window !== "undefined") {
      resetInactivityTimer.current(logout);

      // Activity event listeners
      const activityEvents = ["mousemove", "keypress", "click", "touchstart", "wheel", "scroll"];

      const handleActivity = () => {
        resetInactivityTimer.current(logout);
      };

      // Add event listeners
      activityEvents.forEach((event) => {
        window.addEventListener(event, handleActivity);
      });

      // Cleanup
      return () => {
        activityEvents.forEach((event) => {
          window.removeEventListener(event, handleActivity);
        });
        if (inactivityTimerRef.current) {
          clearTimeout(inactivityTimerRef.current);
        }
      };
    }

  }, [user]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isValidatingAuth,
      setAuthenticatedUser: setUser,
      logout,
    }),
    [user, isValidatingAuth]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
