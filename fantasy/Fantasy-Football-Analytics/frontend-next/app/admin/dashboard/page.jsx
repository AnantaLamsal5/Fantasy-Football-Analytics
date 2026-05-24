'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminSidebar from '@/components/AdminSidebar';
import ProtectedAdminRoute from '@/components/ProtectedAdminRoute';
import { API_BASE_URL } from '@/utils/constants';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalPlayers: 0,
    totalTransfers: 0,
    recentUsers: [],
    apiStatus: 'checking',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function fetchDashboardData() {
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('ff_admin_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [usersRes, playersRes, transfersRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/users/`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/players/`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/transfers/`, { headers }),
      ]);

      const usersData = usersRes.ok ? await usersRes.json() : [];
      const playersData = playersRes.ok ? await playersRes.json() : [];
      const transfersData = transfersRes.ok ? await transfersRes.json() : [];

      setStats({
        totalUsers: Array.isArray(usersData) ? usersData.length : 0,
        totalPlayers: Array.isArray(playersData) ? playersData.length : 0,
        totalTransfers: Array.isArray(transfersData) ? transfersData.length : 0,
        recentUsers: Array.isArray(usersData) ? usersData.slice(0, 5) : [],
        apiStatus: 'online',
      });
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load dashboard data');
      setStats((prev) => ({ ...prev, apiStatus: 'offline' }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    Promise.resolve().then(fetchDashboardData);
  }, []);

  const statCards = [
    { label: 'Total Users', value: stats.totalUsers, href: '/admin/users' },
    { label: 'Total Players', value: stats.totalPlayers, href: '/admin/players' },
    { label: 'Transfers', value: stats.totalTransfers, href: '/admin/transfers' },
    { label: 'System Status', value: stats.apiStatus, href: null },
  ];

  return (
    <ProtectedAdminRoute>
      <div className="flex min-h-screen bg-background">
        <AdminSidebar />

        <main className="flex-1 p-8">
          <div className="mb-8">
            <h1 className="mb-2 text-4xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground">Fantasy Football admin workspace</p>
          </div>

          {error && (
            <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/10 p-4">
              <p className="font-medium text-destructive">{error}</p>
              <button
                onClick={fetchDashboardData}
                className="mt-2 text-sm font-semibold text-destructive hover:underline"
                type="button"
              >
                Try again
              </button>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center">
              <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="mt-4 text-muted-foreground">Loading dashboard...</p>
            </div>
          ) : (
            <>
              <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
                {statCards.map((card) => {
                  const body = (
                    <div className="card p-6 transition-colors hover:bg-muted/40">
                      <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
                      <p className="mt-2 text-3xl font-bold text-foreground capitalize">{card.value}</p>
                    </div>
                  );

                  return card.href ? (
                    <Link key={card.label} href={card.href}>
                      {body}
                    </Link>
                  ) : (
                    <div key={card.label}>{body}</div>
                  );
                })}
              </div>

              <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
                <Link href="/admin/players" className="card p-6 transition-colors hover:bg-muted/40">
                  <h3 className="mb-1 text-xl font-bold">Manage Players</h3>
                  <p className="text-sm text-muted-foreground">Add, edit, ban, or delete players.</p>
                </Link>

                <Link href="/admin/users" className="card p-6 transition-colors hover:bg-muted/40">
                  <h3 className="mb-1 text-xl font-bold">Manage Users</h3>
                  <p className="text-sm text-muted-foreground">Promote admins and remove registered users.</p>
                </Link>

                <Link href="/admin/leaderboard" className="card p-6 transition-colors hover:bg-muted/40">
                  <h3 className="mb-1 text-xl font-bold">Leaderboard</h3>
                  <p className="text-sm text-muted-foreground">Review regular-user rankings.</p>
                </Link>
              </div>

              <div className="card">
                <div className="border-b border-border/60 px-6 py-4">
                  <h3 className="text-lg font-bold">Recent Users</h3>
                </div>
                <div className="divide-y divide-border/40">
                  {stats.recentUsers.length > 0 ? (
                    stats.recentUsers.map((user) => (
                      <div key={user.id || user.email} className="px-6 py-4 hover:bg-muted/30">
                        <p className="font-semibold text-foreground">{user.username || user.email || 'Unknown'}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    ))
                  ) : (
                    <div className="px-6 py-4 text-center text-muted-foreground">No users found</div>
                  )}
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </ProtectedAdminRoute>
  );
}
