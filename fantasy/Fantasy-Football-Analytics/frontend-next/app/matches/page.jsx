"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Calendar, Clock, Trophy, ChevronRight, Filter, AlertCircle, X } from "lucide-react";
import { getLiveScores, getMatchDifficulty, getMatches } from "@/services/footballApiService";
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

  const detailRows = selectedMatch
    ? [
        ["Competition", selectedMatch.competition],
        ["Season", selectedMatch.season_start && selectedMatch.season_end ? `${selectedMatch.season_start} to ${selectedMatch.season_end}` : null],
        ["Matchweek", selectedMatch.matchday ? `Matchweek ${selectedMatch.matchday}` : null],
        ["Stage", selectedMatch.stage],
        ["Kickoff", formatDateTime(selectedMatch.kickoff)],
        ["Last updated", selectedMatch.last_updated ? formatDateTime(selectedMatch.last_updated) : null],
        ["Half time", selectedMatch.half_time_score],
        ["Full time", selectedMatch.full_time_score],
        ["Winner", selectedMatch.winner ? selectedMatch.winner.replace("_TEAM", " team").toLowerCase() : null],
        ["Duration", selectedMatch.duration],
        ["Referee", selectedMatch.referees?.length ? selectedMatch.referees.join(", ") : null],
      ].filter(([, value]) => value)
    : [];

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
            filteredMatches.map((match, idx) => (
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
                    <div className="flex flex-col items-center md:items-start min-w-[120px]">
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
                      
                      <div className="flex flex-col items-center justify-center min-w-[80px]">
                        {match.status === "FINISHED" ? (
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
                        onClick={() => setSelectedMatch(match)}
                        aria-label={`View details for ${match.home_team} vs ${match.away_team}`}
                        className="h-10 w-10 rounded-full bg-muted flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-all"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="card p-20 text-center flex flex-col items-center">
              <Trophy className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
              <p className="text-muted-foreground text-lg italic">No matches found for this filter.</p>
            </div>
          )}
        </div>
      )}
      {selectedMatch ? (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-border flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">
                  {selectedMatch.status}
                </p>
                <h2 className="text-2xl font-black">
                  {selectedMatch.home_team} vs {selectedMatch.away_team}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">{formatDateTime(selectedMatch.kickoff)}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMatch(null)}
                aria-label="Close match details"
                className="h-10 w-10 rounded-full bg-muted flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6">
              <div className="flex items-center justify-center gap-4 md:gap-8 mb-8">
                <div className="flex-1 text-right">
                  <p className="text-lg font-black">{selectedMatch.home_team}</p>
                  <p className="text-xs text-muted-foreground">Home</p>
                </div>
                <div className="min-w-[120px] text-center">
                  {selectedMatch.score ? (
                    <div className="text-4xl font-black text-primary">{selectedMatch.score.replace(" - ", " : ")}</div>
                  ) : (
                    <div className="px-4 py-3 rounded-xl bg-muted text-xs font-black uppercase tracking-widest">VS</div>
                  )}
                </div>
                <div className="flex-1 text-left">
                  <p className="text-lg font-black">{selectedMatch.away_team}</p>
                  <p className="text-xs text-muted-foreground">Away</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {detailRows.map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-border p-4 bg-muted/20">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                      {label}
                    </p>
                    <p className="text-sm font-bold capitalize">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
      </div>
    </ProtectedRoute>
  );
}
