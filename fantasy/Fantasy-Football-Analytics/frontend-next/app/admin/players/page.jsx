'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminSidebar from '@/components/AdminSidebar';
import ProtectedAdminRoute from '@/components/ProtectedAdminRoute';
import { API_BASE_URL } from '@/utils/constants';

const initialForm = {
  ban_mode: 'none',
  ban_duration_weeks: '1',
  ban_starts_at: '',
  ban_expires_at: '',
  ban_reason: '',
};

function getAdminToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('ff_admin_token') || '' : '';
}

function toDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toApiDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function readError(response, fallback) {
  try {
    const payload = await response.json();
    return payload?.detail || fallback;
  } catch {
    return fallback;
  }
}

export default function AdminPlayersPage() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [formData, setFormData] = useState(initialForm);

  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/players/`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });

      if (!response.ok) throw new Error(await readError(response, 'Failed to fetch players'));
      const data = await response.json();
      setPlayers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load players');
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(fetchPlayers);
  }, [fetchPlayers]);

  const bannedCount = useMemo(() => players.filter((player) => player.is_banned).length, [players]);

  function playerPayload() {
    const payload = {};

    if (formData.ban_mode === 'none') {
      payload.clear_ban = true;
    } else if (formData.ban_mode === 'weeks') {
      payload.ban_duration_weeks = formData.ban_duration_weeks;
      payload.ban_reason = formData.ban_reason;
    } else {
      payload.ban_starts_at = toApiDateTime(formData.ban_starts_at);
      payload.ban_expires_at = toApiDateTime(formData.ban_expires_at);
      payload.ban_reason = formData.ban_reason;
    }

    return payload;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!editingPlayer) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/players/${editingPlayer.id}/`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify(playerPayload()),
      });

      if (!response.ok) throw new Error(await readError(response, 'Failed to save player'));
      const savedPlayer = await response.json();

      setPlayers((prev) => prev.map((player) => (player.id === editingPlayer.id ? savedPlayer : player)));
      setSuccess(`${savedPlayer.name} ban settings were updated.`);
      resetForm();
    } catch (err) {
      setError(err.message || 'Failed to save player');
    }
  }

  async function updateBan(player, payload) {
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/players/${player.id}/`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(await readError(response, 'Failed to update ban'));
      const updatedPlayer = await response.json();
      setPlayers((prev) => prev.map((item) => (item.id === player.id ? updatedPlayer : item)));
      setSuccess(payload.clear_ban ? `${player.name} is available again.` : `${player.name} was banned.`);
    } catch (err) {
      setError(err.message || 'Failed to update ban');
    }
  }

  function resetForm() {
    setFormData(initialForm);
    setEditingPlayer(null);
    setShowForm(false);
  }

  function handleManageBan(player) {
    setFormData({
      ban_mode: player.ban_expires_at ? 'custom' : 'none',
      ban_duration_weeks: '1',
      ban_starts_at: toDateTimeLocal(player.ban_starts_at),
      ban_expires_at: toDateTimeLocal(player.ban_expires_at),
      ban_reason: player.ban_reason || '',
    });
    setEditingPlayer(player);
    setShowForm(true);
  }

  function formatBan(player) {
    if (!player.ban_expires_at) return 'Available';
    const expires = new Date(player.ban_expires_at);
    const label = Number.isNaN(expires.getTime()) ? 'Banned' : `Until ${expires.toLocaleString()}`;
    return player.is_banned ? label : `Expired ${expires.toLocaleDateString()}`;
  }

  return (
    <ProtectedAdminRoute>
      <div className="flex min-h-screen bg-background">
        <AdminSidebar />

        <main className="flex-1 p-8">
          <div className="mb-8 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold text-foreground">Players</h1>
              <p className="text-muted-foreground">Manage players and temporary ban availability.</p>
            </div>
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <div className="card p-5">
              <p className="text-sm font-semibold text-muted-foreground">Total Players</p>
              <p className="mt-2 text-3xl font-bold">{players.length}</p>
            </div>
            <div className="card p-5">
              <p className="text-sm font-semibold text-muted-foreground">Banned</p>
              <p className="mt-2 text-3xl font-bold text-destructive">{bannedCount}</p>
            </div>
            <div className="card p-5">
              <p className="text-sm font-semibold text-muted-foreground">Available</p>
              <p className="mt-2 text-3xl font-bold text-green-500">{players.length - bannedCount}</p>
            </div>
          </div>

          {error && (
            <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/10 p-4">
              <p className="font-medium text-destructive">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 rounded-lg border border-green-500/20 bg-green-500/10 p-4">
              <p className="font-medium text-green-400">{success}</p>
            </div>
          )}

          {showForm && (
            <div className="card mb-8 p-6">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">Manage Player Ban</h2>
                  {editingPlayer ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {editingPlayer.name} · {editingPlayer.position} · {editingPlayer.team}
                    </p>
                  ) : null}
                </div>
                <button onClick={resetForm} className="font-semibold text-muted-foreground hover:text-foreground" type="button">
                  Cancel
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="rounded-lg border border-border/60 p-4">
                  <h3 className="mb-4 font-bold">Temporary Ban</h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label className="block text-sm font-semibold">
                      Ban Type
                      <select
                        value={formData.ban_mode}
                        onChange={(event) => setFormData({ ...formData, ban_mode: event.target.value })}
                        className="mt-2 w-full rounded-md border border-border bg-input px-4 py-2 text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <option value="none">No ban</option>
                        <option value="weeks">Weekly duration</option>
                        <option value="custom">Custom date range</option>
                      </select>
                    </label>

                    {formData.ban_mode === 'weeks' && (
                      <label className="block text-sm font-semibold">
                        Duration (weeks)
                        <input
                          type="number"
                          min="1"
                          value={formData.ban_duration_weeks}
                          onChange={(event) => setFormData({ ...formData, ban_duration_weeks: event.target.value })}
                          className="mt-2 w-full rounded-md border border-border bg-input px-4 py-2 text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </label>
                    )}

                    {formData.ban_mode === 'custom' && (
                      <>
                        <label className="block text-sm font-semibold">
                          Starts At
                          <input
                            type="datetime-local"
                            value={formData.ban_starts_at}
                            onChange={(event) => setFormData({ ...formData, ban_starts_at: event.target.value })}
                            className="mt-2 w-full rounded-md border border-border bg-input px-4 py-2 text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </label>

                        <label className="block text-sm font-semibold">
                          Expires At
                          <input
                            type="datetime-local"
                            value={formData.ban_expires_at}
                            onChange={(event) => setFormData({ ...formData, ban_expires_at: event.target.value })}
                            className="mt-2 w-full rounded-md border border-border bg-input px-4 py-2 text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </label>
                      </>
                    )}

                    {formData.ban_mode !== 'none' && (
                      <label className="block text-sm font-semibold md:col-span-2">
                        Reason
                        <input
                          type="text"
                          value={formData.ban_reason}
                          onChange={(event) => setFormData({ ...formData, ban_reason: event.target.value })}
                          className="mt-2 w-full rounded-md border border-border bg-input px-4 py-2 text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                          placeholder="Optional reason"
                        />
                      </label>
                    )}
                  </div>
                </div>

                <button type="submit" className="btn-primary px-6">
                  Update Ban
                </button>
              </form>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center">
              <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="mt-4 text-muted-foreground">Loading players...</p>
            </div>
          ) : players.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-lg text-muted-foreground">No players found</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/40 bg-card shadow">
              <table className="w-full">
                <thead className="border-b border-border/60 bg-muted/30">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-muted-foreground">Name</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-muted-foreground">Position</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-muted-foreground">Team</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-muted-foreground">Cost</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-muted-foreground">Ban Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {players.map((player) => (
                    <tr key={player.id} className="hover:bg-muted/30">
                      <td className="px-6 py-4 text-sm font-semibold text-foreground">{player.name}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{player.position}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{player.team}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">EUR {(player.value / 1000000).toFixed(2)}M</td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            player.is_banned ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-400'
                          }`}
                        >
                          {formatBan(player)}
                        </span>
                        {player.ban_reason ? (
                          <p className="mt-1 max-w-56 truncate text-xs text-muted-foreground">{player.ban_reason}</p>
                        ) : null}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => handleManageBan(player)} className="font-semibold text-primary hover:underline" type="button">
                            Manage Ban
                          </button>
                          <button
                            onClick={() => updateBan(player, { ban_duration_weeks: 1, ban_reason: 'Admin ban' })}
                            className="font-semibold text-yellow-500 hover:underline"
                            type="button"
                          >
                            Ban 1w
                          </button>
                          <button
                            onClick={() => updateBan(player, { clear_ban: true })}
                            className="font-semibold text-green-500 hover:underline"
                            type="button"
                          >
                            Clear Ban
                          </button>
                        </div>
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
