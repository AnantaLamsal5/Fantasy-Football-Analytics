import { apiGet } from "@/services/api";

export function getMatches() {
  return apiGet("/api/user/matches/");
}

export function getLiveScores() {
  return apiGet("/api/user/matches/live/");
}

export function getMatchDifficulty() {
  return apiGet("/api/user/matches/difficulty/");
}

export function getPlayers() {
  return apiGet("/api/players/");
}

export function getTopAttackers() {
  return apiGet("/api/user/analytics/top-attackers/");
}
