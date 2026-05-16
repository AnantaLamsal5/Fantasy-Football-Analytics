import { apiGet, apiPost } from "@/services/api";

export function getMyTeam() {
  return apiGet("/api/user/team/");
}

export function updateTeam(payload) {
  return apiPost("/api/user/team/", { action: "update_squad", ...payload });
}

export function createNewSquad(name = "New Squad", formation = "4-4-2") {
  return apiPost("/api/user/team/", { action: "create_squad", squad_name: name, formation, players: [] });
}

export function switchSquad(squadId) {
  return apiPost("/api/user/team/", { action: "switch_squad", squad_id: squadId });
}

const teamService = { getMyTeam, updateTeam, createNewSquad, switchSquad };

export default teamService;
