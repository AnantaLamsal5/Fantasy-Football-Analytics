'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Medal, AlertCircle } from 'lucide-react';
import { getLeaderboard, getWeeklyLeaderboard } from '@/services/leaderboardService';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { x: -20, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 100 },
  },
};

export default function LeaderboardPage() {
  const [rows, setRows] = useState([]);
  const [activeTab, setActiveTab] = useState('all-time');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = activeTab === 'weekly' ? getWeeklyLeaderboard : getLeaderboard;
    load()
      .then((data) => {
        if (mounted) {
          setRows(data || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err.message || 'Failed to load leaderboard.');
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [activeTab]);

  const formatReward = (value) =>
    new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(Number(value || 0));

  return (
    <div className="container mx-auto p-6 md:p-10 max-w-5xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center">
            <Trophy className="mr-3 h-8 w-8 text-primary" />
            {activeTab === 'weekly' ? 'Weekly Leaderboard' : 'All Time Leaderboard'}
          </h1>
          <p className="text-muted-foreground mt-2">
            See how your team stacks up against managers worldwide.
          </p>
        </div>
        <div className="flex p-1 bg-muted rounded-xl">
          {[
            { id: 'all-time', label: 'All Time' },
            { id: 'weekly', label: 'Weekly' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setLoading(true);
                setActiveTab(tab.id);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === tab.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg flex items-center">
          <AlertCircle className="h-5 w-5 mr-2" />
          {error}
        </div>
      ) : loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="card h-12" />
          <div className="card h-16" />
          <div className="card h-16" />
          <div className="card h-16" />
        </div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="card overflow-hidden"
        >
          <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-muted/50 text-sm font-semibold text-muted-foreground uppercase tracking-wider rounded-t-lg">
            <div className="col-span-2 sm:col-span-1">Rank</div>
            <div className="col-span-5 sm:col-span-6">Manager</div>
            <div className="col-span-2 text-right">Reward</div>
            <div className="col-span-3 text-right">Points</div>
          </div>

          <div className="divide-y divide-border">
            {rows.length === 0 ? (
              <div className="px-6 py-8 text-center text-muted-foreground">
                No ranking data available at the moment.
              </div>
            ) : (
              rows.map((row, index) => {
                const rank = row.rank || index + 1;
                return (
                  <motion.div
                    key={row.username || index}
                    variants={itemVariants}
                    whileHover={{ backgroundColor: 'rgba(30, 41, 59, 0.5)' }}
                    className={`grid grid-cols-12 gap-4 px-6 py-4 items-center transition-colors ${
                      rank === 1 ? 'bg-primary/5' : ''
                    }`}
                  >
                    <div className="col-span-2 sm:col-span-1 font-bold flex items-center">
                      {rank === 1 && <Medal className="h-5 w-5 mr-1 text-yellow-500" />}
                      {rank === 2 && <Medal className="h-5 w-5 mr-1 text-slate-300" />}
                      {rank === 3 && <Medal className="h-5 w-5 mr-1 text-amber-600" />}
                      {rank > 3 && <span className="text-muted-foreground w-6 text-center">{rank}</span>}
                    </div>
                    <div className="col-span-5 sm:col-span-6 font-medium">
                      {row.username}
                      {rank === 1 && <span className="ml-2 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">Top Scorer</span>}
                    </div>
                    <div className="col-span-2 text-right font-bold text-green-400">
                      {formatReward(row.reward)}
                    </div>
                    <div className="col-span-3 text-right font-bold text-primary">
                      {activeTab === 'weekly' ? row.weekly_points ?? row.points : row.points}
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
