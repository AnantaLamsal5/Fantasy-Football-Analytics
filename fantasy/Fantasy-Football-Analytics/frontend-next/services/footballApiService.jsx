import { apiGet } from "@/services/api";

export function getPlayers() {
  return apiGet("/api/players/");
}

export function getTopAttackers() {
  return apiGet("/api/user/analytics/top-attackers/");
}
