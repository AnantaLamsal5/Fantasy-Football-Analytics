"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BrainCircuit,
  Sparkles,
  TrendingUp,
  AlertCircle,
  ChevronRight,
  Info,
  Zap,
} from "lucide-react";
import {
  getFantasyPointsProjection,
  getMyTeamSuggestions,
  getPlayerPerformance,
  getWeekPredictions,
} from "@/services/predictionService";
import { getTransferMarket } from "@/services/transferService";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const cardVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: "spring", stiffness: 100, damping: 15 },
  },
};

export default function PredictionsPage() {
  const [weekData, setWeekData] = useState(null);
  const [teamSuggestions, setTeamSuggestions] = useState(null);
  const [projection, setProjection] = useState(null);
  const [playerName, setPlayerName] = useState("");
  const [playerPerformance, setPlayerPerformance] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    Promise.all([getWeekPredictions(1, 0.5), getMyTeamSuggestions(), getFantasyPointsProjection()])
      .then(([week, suggestions, points]) => {
        if (mounted) {
          setWeekData(week);
          setTeamSuggestions(suggestions);
          setProjection(points);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err.message || "Failed to load predictions.");
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function analyzePlayer(event) {
    event.preventDefault();
    if (!playerName.trim()) return;
    try {
      const data = await getPlayerPerformance(playerName.trim());
      setPlayerPerformance(data);
    } catch (err) {
      setError(err.message || "Failed to analyze player.");
    }
  }

  const transferSuggestions = Array.isArray(teamSuggestions?.transfer_suggestions)
    ? teamSuggestions.transfer_suggestions
    : [];

  return (
    <div className="container mx-auto p-6 md:p-10 max-w-7xl">
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-primary/20 rounded-lg">
            <BrainCircuit className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">AI Predictions Hub</h1>
        </div>
        <p className="text-muted-foreground text-lg">
          Leveraging machine learning to project player performance and optimize your strategy.
        </p>
      </motion.div>

      {error && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-xl flex items-center gap-3 mb-8"
        >
          <AlertCircle className="h-5 w-5" />
          <p>{error}</p>
        </motion.div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="h-8 w-48 bg-muted rounded animate-pulse" />
            <div className="h-64 bg-card border border-border rounded-2xl animate-pulse" />
          </div>
          <div className="space-y-4">
            <div className="h-8 w-48 bg-muted rounded animate-pulse" />
            <div className="h-64 bg-card border border-border rounded-2xl animate-pulse" />
          </div>
        </div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 lg:grid-cols-2 gap-8"
        >
          {/* Week Predictions Section */}
          <motion.div variants={cardVariants} className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-yellow-500" />
                Gameweek Projections
              </h2>
              <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded-full uppercase tracking-wider">
                Live Analysis
              </span>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm overflow-hidden relative group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <TrendingUp className="h-24 w-24" />
              </div>

              {weekData ? (
                <div className="space-y-4 relative z-10">
                  <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-xl border border-border/50">
                    <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                      GW
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground font-medium uppercase">
                        Upcoming Deadline
                      </p>
                      <p className="font-bold">Gameweek {weekData.week || "1"}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-border bg-muted/10">
                      <p className="text-xs text-muted-foreground mb-1 uppercase font-semibold">
                        Avg. Projected
                      </p>
                      <p className="text-2xl font-bold text-primary">
                        {projection?.projected_points ?? "0.0"}
                      </p>
                    </div>
                    <div className="p-4 rounded-xl border border-border bg-muted/10">
                      <p className="text-xs text-muted-foreground mb-1 uppercase font-semibold">
                        High Variance
                      </p>
                      <p className="text-2xl font-bold text-accent">12.4%</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                    <div className="flex items-start gap-3">
                      <Info className="h-5 w-5 text-primary mt-0.5" />
                      <p className="text-sm leading-relaxed">
                        {teamSuggestions?.formation_insight ||
                          "Model is ready to analyze your squad once players are selected."}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center text-muted-foreground">
                  No gameweek data currently available.
                </div>
              )}
            </div>
          </motion.div>

          {/* Team Suggestions Section */}
          <motion.div variants={cardVariants} className="space-y-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Zap className="h-5 w-5 text-accent" />
              Squad Optimization
            </h2>

            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col h-full">
              {transferSuggestions.length > 0 ? (
                <div className="flex-1 space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      Recommended Transfers
                    </p>
                    <button className="text-xs text-primary font-bold flex items-center hover:underline">
                      View All <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    {transferSuggestions.slice(0, 3).map((suggestion, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-3 rounded-xl border border-border hover:border-primary/50 transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500">
                            <TrendingUp className="h-4 w-4 rotate-180" />
                          </div>
                          <span className="font-semibold text-sm">
                            {suggestion.player_out || "Player Out"}
                          </span>
                        </div>
                        <div className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors">
                          <ChevronRight className="h-4 w-4" />
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-sm">
                            {suggestion.player_in || "Target In"}
                          </span>
                          <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500">
                            <TrendingUp className="h-4 w-4" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-auto pt-6">
                    <button className="w-full py-3 rounded-xl bg-foreground text-background font-bold text-sm hover:opacity-90 transition-opacity">
                      Apply Suggested Transfers
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center flex-1">
                  <AlertCircle className="h-12 w-12 text-muted/30 mb-4" />
                  <p className="text-muted-foreground font-medium mb-2">
                    No Transfer Suggestions Available
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Build your squad first to receive AI-powered transfer recommendations based on
                    upcoming fixtures and player performance predictions.
                  </p>
                  <a href="/teams" className="text-sm font-bold text-primary hover:underline">
                    Build Your Squad
                  </a>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}

      <div className="mt-8 card p-6">
        <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5 text-primary" />
          Player Performance Analysis
        </h2>
        <form onSubmit={analyzePlayer} className="flex flex-col md:flex-row gap-3">
          <input
            className="flex-1 px-4 py-2 rounded-md bg-input border border-border text-foreground"
            placeholder="Enter player name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />
          <button className="btn-primary" type="submit">Analyze</button>
        </form>
        {playerPerformance ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="p-4 rounded-xl border border-border bg-muted/10">
              <p className="text-xs text-muted-foreground uppercase font-semibold">Expected Goals</p>
              <p className="text-2xl font-bold text-primary">{playerPerformance.expected_goals}</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-muted/10">
              <p className="text-xs text-muted-foreground uppercase font-semibold">Expected Assists</p>
              <p className="text-2xl font-bold text-primary">{playerPerformance.expected_assists}</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-muted/10">
              <p className="text-xs text-muted-foreground uppercase font-semibold">Confidence</p>
              <p className="text-2xl font-bold text-primary">{Math.round((playerPerformance.confidence || 0) * 100)}%</p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Raw Data Toggle (for debugging) */}
      <motion.div variants={cardVariants} className="mt-12 pt-8 border-t border-border">
        <details className="group cursor-pointer">
          <summary className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors list-none flex items-center gap-2 uppercase tracking-widest">
            <span className="w-4 h-4 rounded-sm border border-muted-foreground flex items-center justify-center text-[10px] group-open:rotate-90 transition-transform">
              ▶
            </span>
            View Developer Analytics
          </summary>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <pre className="p-4 rounded-xl bg-black/40 border border-border text-[10px] text-muted-foreground overflow-auto max-h-40 font-mono">
              {JSON.stringify(weekData, null, 2)}
            </pre>
            <pre className="p-4 rounded-xl bg-black/40 border border-border text-[10px] text-muted-foreground overflow-auto max-h-40 font-mono">
              {JSON.stringify(teamSuggestions, null, 2)}
            </pre>
          </div>
        </details>
      </motion.div>
    </div>
  );
}
