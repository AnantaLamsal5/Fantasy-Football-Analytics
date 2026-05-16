import { apiDelete, apiGet, apiPost } from "@/services/api";

export function submitTransfer(payload) {
  /**
   * payload: { mode: 'buy'|'sell'|'swap', outName, inName, playerIn }
   */
  return apiPost("/api/user/transfers/submit/", payload);
}

export function getTransferMarket() {
  return apiGet("/api/user/transfers/market/");
}

export function getTransferHistory() {
  return apiGet("/api/user/transfers/history/");
}

export function getWatchlist() {
  return apiGet("/api/user/watchlist/");
}

export function addToWatchlist(player) {
  return apiPost("/api/user/watchlist/", player);
}

export function removeFromWatchlist(playerId) {
  return apiDelete("/api/user/watchlist/", { id: playerId });
}
