"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LayoutDashboard, Users, Trophy, BrainCircuit, LogOut, Menu, User, Calendar, ArrowRightLeft, ShieldCheck } from "lucide-react";
import { Settings } from "lucide-react";
import { API_BASE_URL, APP_ROUTES } from "@/utils/constants";
import { useAuth } from "@/context/AuthContext";
import { useRef, useEffect, useState } from "react";

const links = [ 
  { href: APP_ROUTES.dashboard, label: "Dashboard", icon: LayoutDashboard },
  { href: APP_ROUTES.team, label: "Team", icon: Users },
  { href: APP_ROUTES.transfers, label: "Transfers", icon: ArrowRightLeft },
  { href: APP_ROUTES.matches, label: "Matches", icon: Calendar },
  { href: APP_ROUTES.leaderboard, label: "Leaderboard", icon: Trophy },
  { href: APP_ROUTES.predictions, label: "AI Predictions", icon: BrainCircuit },
];

const adminLinks = [
  { href: "/admin/dashboard", label: "Admin", icon: ShieldCheck },
];

export default function Navbar() {
  const pathname = usePathname();
  const { isAuthenticated, user, logout } = useAuth();
  const profilePicture = user?.profile_picture
    ? user.profile_picture.startsWith("http")
      ? user.profile_picture
      : `${API_BASE_URL}${user.profile_picture}`
    : "";

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileDropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    }

    if (showProfileMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
    return undefined;
  }, [showProfileMenu]);

  function handleLogout() {
    setShowProfileMenu(false);
    logout();
  }

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/30 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 shadow-sm">
      <div className="container mx-auto flex h-16 items-center px-4 md:px-8">
        <Link
          href={isAuthenticated ? APP_ROUTES.dashboard : APP_ROUTES.home}
          className="mr-8 flex items-center space-x-3"
          aria-label="Go to home"
        >
          <div
            role="img"
            aria-label="Fantasy Football logo"
            className="h-9 w-9 rounded-lg overflow-hidden bg-black/20 shadow"
          >
            <img src="/FF_App_logo.png" alt="Fantasy Football" className="h-full w-full object-cover" />
          </div>
          <span className="hidden font-bold sm:inline-block text-lg tracking-tight">
            Fantasy Football
          </span>
        </Link>

        <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
          <nav className="hidden md:flex items-center md:space-x-4 lg:space-x-6 text-sm font-medium">
            {[...links, ...(user?.role === "admin" ? adminLinks : [])]
              .filter((item) => {
                if (isAuthenticated) return true;
                // Hide protected routes if not authenticated
                const protectedRoutes = [
                  APP_ROUTES.dashboard,
                  APP_ROUTES.team,
                  APP_ROUTES.transfers,
                  APP_ROUTES.matches,
                  APP_ROUTES.leaderboard, // Leaderboard is usually protected too
                  APP_ROUTES.predictions
                ];
                return !protectedRoutes.includes(item.href);
              })
              .map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative flex items-center space-x-2 smooth-transition ${
                      isActive ? "text-foreground" : "text-foreground/70 hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                    {isActive && (
                      <motion.div
                        layoutId="navbar-active"
                        className="absolute -bottom-5.25 left-0 right-0 h-0.5 bg-primary"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                  </Link>
                );
              })}
          </nav>
          <div className="flex items-center space-x-4 md:ml-6 md:pl-4 md:border-l md:border-border/30">
            {/* Profile / Auth actions */}
            {isAuthenticated ? (
              <div className="hidden md:relative md:inline-block" ref={profileDropdownRef}>
                <button
                  onClick={() => setShowProfileMenu((prev) => !prev)}
                  className="inline-flex items-center gap-2 max-w-45"
                  aria-label="Open profile menu"
                  type="button"
                >
                  <span className="text-sm font-medium truncate">{user?.username || "User"}</span>
                  <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold overflow-hidden">
                    {profilePicture ? (
                      <img src={profilePicture} alt="Profile" className="h-full w-full object-cover" />
                    ) : (
                      user?.username?.[0]?.toUpperCase() || <User className="h-4 w-4" />
                    )}
                  </div>
                </button>

                {showProfileMenu ? (
                  <div className="absolute right-0 mt-2 w-48 bg-background border border-border rounded-lg shadow-lg z-50 overflow-hidden">
                    <Link
                      href={APP_ROUTES.profile}
                      onClick={() => setShowProfileMenu(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/50"
                    >
                      <Settings className="h-4 w-4" />
                      Profile Settings
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/50 text-left"
                      type="button"
                    >
                      <LogOut className="h-4 w-4" />
                      Logout
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <Link
                  href={APP_ROUTES.login}
                  className="hidden md:inline-flex items-center text-sm font-medium text-foreground/80 hover:text-foreground"
                >
                  Log in
                </Link>
                <Link href={APP_ROUTES.signup} className="btn-primary hidden md:inline-flex h-9">
                  Sign up
                </Link>
                <Link
                  href={APP_ROUTES.login}
                  className="md:hidden flex items-center justify-center rounded-md w-9 h-9 border border-input bg-background/70 hover:bg-background/75 smooth-transition"
                  aria-label="Open menu"
                >
                  <User className="h-4 w-4" />
                </Link>
              </>
            )}
            <button
              className="md:hidden flex items-center justify-center rounded-md w-9 h-9 border border-input bg-background/70 hover:bg-background/75 smooth-transition"
              aria-label="Open menu"
              type="button"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
