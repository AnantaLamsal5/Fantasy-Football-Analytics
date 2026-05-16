'use client';

import { useState, useEffect } from 'react';
import ProtectedAdminRoute from '@/components/ProtectedAdminRoute';
import AdminSidebar from '@/components/AdminSidebar';
import { API_BASE_URL } from '@/utils/constants';
import Link from 'next/link';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalPlayers: 0,
    totalMatches: 0,
    totalTransfers: 0,
    recentUsers: [],
    recentMatches: [],
    apiStatus: 'checking',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    setLoading(true);
    setError('');

    try {
      // Fetch users
      const usersRes = await fetch(`${API_BASE_URL}/api/admin/users/`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('ff_admin_token')}` }
      });
      const usersData = usersRes.ok ? (await usersRes.json()) : [];

      // Fetch players
      const playersRes = await fetch(`${API_BASE_URL}/api/admin/players/`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('ff_admin_token')}` }
      });
      const playersData = playersRes.ok ? (await playersRes.json()) : [];

      // Fetch matches
      const matchesRes = await fetch(`${API_BASE_URL}/api/admin/matches/`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('ff_admin_token')}` }
      });
      const matchesData = matchesRes.ok ? (await matchesRes.json()) : [];

      setStats({
        totalUsers: Array.isArray(usersData) ? usersData.length : 0,
        totalPlayers: Array.isArray(playersData) ? playersData.length : 0,
        totalMatches: Array.isArray(matchesData) ? matchesData.length : 0,
        totalTransfers: 0, // Placeholder
        recentUsers: Array.isArray(usersData) ? usersData.slice(0, 5) : [],
        recentMatches: Array.isArray(matchesData) ? matchesData.slice(0, 5) : [],
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

  return (
    <ProtectedAdminRoute>
      <div className="flex min-h-screen bg-gray-100">
        {/* Sidebar */}
        <AdminSidebar />

        {/* Main Content */}
        <main className="flex-1 p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Dashboard</h1>
            <p className="text-gray-600">Welcome to the Fantasy Football Admin Panel</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 font-medium">{error}</p>
              <button
                onClick={fetchDashboardData}
                className="mt-2 text-red-600 hover:text-red-700 font-semibold text-sm"
              >
                Try again
              </button>
            </div>
          )}

          {/* Stats Grid */}
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="mt-4 text-gray-600">Loading dashboard...</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Total Users */}
                <Link href="/admin/users">
                  <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg hover:scale-105 transition-transform cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-gray-600 text-sm font-medium">Total Users</p>
                        <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalUsers}</p>
                      </div>
                      <div className="text-4xl">👥</div>
                    </div>
                  </div>
                </Link>

                {/* Total Players */}
                <Link href="/admin/players">
                  <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg hover:scale-105 transition-transform cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-gray-600 text-sm font-medium">Total Players</p>
                        <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalPlayers}</p>
                      </div>
                      <div className="text-4xl">⚽</div>
                    </div>
                  </div>
                </Link>

                {/* Total Matches */}
                <Link href="/admin/matches">
                  <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg hover:scale-105 transition-transform cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-gray-600 text-sm font-medium">Total Matches</p>
                        <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalMatches}</p>
                      </div>
                      <div className="text-4xl">🏆</div>
                    </div>
                  </div>
                </Link>

                {/* API Status */}
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-600 text-sm font-medium">System Status</p>
                      <div className="mt-2 flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${stats.apiStatus === 'online' ? 'bg-green-500' : 'bg-red-500'}`} />
                        <p className="text-lg font-bold text-gray-900 capitalize">{stats.apiStatus}</p>
                      </div>
                    </div>
                    <div className="text-4xl">{stats.apiStatus === 'online' ? '✅' : '❌'}</div>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <Link
                  href="/admin/players"
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow p-6 transition-colors"
                >
                  <p className="text-2xl mb-2">⚽</p>
                  <h3 className="text-xl font-bold mb-1">Manage Players</h3>
                  <p className="text-blue-100 text-sm">Add, edit, or delete players</p>
                </Link>

                <Link
                  href="/admin/matches"
                  className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow p-6 transition-colors"
                >
                  <p className="text-2xl mb-2">🏆</p>
                  <h3 className="text-xl font-bold mb-1">Manage Matches</h3>
                  <p className="text-purple-100 text-sm">Manage match schedules and results</p>
                </Link>

                <Link
                  href="/admin/users"
                  className="bg-green-600 hover:bg-green-700 text-white rounded-lg shadow p-6 transition-colors"
                >
                  <p className="text-2xl mb-2">👥</p>
                  <h3 className="text-xl font-bold mb-1">Manage Users</h3>
                  <p className="text-green-100 text-sm">View and manage user accounts</p>
                </Link>
              </div>

              {/* Recent Data */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Recent Users */}
                <div className="bg-white rounded-lg shadow">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-bold text-gray-900">Recent Users</h3>
                  </div>
                  <div className="divide-y">
                    {stats.recentUsers.length > 0 ? (
                      stats.recentUsers.map((user, idx) => (
                        <div key={idx} className="px-6 py-4 hover:bg-gray-50">
                          <p className="font-semibold text-gray-900">{user.username || user.email || 'Unknown'}</p>
                          <p className="text-sm text-gray-600">{user.email}</p>
                        </div>
                      ))
                    ) : (
                      <div className="px-6 py-4 text-center text-gray-600">No users found</div>
                    )}
                  </div>
                </div>

                {/* Recent Matches */}
                <div className="bg-white rounded-lg shadow">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-bold text-gray-900">Recent Matches</h3>
                  </div>
                  <div className="divide-y">
                    {stats.recentMatches.length > 0 ? (
                      stats.recentMatches.map((match, idx) => (
                        <div key={idx} className="px-6 py-4 hover:bg-gray-50">
                          <p className="font-semibold text-gray-900">
                            {match.home_team} vs {match.away_team}
                          </p>
                          <p className="text-sm text-gray-600">Matchweek {match.matchday}</p>
                        </div>
                      ))
                    ) : (
                      <div className="px-6 py-4 text-center text-gray-600">No matches found</div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </ProtectedAdminRoute>
  );
}
