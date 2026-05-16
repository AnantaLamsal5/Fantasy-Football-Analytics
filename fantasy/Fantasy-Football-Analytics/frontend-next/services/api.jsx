import { API_BASE_URL } from "@/utils/constants";

async function request(path, options = {}) {
  // read ff_access cookie from frontend domain to send as Authorization header
  function getAuthToken() {
    if (typeof document !== "undefined") {
      const match = document.cookie.split("; ").find((row) => row.startsWith("ff_access="));
      if (match) return decodeURIComponent(match.split("=")[1]);
    }
    if (typeof window !== "undefined") {
      return localStorage.getItem("ff_access");
    }
    return null;
  }

  const accessToken = getAuthToken();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (response.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("ff_access");
      localStorage.removeItem("ff_refresh");
      localStorage.removeItem("ff_user");
      localStorage.removeItem("ff_admin_token");
      localStorage.removeItem("ff_admin_email");
      document.cookie = "ff_access=; Path=/; Max-Age=0;";
      document.cookie = "ff_refresh=; Path=/; Max-Age=0;";
      document.cookie = "ff_role=; Path=/; Max-Age=0;";
      // Avoid redirect loops if already on home
      if (window.location.pathname !== "/") {
        window.location.href = "/";
      }
    }
    throw new Error("Session expired. Please login again.");
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload?.detail ? payload.detail : "Request failed.";
    throw new Error(message);
  }

  return payload;
}

export function apiGet(path) {
  return request(path, { method: "GET" });
}

export function apiPost(path, body = {}) {
  return request(path, { method: "POST", body: JSON.stringify(body) });
}

export function apiPatch(path, body = {}) {
  return request(path, { method: "PATCH", body: JSON.stringify(body) });
}

export function apiDelete(path, body = {}) {
  return request(path, { method: "DELETE", body: JSON.stringify(body) });
}
