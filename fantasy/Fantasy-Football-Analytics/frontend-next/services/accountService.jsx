import { apiPatch, apiPost } from "@/services/api";
import { API_BASE_URL } from "@/utils/constants";

export function updateProfile(payload) {
  return apiPatch("/api/user/profile/update/", payload);
}

export function changePassword(payload) {
  return apiPost("/api/user/password/change/", payload);
}

function getAuthToken() {
  if (typeof document !== "undefined") {
    const match = document.cookie.split("; ").find((row) => row.startsWith("ff_access="));
    if (match) return decodeURIComponent(match.split("=")[1]);
  }
  if (typeof window !== "undefined") return localStorage.getItem("ff_access");
  return null;
}

export async function uploadProfilePicture(file) {
  const formData = new FormData();
  formData.append("profile_picture", file);
  const token = getAuthToken();
  const response = await fetch(`${API_BASE_URL}/api/user/profile/picture/`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.detail || "Failed to upload profile picture.");
  }
  return payload;
}

const accountService = { updateProfile, changePassword, uploadProfilePicture };

export default accountService;
