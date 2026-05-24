'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useContext } from 'react';
import { AdminAuthContext } from '@/context/AdminAuthContext';

export default function AdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { adminAuth, logoutAdmin } = useContext(AdminAuthContext);

  const handleLogout = () => {
    logoutAdmin();
    router.push('/admin/login');
  };

  const isActive = (path) => pathname === path;

  const navItems = [
    { path: '/admin/dashboard', label: 'Dashboard' },
    { path: '/admin/players', label: 'Players' },
    { path: '/admin/users', label: 'Users' },
    { path: '/admin/transfers', label: 'Transfers' },
    { path: '/admin/leaderboard', label: 'Leaderboard' },
  ];

  return (
    <aside className="w-64 bg-card text-card-foreground min-h-screen flex flex-col border-r border-border/60 shadow-lg">
      {/* Header */}
      <div className="p-6 border-b border-border/60">
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <p className="text-sm text-muted-foreground mt-2">{adminAuth?.email}</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => (
          <Link
            key={item.path}
            href={item.path}
            className={`block px-4 py-3 rounded-lg transition-colors ${
              isActive(item.path)
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            }`}
          >
            <span className="font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-border/60">
        <button
          onClick={handleLogout}
          className="w-full rounded-lg border border-destructive/30 bg-destructive/10 text-destructive font-semibold py-2 px-4 transition-colors hover:bg-destructive hover:text-destructive-foreground"
        >
          Logout
        </button>
      </div>
    </aside>
  );
}
