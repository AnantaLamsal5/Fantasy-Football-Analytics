'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Activity, Brain, Trophy } from 'lucide-react';
import { APP_ROUTES } from '@/utils/constants';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 100,
    },
  },
};

export default function Home() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] items-center justify-center p-4 overflow-hidden relative">
      {/* Background Gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none" />

      <motion.div
        className="z-10 w-full max-w-5xl flex flex-col items-center text-center space-y-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants} className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
          <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></span>
          Next-Gen FPL Analytics
        </motion.div>

        <motion.h1 variants={itemVariants} className="text-5xl md:text-7xl font-extrabold tracking-tight bg-clip-text text-transparent bg-linear-to-r from-white via-slate-200 to-slate-400 drop-shadow-sm">
          Dominate Your League <br className="hidden sm:block" /> with AI Insights
        </motion.h1>

        <motion.p variants={itemVariants} className="max-w-2xl text-lg md:text-xl text-muted-foreground">
          Advanced statistical models and machine learning algorithms to optimize your Fantasy Premier League squad, predict player performance, and maximize your points.
        </motion.p>

        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center gap-4 pt-4">
          <Link href={APP_ROUTES.signup}>
            <button className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8 py-2">
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </button>
          </Link>
          <Link href={APP_ROUTES.login}>
            <button className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background border border-input hover:bg-accent hover:text-accent-foreground h-11 px-8 py-2">
              Sign In
            </button>
          </Link>
        </motion.div>

        {/* Feature Cards */}
        <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full pt-16">
          {[
            {
              title: "Predictive Analytics",
              description: "AI-driven point projections based on historical data, form, and fixture difficulty.",
              icon: Brain,
            },
            {
              title: "Squad Optimization",
              description: "Automated transfer suggestions to maximize expected value while managing your budget.",
              icon: Activity,
            },
            {
              title: "Live Leaderboards",
              description: "Track your rank in real-time against friends and global competitors with detailed insights.",
              icon: Trophy,
            }
          ].map((feature, i) => (
            <motion.div
              key={i}
              variants={itemVariants}
              whileHover={{ y: -5, transition: { duration: 0.2 } }}
              className="flex flex-col items-center text-center p-6 rounded-2xl border border-border bg-card/50 backdrop-blur-sm"
            >
              <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary mb-4">
                <feature.icon className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-card-foreground">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
      <footer className="z-10 w-full max-w-5xl mt-16 pt-8 border-t border-border/50">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-muted-foreground">
          <div>
            <div className="flex items-center gap-3 text-card-foreground font-bold mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                F
              </div>
              Fantasy Football
            </div>
            <p>
              AI-assisted fantasy football analytics for squads, fixtures, rankings, and smarter transfer decisions.
            </p>
          </div>
          <div>
            <h3 className="text-card-foreground font-semibold mb-2">Quick Links</h3>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <Link href={APP_ROUTES.home} className="hover:text-foreground">Home</Link>
              <Link href={APP_ROUTES.matches} className="hover:text-foreground">Matches</Link>
              <Link href={APP_ROUTES.leaderboard} className="hover:text-foreground">Leaderboard</Link>
              <Link href={APP_ROUTES.login} className="hover:text-foreground">Login</Link>
              <Link href={APP_ROUTES.signup} className="hover:text-foreground">Signup</Link>
            </div>
          </div>
          <div>
            <h3 className="text-card-foreground font-semibold mb-2">Support</h3>
            <p>Contact support at support@fantasyfootballanalytics.local</p>
            <p className="mt-3">Copyright {new Date().getFullYear()} Fantasy Football Analytics Platform.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
