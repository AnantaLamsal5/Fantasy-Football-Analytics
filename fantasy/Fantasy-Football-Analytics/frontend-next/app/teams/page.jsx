"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Users, ShieldCheck, Zap, Plus, ArrowRightLeft, Settings2, Filter, X } from "lucide-react";
import { createNewSquad, getMyTeam, switchSquad, updateTeam } from "@/services/teamService";
import { getMyTeamSuggestions } from "@/services/predictionService";
import { simulateLastMatchweekPoints } from "@/services/leaderboardService";
import ProtectedRoute from "@/components/ProtectedRoute";
import { APP_ROUTES } from "@/utils/constants";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { y: 16, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: "spring", stiffness: 110, damping: 16 },
  },
};

const FORMATION_PRESETS = [
  { name: "3-5-2", label: "3 DEF, 5 MID, 2 FWD", slots: [3, 5, 2, 1] },
  { name: "4-3-3", label: "4 DEF, 3 MID, 3 FWD", slots: [4, 3, 3, 1] },
  { name: "4-4-2", label: "4 DEF, 4 MID, 2 FWD", slots: [4, 4, 2, 1] },
  { name: "4-5-1", label: "4 DEF, 5 MID, 1 FWD", slots: [4, 5, 1, 1] },
  { name: "5-3-2", label: "5 DEF, 3 MID, 2 FWD", slots: [5, 3, 2, 1] },
  { name: "5-4-1", label: "5 DEF, 4 MID, 1 FWD", slots: [5, 4, 1, 1] },
];

export default function TeamsPage() {
  const [ownedPlayers, setOwnedPlayers] = useState([]);
  const [filter, setFilter] = useState("");
  const [team, setTeam] = useState({ players: [], formation: "4-4-2", budget: 50000000, transfers_left: 1, owned_count: 0, max_players: 15 });
  const [squads, setSquads] = useState([]);
  const [currentSquadId, setCurrentSquadId] = useState("default");
  const [squadName, setSquadName] = useState("Main Squad");
  const [newSquadName, setNewSquadName] = useState("");
  const [squadMessage, setSquadMessage] = useState("");
  const [showPlayerList, setShowPlayerList] = useState(false);
  const [showFormationMenu, setShowFormationMenu] = useState(false);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(null);
  const [selectionNotice, setSelectionNotice] = useState("");
  const [simulationMessage, setSimulationMessage] = useState("");
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [strategy, setStrategy] = useState(null);

  function readOwnedPlayersFallback() {
    if (typeof window === "undefined") return [];
    try {
      const fromOwnedKey = JSON.parse(localStorage.getItem("ff_owned_players") || "[]");
      if (Array.isArray(fromOwnedKey) && fromOwnedKey.length) return fromOwnedKey;

      const transferState = JSON.parse(localStorage.getItem("ff_transfer_state") || "{}");
      const fromTransfer = transferState?.team?.players || transferState?.team?.owned_players || [];
      return Array.isArray(fromTransfer) ? fromTransfer : [];
    } catch (e) {
      console.warn("Failed to read owned players fallback", e);
      return [];
    }
  }

  function sanitizeSelectedPlayers(selectedPlayers, nextOwnedPlayers) {
    const ownedIds = new Set((nextOwnedPlayers || []).map((p) => String(p?.id)).filter(Boolean));
    return (selectedPlayers || []).map((player) => {
      if (!player || typeof player !== "object") return null;
      return ownedIds.has(String(player.id)) ? player : null;
    });
  }

  function applyTeamPayload(payload) {
    const fallbackOwned = readOwnedPlayersFallback();
    const boughtPlayers = Array.isArray(payload?.owned_players) ? payload.owned_players : fallbackOwned;
    const nextSquads = payload?.squads || [];
    const activeId = payload?.active_squad_id || payload?.squad_id || nextSquads[0]?.id || "default";
    const activeSquad = nextSquads.find((squad) => String(squad.id) === String(activeId));
    const nextSelected = sanitizeSelectedPlayers(payload?.selected_players || payload?.players || [], boughtPlayers);

    setOwnedPlayers(boughtPlayers);
    setSquads(nextSquads);
    setCurrentSquadId(activeId);
    setSquadName(payload?.squad_name || activeSquad?.name || "Main Squad");
    setTeam({
      players: nextSelected,
      formation: payload?.formation || "4-4-2",
      budget: payload?.budget ?? 50000000,
      transfers_left: payload?.transfers_left ?? 1,
      owned_count: payload?.owned_count ?? boughtPlayers.length,
      max_players: payload?.max_players ?? 15,
    });

    if (typeof window !== "undefined") {
      localStorage.setItem("ff_owned_players", JSON.stringify(boughtPlayers || []));
    }
  }

  useEffect(() => {
    let mounted = true;
    getMyTeam()
      .then((t) => {
        if (!mounted) return;
        if (t) applyTeamPayload(t);
      })
      .catch((e) => {
        console.warn("Failed to load team or players", e);
        const fallbackOwned = readOwnedPlayersFallback();
        if (!mounted) return;
        setOwnedPlayers(fallbackOwned);
        setTeam((prev) => ({
          ...prev,
          players: sanitizeSelectedPlayers(prev.players, fallbackOwned),
          owned_count: fallbackOwned.length,
        }));
      });

    const syncFromStorage = () => {
      const fallbackOwned = readOwnedPlayersFallback();
      setOwnedPlayers(fallbackOwned);
      setTeam((prev) => ({
        ...prev,
        players: sanitizeSelectedPlayers(prev.players, fallbackOwned),
        owned_count: fallbackOwned.length,
      }));
    };

    window.addEventListener("storage", syncFromStorage);
    window.addEventListener("ff_owned_players_updated", syncFromStorage);
    window.addEventListener("focus", syncFromStorage);

    return () => {
      mounted = false;
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener("ff_owned_players_updated", syncFromStorage);
      window.removeEventListener("focus", syncFromStorage);
    };
  }, []);

  // Get position from slot index based on formation
  function getPositionForSlot(slotIndex) {
    const [d, m, f] = team.formation.split("-").map(Number);
    const def = d;
    const mid = m;
    const fwd = f;
    
    if (slotIndex < fwd) return "FWD";
    if (slotIndex < fwd + mid) return "MID";
    if (slotIndex < fwd + mid + def) return "DEF";
    if (slotIndex < fwd + mid + def + 1) return "GK";
    return "BENCH"; // Bench has all positions
  }

  // Normalize position names for matching
  function normalizePosition(position) {
    const raw = String(position || "").trim().toUpperCase();
    if (!raw) return "";
    if (["GK", "GOALKEEPER", "GOAL KEEPER", "KEEPER"].includes(raw)) return "GK";
    if (["DEF", "DEFENDER", "DEFENCE", "DEFENSE", "CB", "RB", "LB"].includes(raw)) return "DEF";
    if (["MID", "MIDFIELDER", "MIDFIELD", "CM", "CDM", "CAM", "RM", "LM"].includes(raw)) return "MID";
    if (["FWD", "FW", "FORWARD", "ATTACKER", "OFFENCE", "OFFENSE", "ST", "STRIKER", "WINGER"].includes(raw)) return "FWD";
    if (raw === "BENCH") return "BENCH";
    return raw;
  }

  function filteredPlayers() {
    let players = ownedPlayers.filter((p) => p.name && p.name.toLowerCase().includes(filter.toLowerCase()));
    const selectedIds = new Set(
      (team.players || [])
        .map((player, index) => (index === selectedSlotIndex ? null : player?.id))
        .filter((id) => id !== null && id !== undefined)
        .map((id) => String(id))
    );
    
    // Filter by position if a specific slot is selected
    if (selectedSlotIndex !== null) {
      const requiredPosition = getPositionForSlot(selectedSlotIndex);
      
      // Bench can have any player
      if (requiredPosition !== "BENCH") {
        players = players.filter((p) => {
          const playerPos = normalizePosition(p.position);
          return playerPos === requiredPosition;
        });
      }
    }
    
    return players.filter((player) => !selectedIds.has(String(player?.id)));
  }

  function getNumeric(player, keys) {
    for (const key of keys) {
      const value = Number(player?.[key]);
      if (Number.isFinite(value)) return value;
    }
    return 0;
  }

  function playerScore(player, normalizedPos) {
    const matchesPlayed = getNumeric(player, ["matches_played", "matchesPlayed", "apps", "appearances"]);
    const goals = getNumeric(player, ["goals", "total_goals", "scored"]);
    const assists = getNumeric(player, ["assists", "total_assists"]);
    const cleanSheets = getNumeric(player, ["clean_sheets", "cleanSheets"]);
    const fantasyPoints = getNumeric(player, ["fantasy_points", "fantasyPoints", "total_points", "points"]);
    const form = getNumeric(player, ["form", "performance", "rating"]);
    const value = getNumeric(player, ["value", "cost"]);

    let base = fantasyPoints * 3 + form * 2 + matchesPlayed * 0.5 + value / 1000000;
    if (normalizedPos === "GK") base += cleanSheets * 3;
    if (normalizedPos === "DEF") base += cleanSheets * 2 + goals * 2 + assists * 1.5;
    if (normalizedPos === "MID") base += goals * 2.5 + assists * 2 + cleanSheets * 0.5;
    if (normalizedPos === "FWD") base += goals * 3 + assists * 1.5;
    return base;
  }

  function optimizeSquadPlayers() {
    const [d, m, f] = team.formation.split("-").map(Number);
    const required = { GK: 1, DEF: d, MID: m, FWD: f };

    const pools = {
      GK: [],
      DEF: [],
      MID: [],
      FWD: [],
    };

    (ownedPlayers || []).forEach((player) => {
      const normalized = normalizePosition(player?.position);
      if (pools[normalized]) pools[normalized].push(player);
    });

    Object.keys(pools).forEach((pos) => {
      pools[pos].sort((a, b) => playerScore(b, pos) - playerScore(a, pos));
    });

    const lineup = [];
    const usedIds = new Set();
    const missing = [];

    function pickBest(pos) {
      const next = pools[pos].find((player) => !usedIds.has(String(player?.id)));
      if (!next) return null;
      usedIds.add(String(next.id));
      return next;
    }

    for (let i = 0; i < required.FWD; i += 1) {
      const player = pickBest("FWD");
      if (!player) missing.push("FWD");
      lineup.push(player || null);
    }
    for (let i = 0; i < required.MID; i += 1) {
      const player = pickBest("MID");
      if (!player) missing.push("MID");
      lineup.push(player || null);
    }
    for (let i = 0; i < required.DEF; i += 1) {
      const player = pickBest("DEF");
      if (!player) missing.push("DEF");
      lineup.push(player || null);
    }
    const gk = pickBest("GK");
    if (!gk) missing.push("GK");
    lineup.push(gk || null);

    // Bench: fill with best remaining owned players regardless of position
    const remaining = (ownedPlayers || [])
      .filter((player) => !usedIds.has(String(player?.id)))
      .sort((a, b) => playerScore(b, normalizePosition(b?.position)) - playerScore(a, normalizePosition(a?.position)));
    for (let i = 0; i < 4; i += 1) {
      lineup.push(remaining[i] || null);
    }

    return { lineup, missing };
  }

  async function handleChangeFormation(newFormation) {
    setTeam((t) => ({ ...t, formation: newFormation }));
    setShowFormationMenu(false);
    try {
      const updated = await updateTeam({ squad_id: currentSquadId, squad_name: squadName, players: team.players, formation: newFormation });
      if (updated) applyTeamPayload(updated);
    } catch (e) {
      console.warn("Failed to update formation", e);
    }
  }

  async function handleRemovePlayer(slotIndex) {
    const newPlayers = team.players ? [...team.players] : [];
    newPlayers[slotIndex] = null;
    setTeam((t) => ({ ...t, players: newPlayers }));
    try {
      const updated = await updateTeam({ squad_id: currentSquadId, squad_name: squadName, players: newPlayers, formation: team.formation });
      if (updated) applyTeamPayload(updated);
    } catch (e) {
      console.warn("Failed to remove player", e);
    }
  }

  async function handleSelectPlayer(player) {
    const duplicateSelected = (team.players || []).some(
      (selected, index) => index !== selectedSlotIndex && String(selected?.id) === String(player?.id)
    );
    if (duplicateSelected) {
      setSelectionNotice("This player is already selected in your team.");
      return;
    }

    // assign player to selected slot
    const newPlayers = team.players ? [...team.players] : [];
    if (selectedSlotIndex == null) {
      newPlayers.push(player);
    } else {
      newPlayers[selectedSlotIndex] = player;
    }
    setTeam((t) => ({ ...t, players: newPlayers }));
    setShowPlayerList(false);
    setSelectedSlotIndex(null);
    setSelectionNotice("");
    try {
      const updated = await updateTeam({ squad_id: currentSquadId, squad_name: squadName, players: newPlayers, formation: team.formation });
      if (updated) applyTeamPayload(updated);
    } catch (e) {
      console.warn("Failed to update team", e);
      setSelectionNotice(e.message || "Failed to update team.");
    }
  }

  async function handleNewSquad() {
    try {
      const name = newSquadName.trim() || `Squad ${squads.length + 1}`;
      const res = await createNewSquad(name, team.formation);
      if (res) {
        applyTeamPayload(res);
        setNewSquadName("");
        setSquadMessage(`Created ${name}.`);
      }
    } catch (e) {
      console.warn("Failed to create new squad", e);
      setSquadMessage(e.message || "Failed to create squad.");
    }
  }

  async function handleSwitchSquad(squadId) {
    try {
      const res = await switchSquad(squadId);
      if (res) {
        applyTeamPayload(res);
        setSquadMessage("");
      }
    } catch (e) {
      console.warn("Failed to switch squad", e);
      setSquadMessage(e.message || "Failed to switch squad.");
    }
  }

  async function handleSaveSquadName() {
    try {
      const updated = await updateTeam({
        squad_id: currentSquadId,
        squad_name: squadName,
        players: team.players,
        formation: team.formation,
      });
      if (updated) {
        applyTeamPayload(updated);
        setSquadMessage("Squad name saved.");
      }
    } catch (e) {
      console.warn("Failed to save squad name", e);
      setSquadMessage(e.message || "Failed to save squad name.");
    }
  }

  function openPlayerSelector(slotIndex) {
    setSelectedSlotIndex(slotIndex);
    setSelectionNotice("");
    setShowPlayerList(true);
  }

  async function handleSimulateLastMatchweek(reset = false) {
    setSimulationLoading(true);
    setSimulationMessage("");
    try {
      const res = await simulateLastMatchweekPoints(reset);
      setSimulationMessage(res?.detail || "Simulation finished.");
      const refreshed = await getMyTeam();
      if (refreshed) applyTeamPayload(refreshed);
    } catch (e) {
      setSimulationMessage(e.message || "Failed to simulate points.");
    } finally {
      setSimulationLoading(false);
    }
  }

  async function handleAutoOptimize() {
    try {
      const suggestions = await getMyTeamSuggestions();
      setStrategy(suggestions);

      const { lineup, missing } = optimizeSquadPlayers();
      setTeam((prev) => ({ ...prev, players: lineup }));

      const updated = await updateTeam({
        squad_id: currentSquadId,
        squad_name: squadName,
        players: lineup,
        formation: team.formation,
      });
      if (updated) applyTeamPayload(updated);

      if (missing.length > 0) {
        setSquadMessage("Some slots were left empty. No owned players available for this position.");
      } else {
        setSquadMessage("Auto-optimized using your best owned players for the current formation.");
      }
    } catch (e) {
      console.warn("Failed to load AI strategy", e);
      setSquadMessage("Failed to auto-optimize squad.");
    }
  }

  return (
    <ProtectedRoute>
      <div className="container mx-auto p-6 md:p-10 max-w-7xl">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <ShieldCheck className="h-8 w-8 text-primary" />
            Squad Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Build, optimize, and manage your starting XI for the next gameweek.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2">
            <input
              className="px-3 py-2 rounded-md border"
              placeholder="Filter bought players"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <button
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-sm font-medium"
              onClick={() => setShowPlayerList((s) => !s)}
            >
              <Filter className="h-4 w-4" />
              Browse
            </button>
          </div>
          <Link
            href={APP_ROUTES.transfers}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/50 text-primary hover:bg-primary/5 transition-all text-sm font-bold"
          >
            <ArrowRightLeft className="h-4 w-4" />
            Transfer Market
          </Link>
          <button
            onClick={handleNewSquad}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity text-sm font-bold shadow-lg shadow-primary/20"
          >
            <Plus className="h-4 w-4" />
            New Squad
          </button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Field View (Interactive) */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="lg:col-span-2 space-y-6"
        >
          <div
            className="card rounded-3xl relative overflow-hidden flex items-center justify-center p-8"
            style={{ aspectRatio: "4 / 5" }}
          >
            <div
              className="absolute inset-0 opacity-20 pointer-events-none"
              style={{
                backgroundImage:
                  "radial-gradient(circle at center, transparent 30%, #000 100%), repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(255,255,255,0.05) 40px, rgba(255,255,255,0.05) 80px)",
              }}
            />

            <div className="relative z-10 w-full h-full flex flex-col justify-around py-4">
              {(() => {
                const [d, m, f] = team.formation.split("-").map(Number);
                const rows = [
                  { label: "FWD", count: f, start: 0, color: "primary" },
                  { label: "MID", count: m, start: f, color: "primary" },
                  { label: "DEF", count: d, start: f + m, color: "primary" },
                  { label: "GK", count: 1, start: f + m + d, color: "yellow-500" },
                  { label: "BENCH", count: 4, start: 11, color: "muted-foreground" },
                ];

                return rows.map((row, rowIdx) => (
                  <div key={rowIdx} className="flex justify-center gap-4 md:gap-12 px-4">
                    {Array.from({ length: row.count }).map((_, i) => {
                      const slotIdx = row.start + i;
                      const p = team.players?.[slotIdx];
                      const borderColor = row.color === "yellow-500" ? "hover:border-yellow-500" : "hover:border-primary";
                      const activeColor = row.color === "yellow-500" ? "border-yellow-500/40" : "border-primary/40";
                      
                      return (
                        <motion.div
                          key={i}
                          variants={itemVariants}
                          className="flex flex-col items-center gap-2"
                        >
                          <div
                            onClick={() => openPlayerSelector(slotIdx)}
                            className={`h-14 w-14 md:h-20 md:w-20 rounded-2xl ${p ? "bg-primary/10 " + activeColor : "bg-card border-border"} border-2 shadow-xl flex items-center justify-center group cursor-pointer ${borderColor} transition-all relative`}
                          >
                            {p ? (
                              <div className="text-[10px] md:text-xs font-black text-center px-1 leading-tight uppercase">
                                {p.name.split(' ').pop()}
                              </div>
                            ) : (
                              <Users className={`h-6 w-6 md:h-8 md:w-8 text-muted-foreground group-hover:text-${row.color}`} />
                            )}
                            
                            {p && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemovePlayer(slotIdx);
                                }}
                                className="absolute -top-2 -right-2 h-5 w-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                          <span className="text-[8px] md:text-[10px] font-black bg-background/80 px-2 py-0.5 rounded text-muted-foreground border border-border/50 uppercase tracking-tighter">
                            {p ? p.team : row.label}
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>
          </div>
        </motion.div>

        {/* Sidebar Controls */}
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="card p-6"
          >
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Squads
            </h3>
            <div className="space-y-3">
              <select
                className="w-full px-3 py-2 rounded-md border border-border bg-background"
                value={currentSquadId}
                onChange={(e) => handleSwitchSquad(e.target.value)}
              >
                {squads.map((squad) => (
                  <option key={squad.id} value={squad.id}>
                    {squad.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  className="flex-1 px-3 py-2 rounded-md border border-border bg-background"
                  value={squadName}
                  onChange={(e) => setSquadName(e.target.value)}
                  placeholder="Squad name"
                />
                <button
                  onClick={handleSaveSquadName}
                  className="px-3 py-2 rounded-lg border border-primary/50 text-primary text-xs font-bold hover:bg-primary/5"
                >
                  Save
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  className="flex-1 px-3 py-2 rounded-md border border-border bg-background"
                  value={newSquadName}
                  onChange={(e) => setNewSquadName(e.target.value)}
                  placeholder="New squad name"
                />
                <button
                  onClick={handleNewSquad}
                  className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold"
                >
                  Create
                </button>
              </div>
              {squadMessage ? <p className="text-xs text-muted-foreground">{squadMessage}</p> : null}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="card p-6"
          >
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Squad Intel
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 rounded-xl bg-muted/30 border border-border">
                <span className="text-sm text-muted-foreground font-medium">Budget Remaining</span>
                <span className="font-bold">EUR {(team.budget / 1000000).toFixed(1)}m</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-xl bg-muted/30 border border-border">
                <span className="text-sm text-muted-foreground font-medium">Bought Players</span>
                <span className="font-bold text-green-500">{team.owned_count || ownedPlayers.length}/{team.max_players || 15}</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-xl bg-muted/30 border border-border">
                <span className="text-sm text-muted-foreground font-medium">Current Formation</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{team.formation}</span>
                  <div className="relative">
                    <button
                      onClick={() => setShowFormationMenu((s) => !s)}
                      className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90"
                    >
                      Change
                    </button>
                    {showFormationMenu && (
                      <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-lg p-2 z-40 shadow-lg">
                        <div className="text-xs font-bold text-muted-foreground mb-2">
                          Preset Formations
                        </div>
                        {FORMATION_PRESETS.map((f) => (
                          <button
                            key={f.name}
                            onClick={() => handleChangeFormation(f.name)}
                            className={`w-full text-left px-2 py-2 rounded text-xs ${
                              team.formation === f.name
                                ? "bg-primary/20 text-primary font-bold"
                                : "hover:bg-muted/50"
                            }`}
                          >
                            <div className="font-bold">{f.name}</div>
                            <div className="text-muted-foreground">{f.label}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleAutoOptimize}
              className="w-full mt-6 py-3 rounded-xl border border-primary text-primary font-bold text-sm hover:bg-primary/10 transition-colors flex items-center justify-center gap-2"
            >
              <ArrowRightLeft className="h-4 w-4" />
              Auto-Optimize Squad
            </button>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <button
                onClick={() => handleSimulateLastMatchweek(false)}
                disabled={simulationLoading}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity"
              >
                {simulationLoading ? "Simulating..." : "Simulate Last Matchweek Points"}
              </button>
              <button
                onClick={() => handleSimulateLastMatchweek(true)}
                disabled={simulationLoading}
                className="w-full py-2 rounded-xl border border-border text-muted-foreground font-bold text-xs hover:bg-muted/30 transition-colors"
              >
                Reset Simulation Points
              </button>
              {simulationMessage ? <p className="text-xs text-muted-foreground">{simulationMessage}</p> : null}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0, transition: { delay: 0.1 } }}
            className="card p-6"
          >
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-muted-foreground" />
              AI Strategy
            </h3>
            <div className="space-y-4">
              {team.players && team.players.length > 0 ? (
                <>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {strategy?.formation_insight ||
                      "Your current squad is weighted towards defensive stability. AI suggests targeting offensive assets for upcoming fixtures."}
                  </p>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary w-[65%]" />
                  </div>
                  <p className="text-[10px] text-right text-muted-foreground font-bold uppercase tracking-wider">
                    Confidence: {Math.round((strategy?.confidence_scores?.formation || 0.65) * 100)}%
                  </p>
                </>
              ) : (
                <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded border border-border/50">
                  <p className="font-semibold text-primary mb-1">No bought players selected</p>
                  <p>
                    Buy players in the transfer market to receive AI strategy recommendations and transfer
                    insights.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Player List Drawer */}
      {showPlayerList && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-end">
          <div className="w-full md:w-96 h-full bg-card p-4 overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold">Bought Players</h3>
                {selectedSlotIndex !== null && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Selecting for: <span className="font-semibold text-primary">{getPositionForSlot(selectedSlotIndex)}</span>
                  </p>
                )}
              </div>
              <button
                onClick={() => setShowPlayerList(false)}
                className="text-sm text-muted-foreground"
              >
                Close
              </button>
            </div>
            <input
              placeholder="Filter bought players by name"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-md border mb-4"
            />
            {selectionNotice ? (
              <div className="mb-3 p-3 text-sm text-yellow-700 dark:text-yellow-300 border border-yellow-500/30 bg-yellow-500/10 rounded">
                {selectionNotice}
              </div>
            ) : null}
            <div className="space-y-2">
              {filteredPlayers().length > 0 ? (
                filteredPlayers().map((p) => (
                  <div
                    key={p.id}
                    className="p-2 border rounded cursor-pointer hover:bg-muted/30"
                    onClick={() => handleSelectPlayer(p)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.position} - {p.team}
                        </div>
                      </div>
                      <div className="text-sm text-primary">Select</div>
                    </div>
                  </div>
                ))
              ) : selectedSlotIndex !== null && getPositionForSlot(selectedSlotIndex) !== "BENCH" ? (
                <div className="p-4 text-sm text-muted-foreground border border-dashed border-border rounded bg-muted/20">
                  <p className="font-semibold text-yellow-600 dark:text-yellow-400 mb-2">
                    No owned players available for this position.
                  </p>
                  <p>Buy players in the Transfer Market to fill this slot.</p>
                </div>
              ) : (
                <div className="p-4 text-sm text-muted-foreground border border-dashed border-border rounded">
                  Buy players in the Transfer Market before selecting them for your team.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </ProtectedRoute>
  );
}
