"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Calendar, Clock, Trophy, ChevronRight, Filter, AlertCircle, BarChart3, RotateCcw } from "lucide-react";
import { getLiveScores, getMatchDetails, getMatchDifficulty, getMatches, getMatchStatistics } from "@/services/footballApiService";
import { syncPoints } from "@/services/leaderboardService";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function MatchesPage() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("all"); // all, finished, scheduled
  const [liveScores, setLiveScores] = useState([]);
  const [difficulty, setDifficulty] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [matchDetails, setMatchDetails] = useState({});
  const [loadingDetails, setLoadingDetails] = useState({});
  const [detailErrors, setDetailErrors] = useState({});

  useEffect(() => {
    let mounted = true;
    Promise.all([getMatches(), getLiveScores(), getMatchDifficulty()])
      .then(([data, live, difficultyData]) => {
        if (!mounted) return;
        setMatches(data || []);
        setLiveScores(live || []);
        setDifficulty(difficultyData || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch matches:", err);
        setError("Unable to load match data. Please try again later.");
        setLoading(false);
      });
    const interval = setInterval(() => {
      Promise.all([getLiveScores(), getMatches(), syncPoints()])
        .then(([live, latestMatches]) => {
          setLiveScores(live || []);
          setMatches(latestMatches || []);
        })
        .catch(() => {});
    }, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const filteredMatches = useMemo(() => {
    const getKickoffTime = (match) => {
      const time = new Date(match.kickoff).getTime();
      return Number.isNaN(time) ? 0 : time;
    };

    return matches
      .filter((m) => {
        if (activeTab === "finished") return m.status === "FINISHED";
        if (activeTab === "scheduled") return m.status === "SCHEDULED" || m.status === "TIMED";
        return true;
      })
      .sort((a, b) => {
        if (activeTab === "scheduled") {
          return getKickoffTime(a) - getKickoffTime(b);
        }
        return getKickoffTime(b) - getKickoffTime(a);
      });
  }, [activeTab, matches]);

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return "-";
    return `${formatDate(dateStr)} at ${formatTime(dateStr)}`;
  };

  const getDetailRows = (match) =>
    [
      ["Competition", match.competition],
      ["Season", match.season_start && match.season_end ? `${match.season_start} to ${match.season_end}` : null],
      ["Matchweek", match.matchday ? `Matchweek ${match.matchday}` : null],
      ["Stage", match.stage],
      ["Kickoff", formatDateTime(match.kickoff)],
      ["Last updated", match.last_updated ? formatDateTime(match.last_updated) : null],
      ["Half time", match.half_time_score],
      ["Full time", match.full_time_score],
      ["Winner", match.winner ? match.winner.replace("_TEAM", " team").toLowerCase() : null],
      ["Duration", match.duration],
      ["Referee", match.referees?.length ? match.referees.join(", ") : null],
    ].filter(([, value]) => value);

  const statLabels = [
    ["goals", "Goals"],
    ["half_time_goals", "Half-time goals"],
    ["shots", "Total shots"],
    ["shots_on_target", "Shots on target"],
    ["possession", "Possession", "%"],
    ["pass_accuracy", "Pass accuracy", "%"],
    ["passes", "Total passes"],
    ["fouls", "Fouls"],
    ["yellow_cards", "Yellow cards"],
    ["yellow_red_cards", "Second yellows"],
    ["red_cards", "Red cards"],
    ["offsides", "Offsides"],
    ["corners", "Corners"],
    ["saves", "Saves"],
    ["shots_off_target", "Shots off target"],
    ["free_kicks", "Free kicks"],
    ["goal_kicks", "Goal kicks"],
    ["throw_ins", "Throw-ins"],
    ["xg", "Expected goals"],
    ["big_chances", "Big chances"],
  ];

  const formatStat = (value, suffix = "") => {
    if (value === null || value === undefined || value === "") return "N/A";
    return `${value}${suffix}`;
  };

  const comparisonPercent = (homeValue, awayValue) => {
    const home = Number(homeValue || 0);
    const away = Number(awayValue || 0);
    if (!home && !away) return 50;
    return Math.max(8, Math.min(92, (home / (home + away)) * 100));
  };

  const hasUsableDetail = (detail) => Boolean(detail?.stats?.available || detail?.events?.length);

  async function loadMatchDetails(match, force = false) {
    const matchId = String(match.id);
    if (!force && (matchDetails[matchId] || loadingDetails[matchId])) return;

    setLoadingDetails((prev) => ({ ...prev, [matchId]: true }));
    setDetailErrors((prev) => ({ ...prev, [matchId]: "" }));
    try {
      const [detail, statsResponse] = await Promise.all([
        getMatchDetails(match.id),
        getMatchStatistics(match.id).catch(() => null),
      ]);
      const mergedDetail = statsResponse?.stats
        ? { ...detail, stats: statsResponse.stats }
        : detail;

      if (process.env.NODE_ENV !== "production") {
        console.debug("[matches] stats received", {
          fixtureId: match.id,
          source: mergedDetail?.stats?.source,
          providersAttempted: mergedDetail?.stats?.providers_attempted,
          home: {
            possession: mergedDetail?.stats?.home?.possession,
            passes: mergedDetail?.stats?.home?.passes,
            passAccuracy: mergedDetail?.stats?.home?.pass_accuracy,
          },
          away: {
            possession: mergedDetail?.stats?.away?.possession,
            passes: mergedDetail?.stats?.away?.passes,
            passAccuracy: mergedDetail?.stats?.away?.pass_accuracy,
          },
        });
      }

      setMatchDetails((prev) => ({ ...prev, [matchId]: mergedDetail }));
      setDetailErrors((prev) => ({ ...prev, [matchId]: "" }));
      setMatches((prev) => prev.map((item) => (String(item.id) === matchId ? { ...item, ...mergedDetail } : item)));
      if (typeof window !== "undefined" && hasUsableDetail(mergedDetail)) {
        const cached = JSON.parse(localStorage.getItem("ff_match_details_cache") || "{}");
        cached[matchId] = { detail: mergedDetail };
        localStorage.setItem("ff_match_details_cache", JSON.stringify(cached));
      }
    } catch (err) {
      let cachedDetail = null;
      try {
        const cached = typeof window !== "undefined"
          ? JSON.parse(localStorage.getItem("ff_match_details_cache") || "{}")
          : {};
        const candidate = cached[matchId]?.detail || null;
        cachedDetail = hasUsableDetail(candidate) ? candidate : null;
      } catch (cacheError) {
        console.warn("Failed to read cached match details", cacheError);
      }

      if (cachedDetail) {
        setMatchDetails((prev) => ({ ...prev, [matchId]: cachedDetail }));
        setDetailErrors((prev) => ({
          ...prev,
          [matchId]: "Showing cached statistics while providers are temporarily unavailable.",
        }));
      } else {
        setMatchDetails((prev) => ({
          ...prev,
          [matchId]: {
            ...match,
            stats: {
              home: {},
              away: {},
              available: false,
              message: "Statistics providers are temporarily unavailable. Please retry in a moment.",
              providers_attempted: ["football-data.org", "API-FOOTBALL", "TheSportsDB", "football-data.co.uk"],
            },
          },
        }));
        setDetailErrors((prev) => ({
          ...prev,
          [matchId]: "Statistics providers are temporarily unavailable. Please retry in a moment.",
        }));
      }
    } finally {
      setLoadingDetails((prev) => ({ ...prev, [matchId]: false }));
    }
  }

  async function toggleMatchDetails(match) {
    const matchId = String(match.id);
    if (String(selectedMatch?.id) === matchId) {
      setSelectedMatch(null);
      return;
    }

    setSelectedMatch(match);
    await loadMatchDetails(match);
  }

  async function retryMatchDetails(match) {
    const matchId = String(match.id);
    setMatchDetails((prev) => {
      const next = { ...prev };
      delete next[matchId];
      return next;
    });
    setDetailErrors((prev) => ({ ...prev, [matchId]: "" }));
    setSelectedMatch(match);
    await loadMatchDetails(match, true);
  }

  return (
    <ProtectedRoute>
      <div className="container mx-auto p-6 md:p-10 max-w-5xl">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10"
      >
        <h1 className="text-4xl font-extrabold tracking-tight mb-2">Premier League Fixtures</h1>
        <p className="text-muted-foreground text-lg">
          Stay updated with the latest results and upcoming matches from the Premier League.
        </p>
      </motion.div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex p-1 bg-muted rounded-xl w-fit">
          {["all", "finished", "scheduled"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === tab
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 px-4 py-2 rounded-lg border border-border">
          <Filter className="h-4 w-4" />
          <span>Showing {filteredMatches.length} matches</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 px-4 py-2 rounded-lg border border-border">
          <Clock className="h-4 w-4 text-primary" />
          <span>{liveScores.length} live</span>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-muted-foreground animate-pulse">Fetching match data...</p>
        </div>
      ) : error ? (
        <div className="card p-12 text-center flex flex-col items-center border-destructive/20 bg-destructive/5">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h3 className="text-xl font-bold mb-2">Something went wrong</h3>
          <p className="text-muted-foreground max-w-md">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-6 px-6 py-2 bg-primary text-primary-foreground rounded-lg font-bold"
          >
            Try Again
          </button>
        </div>
      ) : (
        <div className="grid gap-6">
          {activeTab === "scheduled" && difficulty.length > 0 ? (
            <div className="card p-6">
              <h2 className="text-xl font-bold mb-4">Upcoming Match Difficulty</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {difficulty.slice(0, 6).map((match) => (
                  <div key={match.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div>
                      <p className="font-bold text-sm">{match.home_team} vs {match.away_team}</p>
                      <p className="text-xs text-muted-foreground">Matchweek {match.matchday || "-"}</p>
                    </div>
                    <span className="text-xs font-bold text-primary">{match.difficulty_label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {filteredMatches.length > 0 ? (
            filteredMatches.map((match, idx) => {
              const isExpanded = String(selectedMatch?.id) === String(match.id);
              const matchId = String(match.id);
              const displayMatch = matchDetails[matchId] || match;
              const detailRows = getDetailRows(displayMatch);
              const stats = displayMatch.stats || {};
              const summaryStats = [
                ["shots", "Shots"],
                ["shots_on_target", "Shots on target"],
                ["possession", "Possession", "%"],
                ["passes", "Passes"],
                ["pass_accuracy", "Pass accuracy", "%"],
              ];
              const hasStats = Boolean(stats.available);
              const visibleStatLabels = statLabels.filter(([key]) => {
                const homeValue = stats.home?.[key];
                const awayValue = stats.away?.[key];
                return homeValue !== null && homeValue !== undefined || awayValue !== null && awayValue !== undefined;
              });
              const events = displayMatch.events || [];
              const isDetailLoading = Boolean(loadingDetails[matchId]);
              const detailError = detailErrors[matchId];
              return (
                <motion.div
                  key={match.id || idx}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="group relative"
                >
                  <div className="card hover:border-primary/50 transition-all duration-300 overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  
                  <div className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                    {/* Date & Time */}
                    <div className="flex flex-col items-center md:items-start min-w-30">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Calendar className="h-4 w-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">{formatDate(match.kickoff)}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-sm">
                        <Clock className="h-4 w-4 text-primary" />
                        <span>{formatTime(match.kickoff)}</span>
                      </div>
                    </div>

                    {/* Teams & Score */}
                    <div className="flex-1 flex items-center justify-center gap-4 md:gap-8 w-full">
                      <div className="flex-1 text-right">
                        <span className="text-lg md:text-xl font-bold truncate block">{match.home_team}</span>
                      </div>
                      
                      <div className="flex flex-col items-center justify-center min-w-20">
                        {match.status === "FINISHED" && match.score ? (
                          <div className="bg-primary/10 text-primary px-4 py-2 rounded-xl border border-primary/20 flex items-center gap-3">
                            <span className="text-2xl font-black">{match.score.split(' - ')[0]}</span>
                            <span className="text-muted-foreground font-light">:</span>
                            <span className="text-2xl font-black">{match.score.split(' - ')[1]}</span>
                          </div>
                        ) : (
                          <div className="bg-muted px-4 py-2 rounded-xl text-xs font-bold text-muted-foreground uppercase tracking-widest border border-border">
                            VS
                          </div>
                        )}
                        <span className={`text-[10px] mt-2 font-bold uppercase tracking-tighter ${match.status === "FINISHED" ? "text-green-500" : "text-yellow-500"}`}>
                          {match.status}
                        </span>
                      </div>

                      <div className="flex-1 text-left">
                        <span className="text-lg md:text-xl font-bold truncate block">{match.away_team}</span>
                      </div>
                    </div>

                    {/* Action */}
                    <div className="block">
                      <button
                        type="button"
                        onClick={() => toggleMatchDetails(match)}
                        aria-label={`View details for ${match.home_team} vs ${match.away_team}`}
                        className="h-10 w-10 rounded-full bg-muted flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-all"
                      >
                        <ChevronRight className={`h-5 w-5 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                      </button>
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {isExpanded ? (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden border-t border-border/60 bg-background/30"
                      >
                        <div className="p-6 space-y-6">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="text-xs font-black uppercase tracking-widest text-primary">Match center</p>
                              <h3 className="mt-1 text-xl font-black">{displayMatch.home_team} vs {displayMatch.away_team}</h3>
                            </div>
                            <BarChart3 className="h-6 w-6 text-primary" />
                          </div>
                                {hasStats ? (
                                  <div className="rounded-lg border border-border p-4 bg-muted/10">
                                    <h4 className="mb-3 text-sm font-black text-muted-foreground">Team stats</h4>
                                    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 text-sm">
                                      <div className="flex flex-col items-end space-y-2">
                                        {summaryStats.map(([key, label, suffix]) => (
                                          <span key={`home-${key}`} className="h-6 w-6 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-black">
                                            {formatStat(stats.home?.[key], suffix || "")}
                                          </span>
                                        ))}
                                      </div>
                                      <div className="flex flex-col space-y-2 text-center text-xs text-muted-foreground">
                                        {summaryStats.map(([key, label]) => (
                                          <span key={`label-${key}`}>{label}</span>
                                        ))}
                                      </div>
                                      <div className="flex flex-col items-start space-y-2">
                                        {summaryStats.map(([key, label, suffix]) => (
                                          <span key={`away-${key}`} className="h-6 w-6 flex items-center justify-center rounded-full bg-muted text-xs font-black">
                                            {formatStat(stats.away?.[key], suffix || "")}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                ) : null}

                                {isDetailLoading ? (
                            <div className="rounded-lg border border-border bg-muted/10 p-4">
                              <div className="mb-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                                <div className="ml-auto h-4 w-28 animate-pulse rounded bg-muted" />
                                <div className="h-3 w-10 animate-pulse rounded bg-muted" />
                                <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                              </div>
                              <div className="space-y-4">
                                {[1, 2, 3, 4, 5, 6].map((item) => (
                                  <div key={item} className="space-y-2">
                                    <div className="mx-auto h-3 w-40 animate-pulse rounded bg-muted" />
                                    <div className="h-2 animate-pulse rounded-full bg-muted" />
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : hasStats ? (
                            <div className="rounded-lg border border-border bg-muted/10 p-4">
                              <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm font-black">
                                <span className="truncate text-right">{displayMatch.home_team}</span>
                                <span className="text-xs uppercase tracking-widest text-muted-foreground">
                                  {stats.source === "football-data.co.uk" ? "Result stats" : "Stats"}
                                </span>
                                <span className="truncate text-left">{displayMatch.away_team}</span>
                              </div>
                              <div className="space-y-4">
                                {visibleStatLabels.map(([key, label, suffix]) => {
                                  const homeValue = stats.home?.[key];
                                  const awayValue = stats.away?.[key];
                                  const width = comparisonPercent(homeValue, awayValue);
                                  const showBar = ["possession", "pass_accuracy", "shots", "shots_on_target", "passes"].includes(key);
                                  return (
                                    <div key={key} className="space-y-2">
                                      <div className="grid grid-cols-[3rem_1fr_3rem] items-center gap-3 text-xs">
                                        <span className="text-right font-black">{formatStat(homeValue, suffix)}</span>
                                        <span className="text-center text-muted-foreground">{label}</span>
                                        <span className="font-black">{formatStat(awayValue, suffix)}</span>
                                      </div>
                                      {showBar ? (
                                        <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                                          <div className="bg-primary" style={{ width: `${width}%` }} />
                                          <div className="bg-cyan-200/40" style={{ width: `${100 - width}%` }} />
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                              {stats.unavailable_fields?.length ? (
                                <p className="mt-4 text-[11px] text-muted-foreground">
                                  Some provider fields are not published for this fixture: {stats.unavailable_fields.map((field) => field.replaceAll("_", " ")).join(", ")}.
                                </p>
                              ) : null}
                              {stats.providers_succeeded?.length ? (
                                <p className="mt-2 text-[11px] text-muted-foreground">
                                  Source: {stats.providers_succeeded.join(", ")}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
                              <div className="text-center">
                                <p className="font-bold text-card-foreground">
                                  {detailError?.includes("cached") ? "Limited cached statistics" : "Advanced statistics are unavailable for this match."}
                                </p>
                                <p className="mx-auto mt-2 max-w-xl">
                                  {detailError || stats.message || "All configured providers were checked. Scores, fixture details, and available timeline events are still shown below."}
                                </p>
                                <div className="mt-3 text-[11px]">
                                  Providers checked: {(stats.providers_attempted || ["football-data.org", "TheSportsDB", "football-data.co.uk"]).join(", ")}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => retryMatchDetails(match)}
                                  className="mt-4 inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-black text-primary hover:bg-muted"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                  Retry providers
                                </button>
                              </div>
                            </div>
                          )}

                          {events.length > 0 ? (
                            <div className="rounded-lg border border-border bg-muted/10 p-4">
                              <h4 className="mb-3 text-sm font-black">Match timeline</h4>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {events.slice(0, 10).map((event, eventIndex) => (
                                  <div key={`${event.minute}-${event.type}-${eventIndex}`} className="rounded-md border border-border/60 p-3 text-xs">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-black text-primary">
                                        {event.minute ?? "-"}{event.injury_time ? `+${event.injury_time}` : "'"}
                                      </span>
                                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{event.label}</span>
                                    </div>
                                    <p className="mt-1 font-bold">{event.player || event.team || "Match event"}</p>
                                    {event.assist ? <p className="text-muted-foreground">Assist: {event.assist}</p> : null}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {detailRows.map(([label, value]) => (
                              <div key={label} className="rounded-lg border border-border p-4 bg-muted/20">
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                                  {label}
                                </p>
                                <p className="text-sm font-bold capitalize">{value}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </motion.div>
              );
            })
          ) : (
            <div className="card p-20 text-center flex flex-col items-center">
              <Trophy className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
              <p className="text-muted-foreground text-lg italic">No matches found for this filter.</p>
            </div>
          )}
        </div>
      )}
      </div>
    </ProtectedRoute>
  );
}