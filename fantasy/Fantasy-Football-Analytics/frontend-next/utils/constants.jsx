export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export const APP_ROUTES = {
  home: "/",
  login: "/login",
  signup: "/signup",
  resetPassword: "/reset-password",
  dashboard: "/dashboard",
  profile: "/profile",
  leaderboard: "/leaderboard",
  predictions: "/predictions",
  team: "/teams",
  matches: "/matches",
  transfers: "/transfers",
  admin: "/admin",
};

export const AUTH_COOKIE_KEYS = {
  access: "ff_access",
  refresh: "ff_refresh",
};
