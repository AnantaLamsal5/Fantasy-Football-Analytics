import { apiGet, apiPost } from "@/services/api";

export function getLeaderboard() {
  return apiGet("/api/user/leaderboard/");
}

export function getWeeklyLeaderboard(matchweek) {
  const query = matchweek ? `?matchweek=${encodeURIComponent(matchweek)}` : "";
  return apiGet(`/api/user/leaderboard/weekly/${query}`);
}

export function getDashboard() {
  return apiGet("/api/user/dashboard/");
}

export function getAnalyticsSummary() {
  return apiGet("/api/user/analytics/");
}

export function getNotifications() {
  return apiGet("/api/user/notifications/");
}

export function syncPoints(initial = false) {
  return apiPost("/api/user/sync-points/", { initial });
}

export function simulateLastMatchweekPoints(reset = false) {
  return apiPost("/api/user/simulate-last-matchweek/", { reset });
}
