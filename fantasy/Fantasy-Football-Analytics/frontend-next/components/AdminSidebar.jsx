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
    { path: '/admin/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/admin/players', label: 'Players', icon: '⚽' },
    { path: '/admin/matches', label: 'Matches', icon: '🏆' },
    { path: '/admin/users', label: 'Users', icon: '👥' },
    { path: '/admin/transfers', label: 'Transfers', icon: '💱' },
    { path: '/admin/leaderboard', label: 'Leaderboard', icon: '📈' },
  ];

  return (
    <aside className="w-64 bg-gradient-to-b from-blue-900 to-blue-800 text-white min-h-screen flex flex-col shadow-lg">
      {/* Header */}
      <div className="p-6 border-b border-blue-700">
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <p className="text-sm text-blue-200 mt-2">{adminAuth?.email}</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => (
          <Link
            key={item.path}
            href={item.path}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              isActive(item.path)
                ? 'bg-blue-600 text-white'
                : 'text-blue-100 hover:bg-blue-700'
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            <span className="font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-blue-700">
        <button
          onClick={handleLogout}
          className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
        >
          Logout
        </button>
      </div>
    </aside>
  );
}
