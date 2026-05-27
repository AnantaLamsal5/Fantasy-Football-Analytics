import { apiGet } from "@/services/api";

export function getPlayers() {
  return apiGet("/api/players/");
}

export function getMatches() {
  return apiGet("/api/user/matches/");
}

export function getMatchDetails(matchId) {
  return apiGet(`/api/user/matches/${encodeURIComponent(matchId)}/`);
}

export function getMatchStatistics(matchId) {
  return apiGet(`/api/user/matches/${encodeURIComponent(matchId)}/statistics/`);
}

export function getLiveScores() {
  return apiGet("/api/user/matches/live/");
}

export function getMatchDifficulty() {
  return apiGet("/api/user/matches/difficulty/");
}

export function getTopAttackers() {
  return apiGet("/api/user/analytics/top-attackers/");
}
