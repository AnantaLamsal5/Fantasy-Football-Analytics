'use client';

import { useState, useEffect } from 'react';
import ProtectedAdminRoute from '@/components/ProtectedAdminRoute';
import AdminSidebar from '@/components/AdminSidebar';
import { API_BASE_URL } from '@/utils/constants';

export default function AdminLeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const adminToken = typeof window !== 'undefined' ? localStorage.getItem('ff_admin_token') : '';

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  async function fetchLeaderboard() {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/user/leaderboard/`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      if (!response.ok) throw new Error('Failed to fetch leaderboard');
      const data = await response.json();
      setLeaderboard(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load leaderboard');
      setLeaderboard([]);
    } finally {
      setLoading(false);
    }
  }

  const handleRecalculatePoints = async () => {
    setRefreshing(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/user/sync-points/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
      });

      if (!response.ok) throw new Error('Failed to recalculate points');

      // Refresh leaderboard after recalculation
      await fetchLeaderboard();
      alert('Fantasy points recalculated successfully!');
    } catch (err) {
      setError(err.message || 'Failed to recalculate points');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ProtectedAdminRoute>
      <div className="flex min-h-screen bg-gray-100">
        <AdminSidebar />

        <main className="flex-1 p-8">
          <div className="mb-8 flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Leaderboard</h1>
              <p className="text-gray-600">View user rankings and fantasy points</p>
            </div>
            <div className="space-x-4">
              <button
                onClick={fetchLeaderboard}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
              >
                Refresh
              </button>
              <button
                onClick={handleRecalculatePoints}
                disabled={refreshing}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
              >
                {refreshing ? 'Recalculating...' : 'Recalculate Points'}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 font-medium">{error}</p>
            </div>
          )}

          {/* Leaderboard Table */}
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="mt-4 text-gray-600">Loading leaderboard...</p>
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <p className="text-gray-600 text-lg">No leaderboard data found</p>
              <p className="text-gray-500 text-sm mt-2">Users will appear here once they have earned points</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Rank</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">User</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Fantasy Points</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Budget</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {leaderboard.map((entry, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${
                          idx === 0 ? 'bg-yellow-100 text-yellow-900' :
                          idx === 1 ? 'bg-gray-100 text-gray-900' :
                          idx === 2 ? 'bg-orange-100 text-orange-900' :
                          'bg-blue-100 text-blue-900'
                        }`}>
                          {idx + 1}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 font-semibold">{entry.username || 'Unknown'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{entry.email || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 font-bold">{entry.points || 0}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">€{(entry.budget / 1000000).toFixed(2)}M</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Control Info */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-blue-900 mb-2">Leaderboard Information</h3>
              <p className="text-blue-800 text-sm mb-4">
                View all users ranked by their fantasy points. Points are earned by selecting high-performing players in your squad.
              </p>
              <ul className="text-blue-700 text-sm space-y-1">
                <li>✓ Real-time ranking updates</li>
                <li>✓ Fantasy points tracking</li>
                <li>✓ User budget monitoring</li>
              </ul>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-green-900 mb-2">System Controls</h3>
              <p className="text-green-800 text-sm mb-4">
                Use the admin controls to sync and verify player points from match data.
              </p>
              <ul className="text-green-700 text-sm space-y-1">
                <li>✓ Recalculate fantasy points</li>
                <li>✓ Verify ranking integrity</li>
                <li>✓ Sync match results</li>
              </ul>
            </div>
          </div>
        </main>
      </div>
    </ProtectedAdminRoute>
  );
}
