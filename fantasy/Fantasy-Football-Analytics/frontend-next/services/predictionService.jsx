import { apiGet } from "@/services/api";

export function getWeekPredictions(matchweek, confidenceThreshold = 0) {
  return apiGet(
    `/api/predictions/week/${matchweek}/?confidence_threshold=${confidenceThreshold}`
  );
}

export function getMatchPrediction(matchId) {
  return apiGet(`/api/predictions/match/${matchId}/`);
}

export function getMyTeamSuggestions() {
  return apiGet("/api/predictions/my-team/suggestions/");
}

export function getPlayerPerformance(playerName) {
  return apiGet(`/api/predictions/player/${encodeURIComponent(playerName)}/`);
}

export function getFantasyPointsProjection() {
  return apiGet("/api/predictions/my-team/fantasy-points/");
}
