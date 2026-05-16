"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { 
  ArrowRightLeft, 
  Search, 
  TrendingUp, 
  DollarSign, 
  Users, 
  AlertCircle,
  CheckCircle2,
  Star,
  X,
  ArrowUpDown
} from "lucide-react";
import {
  addToWatchlist,
  getTransferHistory,
  getTransferMarket,
  getWatchlist,
  removeFromWatchlist,
  submitTransfer,
} from "@/services/transferService";
import { getMyTeam } from "@/services/teamService";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function TransfersPage() {
  const [marketPlayers, setMarketPlayers] = useState([]);
  const [myTeam, setMyTeam] = useState({ players: [], budget: 50000000, owned_count: 0, max_players: 15 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("All");
  const [valueSort, setValueSort] = useState("default");
  const [status, setStatus] = useState({ type: null, message: "" });
  const [pendingTransfer, setPendingTransfer] = useState(null); // { out: player, in: player }
  const [watchlist, setWatchlist] = useState([]);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [market, team, watch, transferHistory] = await Promise.all([
        getTransferMarket(),
        getMyTeam(),
        getWatchlist(),
        getTransferHistory(),
      ]);
      const ownedPlayers = team?.owned_players || team?.players || [];
      const nextTeam = {
        ...(team || {}),
        players: ownedPlayers,
        budget: team?.budget ?? 50000000,
        owned_count: team?.owned_count ?? ownedPlayers.filter(Boolean).length,
        max_players: team?.max_players ?? 15,
      };
      setMarketPlayers(market || []);
      setMyTeam(nextTeam);
      setWatchlist(watch || []);
      setHistory(transferHistory || []);
      if (typeof window !== "undefined") {
        localStorage.setItem("ff_owned_players", JSON.stringify(nextTeam.players || []));
        localStorage.setItem("ff_transfer_state", JSON.stringify({ market, team: nextTeam, watch, transferHistory }));
        window.dispatchEvent(new Event("ff_owned_players_updated"));
      }
    } catch (e) {
      console.error("Load failed", e);
      try {
        const fallback = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("ff_transfer_state") || "{}") : {};
        if (fallback.team) {
          setMarketPlayers(fallback.market || []);
          setMyTeam(fallback.team);
          setWatchlist(fallback.watch || []);
          setHistory(fallback.transferHistory || []);
          setStatus({ type: "error", message: "Backend unavailable. Showing last saved transfer state." });
          return;
        }
      } catch (storageError) {
        console.warn("No transfer fallback available", storageError);
      }
      setStatus({ type: "error", message: "Failed to load market data." });
    } finally {
      setLoading(false);
    }
  }

  async function toggleWatchlist(player) {
    try {
      const isWatched = watchlist.some((item) => String(item.id) === String(player.id));
      const updated = isWatched ? await removeFromWatchlist(player.id) : await addToWatchlist(player);
      setWatchlist(updated || []);
    } catch (e) {
      setStatus({ type: "error", message: e.message || "Failed to update watchlist." });
    }
  }

  const filteredMarket = marketPlayers
    .filter(p => {
      const matchesSearch = (p.name || "").toLowerCase().includes(search.toLowerCase()) ||
                           (p.team || "").toLowerCase().includes(search.toLowerCase());
      const matchesPos = posFilter === "All" || p.position === posFilter;
      return matchesSearch && matchesPos;
    })
    .sort((a, b) => {
      if (valueSort === "high") return Number(b.value || 0) - Number(a.value || 0);
      if (valueSort === "low") return Number(a.value || 0) - Number(b.value || 0);
      return 0;
    });

  async function handleTransfer(mode, outPlayer, inPlayer) {
    try {
      const payload = {
        mode,
        outId: outPlayer?.id,
        outName: outPlayer?.name,
        inName: inPlayer?.name,
        playerIn: inPlayer
      };
      
      const res = await submitTransfer(payload);
      if (typeof window !== "undefined") {
        const nextOwnedPlayers = res?.owned_players || res?.team || [];
        localStorage.setItem("ff_owned_players", JSON.stringify(nextOwnedPlayers));
        window.dispatchEvent(new Event("ff_owned_players_updated"));
      }
      setStatus({ type: "success", message: res.message || "Transfer successful!" });
      loadData(); // Refresh state
      setPendingTransfer(null);
    } catch (e) {
      setStatus({ type: "error", message: e.message || "Transfer failed." });
    }
  }

  const formatCurrency = (val) => {
    const num = parseFloat(val);
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  const ownedPlayerIds = new Set((myTeam.players || []).filter(Boolean).map((p) => String(p.id)));
  const ownedCount = myTeam.owned_count ?? (myTeam.players || []).filter(Boolean).length;
  const maxPlayers = myTeam.max_players || 15;

  function getBuyBlockReason(player) {
    if (ownedPlayerIds.has(String(player.id)) || player.is_owned) return "Owned";
    if (ownedCount >= maxPlayers) return "Limit";
    if (Number(myTeam.budget || 0) < Number(player.value || 0)) return "Insufficient funds";
    return "";
  }

  function getOwnedPlayer(player) {
    return (myTeam.players || []).find((owned) => String(owned?.id) === String(player?.id));
  }

  function openSellConfirmation(player) {
    setPendingTransfer({ mode: "sell", out: player });
  }

  function openBuyConfirmation(player) {
    setPendingTransfer({ mode: "buy", in: player });
  }

  return (
    <ProtectedRoute>
      <div className="container mx-auto p-6 md:p-10 max-w-7xl">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6"
      >
        <div>
          <h1 className="text-4xl font-black tracking-tight flex items-center gap-3">
            <ArrowRightLeft className="h-10 w-10 text-primary" />
            Transfer Market
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Buy and sell players to optimize your squad performance.
          </p>
        </div>

        <div className="flex gap-4">
          <div className="card px-6 py-4 flex flex-col items-end border-primary/20 bg-primary/5">
            <span className="text-xs font-bold uppercase tracking-widest text-primary/60">Remaining Budget</span>
            <span className="text-2xl font-black text-primary">{formatCurrency(myTeam.budget)}</span>
            <span className="text-xs text-muted-foreground mt-1">{ownedCount}/{maxPlayers} players owned</span>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {status.type && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className={`mb-6 p-4 rounded-xl flex items-center gap-3 border ${
              status.type === "success" ? "bg-green-500/10 border-green-500/20 text-green-500" : "bg-red-500/10 border-red-500/20 text-red-500"
            }`}
          >
            {status.type === "success" ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
            <span className="font-bold">{status.message}</span>
            <button onClick={() => setStatus({ type: null, message: "" })} className="ml-auto">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Market List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6">
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input 
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-border bg-muted/20 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Search player or team..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                {["All", "Goalkeeper", "Defence", "Midfield", "Offence"].map(pos => (
                  <button
                    key={pos}
                    onClick={() => setPosFilter(pos)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                      posFilter === pos ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted border-border"
                    }`}
                  >
                    {pos === "Goalkeeper" ? "GK" : pos === "Defence" ? "DEF" : pos === "Midfield" ? "MID" : pos === "Offence" ? "FWD" : pos}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/20 p-1">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground">
                  <ArrowUpDown className="h-4 w-4" />
                </div>
                {[
                  { value: "default", label: "Default" },
                  { value: "high", label: "High" },
                  { value: "low", label: "Low" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setValueSort(option.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      valueSort === option.value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/50 text-xs font-black uppercase tracking-wider">
                    <th className="px-4 py-3">Player</th>
                    <th className="px-4 py-3">Team</th>
                    <th className="px-4 py-3">Position</th>
                    <th className="px-4 py-3">Value</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredMarket.slice(0, 50).map((player, idx) => (
                    <motion.tr 
                      key={player.id || idx}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.01 }}
                      className="hover:bg-muted/30 transition-colors group"
                    >
                      <td className="px-4 py-4">
                        <div className="font-bold">{player.name}</div>
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">{player.team}</td>
                      <td className="px-4 py-4">
                        <span className="text-[10px] font-black px-2 py-1 rounded bg-muted border border-border">
                          {player.position.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-mono text-sm font-bold">
                        {formatCurrency(player.value)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          onClick={() => toggleWatchlist(player)}
                          className="mr-2 p-2 rounded-lg border border-border hover:bg-muted"
                          aria-label="Toggle watchlist"
                        >
                          <Star
                            className={`h-4 w-4 ${
                              watchlist.some((item) => String(item.id) === String(player.id))
                                ? "fill-primary text-primary"
                                : "text-muted-foreground"
                            }`}
                          />
                        </button>
                        {ownedPlayerIds.has(String(player.id)) || player.is_owned ? (
                          <button
                            onClick={() => openSellConfirmation(getOwnedPlayer(player) || player)}
                            className="px-4 py-1.5 rounded-lg transition-all text-xs font-black uppercase bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white"
                          >
                            Sell
                          </button>
                        ) : (
                          <button
                            disabled={Boolean(getBuyBlockReason(player))}
                            onClick={() => openBuyConfirmation(player)}
                            className={`px-4 py-1.5 rounded-lg transition-all text-xs font-black uppercase ${
                              getBuyBlockReason(player)
                                ? "bg-muted text-muted-foreground cursor-not-allowed"
                                : "bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
                            }`}
                          >
                            {getBuyBlockReason(player) || "Buy"}
                          </button>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredMarket.length === 0 && !loading && (
              <div className="py-20 text-center text-muted-foreground italic">
                No players found matching your filters.
              </div>
            )}
          </div>
        </div>

        {/* Current Squad & Transfer Info */}
        <div className="space-y-6">
          <div className="card p-6 border-primary/10 shadow-xl shadow-primary/5">
            <h3 className="text-xl font-black mb-6 flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              Owned Players
            </h3>
            <div className="space-y-3">
              {myTeam.players && myTeam.players.length > 0 ? (
                myTeam.players.filter(p => p !== null).map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border group hover:border-primary/30 transition-all">
                    <div>
                      <div className="font-bold text-sm">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">
                        {p.position} - {p.team}
                      </div>
                    </div>
                    <button
                      onClick={() => openSellConfirmation(p)}
                      className="px-3 py-1 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all text-[10px] font-black uppercase"
                    >
                      Sell
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 border-2 border-dashed border-border rounded-2xl">
                  <p className="text-sm text-muted-foreground">Your squad is empty.</p>
                </div>
              )}
            </div>
          </div>

          <div className="card p-6 bg-muted/20">
            <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground mb-4">Transfer Insights</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <div className="text-xs font-bold">Market Stability</div>
                  <div className="text-[10px] text-muted-foreground">Prices are stable for the next 48h</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <div className="text-xs font-bold">Investment Tip</div>
                  <div className="text-[10px] text-muted-foreground">Midfielders offer best value currently</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground mb-4">Watchlist</h3>
            <div className="space-y-2">
              {watchlist.slice(0, 5).map((player) => (
                <div key={player.id} className="flex items-center justify-between p-2 rounded border border-border">
                  <span className="text-sm font-bold">{player.name}</span>
                  <button onClick={() => toggleWatchlist(player)} className="text-xs text-primary">Remove</button>
                </div>
              ))}
              {watchlist.length === 0 ? <p className="text-sm text-muted-foreground">No favorite players yet.</p> : null}
            </div>
          </div>

          <div className="card p-6">
            <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground mb-4">Transfer History</h3>
            <div className="space-y-2">
              {history.slice(0, 5).map((record) => (
                <div key={record.id} className="p-2 rounded border border-border text-xs">
                  <span className="font-bold">{record.player_out}</span>
                  <span className="text-muted-foreground"> to </span>
                  <span className="font-bold text-primary">{record.player_in}</span>
                </div>
              ))}
              {history.length === 0 ? <p className="text-sm text-muted-foreground">No transfers recorded yet.</p> : null}
            </div>
          </div>
        </div>
      </div>

      {/* Transfer Confirmation Modal */}
      {pendingTransfer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-card w-full max-w-md rounded-3xl overflow-hidden border border-border shadow-2xl"
          >
            <div className="p-8">
              <h2 className="text-2xl font-black mb-6">
                {pendingTransfer.mode === "sell" ? "Confirm Sale" : "Confirm Purchase"}
              </h2>
              
              <div className="p-6 rounded-2xl bg-muted/50 border border-border mb-6">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm text-muted-foreground">Player</span>
                  <span className="font-black text-lg">
                    {pendingTransfer.mode === "sell" ? pendingTransfer.out?.name : pendingTransfer.in?.name}
                  </span>
                </div>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm text-muted-foreground">Team</span>
                  <span className="font-bold">
                    {pendingTransfer.mode === "sell" ? pendingTransfer.out?.team : pendingTransfer.in?.team}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t border-border pt-4">
                  <span className="text-sm text-muted-foreground">
                    {pendingTransfer.mode === "sell" ? "Refund" : "Price"}
                  </span>
                  <span className={`font-black text-xl ${pendingTransfer.mode === "sell" ? "text-green-500" : "text-primary"}`}>
                    {formatCurrency(
                      pendingTransfer.mode === "sell"
                        ? pendingTransfer.out?.value
                        : pendingTransfer.in?.value
                    )}
                  </span>
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setPendingTransfer(null)}
                  className="flex-1 py-4 rounded-2xl border border-border font-bold hover:bg-muted transition-all"
                >
                  Cancel
                </button>
                {pendingTransfer.mode === "sell" ? (
                  <button
                    onClick={() => handleTransfer("sell", pendingTransfer.out, null)}
                    className="flex-1 py-4 rounded-2xl font-black transition-all bg-red-500 text-white hover:opacity-90"
                  >
                    Confirm Sell
                  </button>
                ) : (
                  <button
                    onClick={() => handleTransfer("buy", null, pendingTransfer.in)}
                    disabled={Boolean(getBuyBlockReason(pendingTransfer.in))}
                    className={`flex-1 py-4 rounded-2xl font-black transition-all shadow-lg shadow-primary/20 ${
                      getBuyBlockReason(pendingTransfer.in)
                        ? "bg-muted text-muted-foreground cursor-not-allowed"
                        : "bg-primary text-primary-foreground hover:opacity-90"
                    }`}
                  >
                    {getBuyBlockReason(pendingTransfer.in) || "Confirm Buy"}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
          <div className="h-16 w-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="font-bold text-primary animate-pulse">Syncing Transfer Data...</p>
        </div>
      )}
      </div>
    </ProtectedRoute>
  );
}
