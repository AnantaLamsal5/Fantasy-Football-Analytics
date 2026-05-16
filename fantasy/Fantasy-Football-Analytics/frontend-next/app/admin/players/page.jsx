'use client';

import { useState, useEffect } from 'react';
import ProtectedAdminRoute from '@/components/ProtectedAdminRoute';
import AdminSidebar from '@/components/AdminSidebar';
import { API_BASE_URL } from '@/utils/constants';

export default function AdminPlayersPage() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    position: 'Midfielder',
    team_name: '',
    cost: '5000000',
    nationality: '',
  });

  const adminToken = typeof window !== 'undefined' ? localStorage.getItem('ff_admin_token') : '';

  async function fetchPlayers() {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/players/`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      if (!response.ok) throw new Error('Failed to fetch players');
      const data = await response.json();
      setPlayers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load players');
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    Promise.resolve().then(fetchPlayers);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const url = editingPlayer
        ? `${API_BASE_URL}/api/admin/players/${editingPlayer.id}/`
        : `${API_BASE_URL}/api/admin/players/`;

      const method = editingPlayer ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Failed to save player');

      const savedPlayer = await response.json();

      if (editingPlayer) {
        setPlayers((prev) =>
          prev.map((p) => (p.id === editingPlayer.id ? savedPlayer : p))
        );
      } else {
        setPlayers((prev) => [savedPlayer, ...prev]);
      }

      resetForm();
    } catch (err) {
      setError(err.message || 'Failed to save player');
    }
  };

  const handleDelete = async (playerId) => {
    if (!confirm('Are you sure you want to delete this player?')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/players/${playerId}/`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      if (!response.ok) throw new Error('Failed to delete player');

      setPlayers((prev) => prev.filter((p) => p.id !== playerId));
    } catch (err) {
      setError(err.message || 'Failed to delete player');
    }
  };

  const resetForm = () => {
    setFormData({ name: '', position: 'Midfielder', team_name: '', cost: '5000000', nationality: '' });
    setEditingPlayer(null);
    setShowForm(false);
  };

  const handleEdit = (player) => {
    setFormData({
      name: player.name,
      position: player.position,
      team_name: player.team,
      cost: player.value.toString(),
      nationality: player.nationality || '',
    });
    setEditingPlayer(player);
    setShowForm(true);
  };

  return (
    <ProtectedAdminRoute>
      <div className="flex min-h-screen bg-gray-100">
        <AdminSidebar />

        <main className="flex-1 p-8">
          <div className="mb-8 flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Players</h1>
              <p className="text-gray-600">Manage fantasy football players</p>
            </div>
            <button
              onClick={() => (showForm ? resetForm() : setShowForm(true))}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
            >
              {showForm ? 'Cancel' : 'Add Player'}
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
                {editingPlayer ? 'Edit Player' : 'Add New Player'}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Position</label>
                    <select
                      value={formData.position}
                      onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      required
                    >
                      <option value="Goalkeeper">Goalkeeper</option>
                      <option value="Defender">Defender</option>
                      <option value="Midfielder">Midfielder</option>
                      <option value="Attacker">Attacker</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Team</label>
                    <input
                      type="text"
                      value={formData.team_name}
                      onChange={(e) => setFormData({ ...formData, team_name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Cost</label>
                    <input
                      type="number"
                      value={formData.cost}
                      onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Nationality</label>
                    <input
                      type="text"
                      value={formData.nationality}
                      onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                >
                  {editingPlayer ? 'Update Player' : 'Create Player'}
                </button>
              </form>
            </div>
          )}

          {/* Players Table */}
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="mt-4 text-gray-600">Loading players...</p>
            </div>
          ) : players.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <p className="text-gray-600 text-lg">No players found</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Position</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Team</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Cost</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Nationality</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {players.map((player) => (
                    <tr key={player.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900 font-semibold">{player.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{player.position}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{player.team}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">€{(player.value / 1000000).toFixed(2)}M</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{player.nationality || '-'}</td>
                      <td className="px-6 py-4 text-sm space-x-2">
                        <button
                          onClick={() => handleEdit(player)}
                          className="text-blue-600 hover:text-blue-700 font-semibold"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(player.id)}
                          className="text-red-600 hover:text-red-700 font-semibold"
                        >
                          Delete
                        </button>
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
