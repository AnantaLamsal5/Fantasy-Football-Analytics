"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Bell, CheckCheck, Menu, User } from "lucide-react";
import { API_BASE_URL, APP_ROUTES } from "@/utils/constants";
import { useAuth } from "@/context/AuthContext";
import { useRef, useEffect, useState } from "react";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "@/services/leaderboardService";

const links = [ 
  { href: APP_ROUTES.dashboard, label: "Dashboard" },
  { href: APP_ROUTES.team, label: "Team" },
  { href: APP_ROUTES.transfers, label: "Transfers" },
  { href: APP_ROUTES.leaderboard, label: "Leaderboard" },
  { href: APP_ROUTES.predictions, label: "AI Predictions" },
];

const adminLinks = [
  { href: "/admin/dashboard", label: "Admin" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { isAuthenticated, user, logout } = useAuth();
  const isAdminRoute = pathname?.startsWith("/admin");
  const profilePicture = user?.profile_picture
    ? user.profile_picture.startsWith("http")
      ? user.profile_picture
      : `${API_BASE_URL}${user.profile_picture}`
    : "";

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const profileDropdownRef = useRef(null);
  const notificationDropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
      if (notificationDropdownRef.current && !notificationDropdownRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    }

    if (showProfileMenu || showNotifications) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
    return undefined;
  }, [showProfileMenu, showNotifications]);

  useEffect(() => {
    if (!isAuthenticated) {
      return undefined;
    }

    let mounted = true;
    const loadNotifications = () => {
      getNotifications()
        .then((items) => {
          if (mounted) setNotifications(items || []);
        })
        .catch(() => {
          if (mounted) setNotifications([]);
        });
    };

    loadNotifications();
    const interval = setInterval(loadNotifications, 60000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  function handleLogout() {
    setShowProfileMenu(false);
    setShowNotifications(false);
    setNotifications([]);
    logout();
  }

  async function handleMarkAllRead() {
    const updated = await markAllNotificationsRead();
    setNotifications(updated || []);
  }

  async function handleNotificationClick(notification) {
    if (!notification?.read) {
      const updated = await markNotificationRead(notification.id);
      setNotifications(updated || []);
    }
  }

  const unreadCount = notifications.filter((item) => !item.read).length;

  if (isAdminRoute) {
    return null;
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
                  APP_ROUTES.leaderboard,
                  APP_ROUTES.predictions
                ];
                return !protectedRoutes.includes(item.href);
              })
              .map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative smooth-transition ${
                      isActive ? "text-foreground" : "text-foreground/70 hover:text-foreground"
                    }`}
                  >
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
              <>
                <div className="relative" ref={notificationDropdownRef}>
                  <button
                    onClick={() => setShowNotifications((prev) => !prev)}
                    className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background/70 hover:bg-muted/60 smooth-transition"
                    aria-label="Open notifications"
                    type="button"
                  >
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 ? (
                      <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-black leading-none text-primary-foreground">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    ) : null}
                  </button>

                  {showNotifications ? (
                    <div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] bg-background border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
                        <div>
                          <p className="text-sm font-black">Notifications</p>
                          <p className="text-[11px] text-muted-foreground">{unreadCount} unread</p>
                        </div>
                        <button
                          onClick={handleMarkAllRead}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-bold hover:bg-muted/50"
                          type="button"
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                          Read
                        </button>
                      </div>
                      <div className="max-h-96 overflow-y-auto p-2">
                        {notifications.length > 0 ? (
                          notifications.slice(0, 10).map((item) => (
                            <button
                              key={item.id}
                              onClick={() => handleNotificationClick(item)}
                              className={`w-full rounded-md border px-3 py-3 text-left transition-colors ${
                                item.read
                                  ? "border-transparent hover:bg-muted/30"
                                  : "border-primary/20 bg-primary/5 hover:bg-primary/10"
                              }`}
                              type="button"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-sm font-bold leading-snug">{item.message}</p>
                                {!item.read ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
                              </div>
                              <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                                {(item.type || "update").replace("_", " ")}
                              </p>
                            </button>
                          ))
                        ) : (
                          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                            No notifications yet.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>

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
                        className="block px-4 py-2 text-sm hover:bg-muted/50"
                      >
                        Profile Settings
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="w-full px-4 py-2 text-sm hover:bg-muted/50 text-left"
                        type="button"
                      >
                        Logout
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            ) : isAdminRoute ? null : (
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
                  className="md:hidden rounded-md border border-input bg-background/70 px-3 py-2 text-sm font-medium hover:bg-background/75 smooth-transition"
                  aria-label="Open menu"
                >
                  Log in
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
