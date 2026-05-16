import { apiGet, apiPatch, apiPost } from "@/services/api";

export function getAdminStats() {
  return apiGet("/api/admin/stats/");
}

export function getAdminUsers() {
  return apiGet("/api/admin/users/");
}

export function updateAdminUser(userId, payload) {
  return apiPatch(`/api/admin/users/${userId}/`, payload);
}

export function getAdminPlayers() {
  return apiGet("/api/admin/players/");
}

export function saveAdminPlayer(payload) {
  return apiPost("/api/admin/players/", payload);
}

export function updateAdminPlayer(playerId, payload) {
  return apiPatch(`/api/admin/players/${playerId}/`, payload);
}

export function getAdminMatches(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiGet(`/api/admin/matches/${query}`);
}
