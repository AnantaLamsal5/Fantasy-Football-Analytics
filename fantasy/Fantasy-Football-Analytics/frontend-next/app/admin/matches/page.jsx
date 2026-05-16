'use client';

import { useState, useEffect } from 'react';
import ProtectedAdminRoute from '@/components/ProtectedAdminRoute';
import AdminSidebar from '@/components/AdminSidebar';
import { API_BASE_URL } from '@/utils/constants';

export default function AdminMatchesPage() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingMatch, setEditingMatch] = useState(null);
  const [formData, setFormData] = useState({
    home_team: '',
    away_team: '',
    matchday: '1',
    status: 'Scheduled',
    home_score: '',
    away_score: '',
  });

  const adminToken = typeof window !== 'undefined' ? localStorage.getItem('ff_admin_token') : '';

  async function fetchMatches() {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/matches/`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      if (!response.ok) throw new Error('Failed to fetch matches');
      const data = await response.json();
      setMatches(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load matches');
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    Promise.resolve().then(fetchMatches);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const url = editingMatch
        ? `${API_BASE_URL}/api/admin/matches/${editingMatch.id}/`
        : `${API_BASE_URL}/api/admin/matches/`;

      const method = editingMatch ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Failed to save match');

      const savedMatch = await response.json();

      if (editingMatch) {
        setMatches((prev) =>
          prev.map((m) => (m.id === editingMatch.id ? savedMatch : m))
        );
      } else {
        setMatches((prev) => [savedMatch, ...prev]);
      }

      resetForm();
    } catch (err) {
      setError(err.message || 'Failed to save match');
    }
  };

  const handleDelete = async (matchId) => {
    if (!confirm('Are you sure you want to delete this match?')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/matches/${matchId}/`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      if (!response.ok) throw new Error('Failed to delete match');

      setMatches((prev) => prev.filter((m) => m.id !== matchId));
    } catch (err) {
      setError(err.message || 'Failed to delete match');
    }
  };

  const resetForm = () => {
    setFormData({
      home_team: '',
      away_team: '',
      matchday: '1',
      status: 'Scheduled',
      home_score: '',
      away_score: '',
    });
    setEditingMatch(null);
    setShowForm(false);
  };

  const handleEdit = (match) => {
    if (match.source !== 'admin') {
      setError('Only admin-managed matches can be edited here.');
      return;
    }
    setFormData({
      home_team: match.home_team,
      away_team: match.away_team,
      matchday: match.matchday?.toString() || '1',
      status: match.status || 'Scheduled',
      home_score: match.score?.split('-')[0]?.trim() || '',
      away_score: match.score?.split('-')[1]?.trim() || '',
    });
    setEditingMatch(match);
    setShowForm(true);
  };

  return (
    <ProtectedAdminRoute>
      <div className="flex min-h-screen bg-gray-100">
        <AdminSidebar />

        <main className="flex-1 p-8">
          <div className="mb-8 flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Matches</h1>
              <p className="text-gray-600">Manage football matches and results</p>
            </div>
            <button
              onClick={() => (showForm ? resetForm() : setShowForm(true))}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
            >
              {showForm ? 'Cancel' : 'Add Match'}
            </button>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 font-medium">{error}</p>
            </div>
          )}

          {/* Add/Edit Form */}
          {showForm && (
            <div className="bg-white rounded-lg shadow p-6 mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                {editingMatch ? 'Edit Match' : 'Add New Match'}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Home Team</label>
                    <input
                      type="text"
                      value={formData.home_team}
                      onChange={(e) => setFormData({ ...formData, home_team: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Away Team</label>
                    <input
                      type="text"
                      value={formData.away_team}
                      onChange={(e) => setFormData({ ...formData, away_team: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Matchweek</label>
                    <input
                      type="number"
                      value={formData.matchday}
                      onChange={(e) => setFormData({ ...formData, matchday: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      required
                    >
                      <option value="Scheduled">Scheduled</option>
                      <option value="Live">Live</option>
                      <option value="Finished">Finished</option>
                    </select>
                  </div>

                  {formData.status === 'Finished' && (
                    <>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Home Score</label>
                        <input
                          type="number"
                          value={formData.home_score}
                          onChange={(e) => setFormData({ ...formData, home_score: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Away Score</label>
                        <input
                          type="number"
                          value={formData.away_score}
                          onChange={(e) => setFormData({ ...formData, away_score: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </>
                  )}
                </div>

                <button
                  type="submit"
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                >
                  {editingMatch ? 'Update Match' : 'Create Match'}
                </button>
              </form>
            </div>
          )}

          {/* Matches Table */}
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="mt-4 text-gray-600">Loading matches...</p>
            </div>
          ) : matches.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <p className="text-gray-600 text-lg">No matches found</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Home Team</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Away Team</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Matchweek</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Score</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {matches.map((match) => (
                    <tr key={match.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900 font-semibold">{match.home_team}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 font-semibold">{match.away_team}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{match.matchday || '-'}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          match.status === 'Finished' ? 'bg-gray-100 text-gray-800' :
                          match.status === 'Live' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {match.status || 'Scheduled'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{match.score || '-'}</td>
                      <td className="px-6 py-4 text-sm space-x-2">
                        {match.source === 'admin' ? (
                          <>
                            <button
                              onClick={() => handleEdit(match)}
                              className="text-blue-600 hover:text-blue-700 font-semibold"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(match.id)}
                              className="text-red-600 hover:text-red-700 font-semibold"
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <span className="text-gray-500">API fixture</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </ProtectedAdminRoute>
  );
}
