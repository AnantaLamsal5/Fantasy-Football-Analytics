"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, TrendingUp, Trophy, Users } from "lucide-react";
import { getDashboard } from "@/services/leaderboardService";
import { getTopAttackers } from "@/services/footballApiService";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: "spring", stiffness: 100 },
  },
};

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [topAttackers, setTopAttackers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([getDashboard(), getTopAttackers().catch(() => [])])
      .then(([payload, attackers]) => {
        if (mounted) {
          setData(payload);
          setTopAttackers(attackers || []);
          if (typeof window !== "undefined") {
            localStorage.setItem("ff_dashboard_cache", JSON.stringify({
              payload,
              attackers: attackers || [],
              cached_at: Date.now(),
            }));
          }
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          try {
            const cached = typeof window !== "undefined"
              ? JSON.parse(localStorage.getItem("ff_dashboard_cache") || "{}")
              : {};
            if (cached.payload) {
              setData(cached.payload);
              setTopAttackers(cached.attackers || []);
              setError("");
              setLoading(false);
              return;
            }
          } catch (cacheError) {
            console.warn("Failed to read dashboard cache", cacheError);
          }
          setError(err.message || "Failed to load dashboard.");
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto p-6 md:p-10 space-y-8 animate-pulse">
        <div className="h-10 w-48 bg-muted rounded-md mb-8"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card h-32" />
          ))}
        </div>
        <div className="card h-96 mt-8" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-10 flex flex-col items-center justify-center min-h-[50vh]">
        <div className="bg-destructive/10 text-destructive p-6 rounded-xl border border-destructive/20 max-w-md text-center">
          <Activity className="h-10 w-10 mx-auto mb-4 opacity-80" />
          <h2 className="text-xl font-bold mb-2">Error Loading Dashboard</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // Clean, structured data handling from backend
  const pointsHistory = data?.points_history?.length
    ? data.points_history
    : [
        { week: "MW 1", points: data?.points || 0 },
        { week: "MW 2", points: data?.points || 0 },
      ];
  const maxPoints = Math.max(...pointsHistory.map((item) => Number(item.points) || 0), 1);

  const stats = [
    { label: "Total Points", value: data?.points || "0", icon: Trophy, color: "text-yellow-500" },
    { label: "Global Rank", value: data?.rank || "N/A", icon: TrendingUp, color: "text-primary" },
    {
      label: "Budget Remaining",
      value: data?.budget ? `EUR ${(data.budget / 1000000).toFixed(1)}m` : "EUR 50.0m",
      icon: Activity,
      color: "text-green-500",
    },
  ];

  return (
    <div className="container mx-auto p-6 md:p-10">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-8"
      >
        <div>
          <motion.h1 variants={itemVariants} className="text-3xl font-bold tracking-tight">
            Manager Dashboard
          </motion.h1>
          <motion.p variants={itemVariants} className="text-muted-foreground mt-1">
            Overview of your team&apos;s performance and analytics.
          </motion.p>
        </div>

        {/* Stats Row */}
        <motion.div
          variants={containerVariants}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {stats.map((stat, idx) => (
            <motion.div
              key={idx}
              variants={itemVariants}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="card p-6 flex items-center"
            >
              <div className={`p-3 rounded-lg bg-muted/50 ${stat.color}`}>
                <stat.icon className="h-6 w-6" />
              </div>
              <div className="ml-5">
                <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                <h3 className="text-2xl font-bold mt-1">{stat.value}</h3>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Detailed Data Section */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4">
          <div className="lg:col-span-2 card p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold flex items-center">
                <TrendingUp className="mr-2 h-5 w-5 text-primary" />
                Top Attacking Players
              </h3>
            </div>
            <div className="space-y-3">
              {topAttackers.slice(0, 5).map((player) => {
                const maxGoals = Math.max(...topAttackers.map((item) => Number(item.goals) || 0), 1);
                return (
                  <div key={player.name} className="flex items-center gap-3">
                    <span className="w-36 text-sm font-bold truncate">{player.name}</span>
                    <div className="flex-1 h-7 bg-muted/50 rounded relative overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-500"
                        style={{ width: `${Math.max(8, (Number(player.goals || 0) / maxGoals) * 100)}%` }}
                      />
                    </div>
                    <span className="w-10 text-right font-bold text-primary">{player.goals}</span>
                  </div>
                );
              })}
              {topAttackers.length === 0 ? (
                <div className="h-64 flex items-center justify-center bg-muted/20 rounded-lg border border-dashed border-border">
                  <p className="text-muted-foreground">No attacker goal data available</p>
                </div>
              ) : null}
            </div>
          </div>
          <div className="card p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold flex items-center">
                <TrendingUp className="mr-2 h-5 w-5 text-primary" />
                Performance Trend
              </h3>
            </div>
            {data?.points ? (
              <div className="space-y-4">
                {/* Simple Bar Chart */}
                <div className="space-y-2">
                  {pointsHistory.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs font-bold w-10">{item.week}</span>
                      <div className="flex-1 h-6 bg-muted/50 rounded relative overflow-hidden">
                        <div
                          className="h-full bg-linear-to-r from-primary to-primary/70 transition-all duration-500"
                          style={{ width: `${Math.max(8, (Number(item.points || 0) / maxPoints) * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-right w-8">{item.points}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-4">
                  Updated every gameweek with live match data
                </p>
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center bg-muted/20 rounded-lg border border-dashed border-border">
                <p className="text-muted-foreground text-sm">
                  Build your team to see performance trends
                </p>
              </div>
            )}
          </div>

          <div className="card p-6">
            <h3 className="text-xl font-bold flex items-center mb-6">
              <Users className="mr-2 h-5 w-5 text-primary" />
              Team Overview
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center p-2 rounded border border-border/30">
                <span className="text-muted-foreground">Total Points</span>
                <span className="font-bold">{data?.points || 0}</span>
              </div>
              <div className="flex justify-between items-center p-2 rounded border border-border/30">
                <span className="text-muted-foreground">Rank</span>
                <span className="font-bold">{data?.rank || "N/A"}</span>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
