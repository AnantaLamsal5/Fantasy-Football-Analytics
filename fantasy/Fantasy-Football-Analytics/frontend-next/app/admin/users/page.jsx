'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Search, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import ProtectedAdminRoute from '@/components/ProtectedAdminRoute';
import AdminSidebar from '@/components/AdminSidebar';
import { API_BASE_URL } from '@/utils/constants';

function getAdminToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('ff_admin_token') || '' : '';
}

async function readError(response, fallback) {
  try {
    const payload = await response.json();
    return payload?.detail || fallback;
  } catch {
    return fallback;
  }
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [adminEmail] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('ff_admin_email') || '' : ''
  );
  const [promotingEmail, setPromotingEmail] = useState('');
  const [updatingId, setUpdatingId] = useState('');
  const [deletingId, setDeletingId] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users/`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });

      if (!response.ok) {
        throw new Error(await readError(response, 'Failed to fetch users'));
      }

      const data = await response.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load users');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(fetchUsers);
  }, [fetchUsers]);

  async function updateUserRole(userId, newRole) {
    setUpdatingId(userId);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users/${userId}/`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify({ role: newRole }),
      });

      if (!response.ok) {
        throw new Error(await readError(response, 'Failed to update user role'));
      }

      const updatedUser = await response.json();
      setUsers((prev) => prev.map((u) => (u.id === userId ? updatedUser : u)));
      setSuccess(`${updatedUser.email} is now ${updatedUser.role === 'admin' ? 'an admin' : 'a user'}.`);
      return updatedUser;
    } catch (err) {
      setError(err.message || 'Failed to update user role');
      return null;
    } finally {
      setUpdatingId('');
    }
  }

  async function handlePromoteByEmail(event) {
    event.preventDefault();
    const email = promotingEmail.trim().toLowerCase();

    if (!email) {
      setError('Enter a registered user email first.');
      return;
    }

    const user = users.find((item) => item.email?.toLowerCase() === email);
    if (!user) {
      setError('No registered user was found with that email address.');
      setSuccess('');
      return;
    }

    if (user.role === 'admin') {
      setSuccess(`${user.email} is already an admin.`);
      setError('');
      setPromotingEmail('');
      return;
    }

    const updatedUser = await updateUserRole(user.id, 'admin');
    if (updatedUser) {
      setPromotingEmail('');
    }
  }

  async function handleDelete(user) {
    const confirmed = confirm(
      `Delete ${user.email} from the database? This removes the registered user account and cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(user.id);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users/${user.id}/`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });

      if (!response.ok) {
        throw new Error(await readError(response, 'Failed to delete user'));
      }

      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setSuccess(`${user.email} was deleted from the database.`);
    } catch (err) {
      setError(err.message || 'Failed to delete user');
    } finally {
      setDeletingId('');
    }
  }

  const filteredUsers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return users;

    return users.filter(
      (user) =>
        user.email?.toLowerCase().includes(query) ||
        user.username?.toLowerCase().includes(query) ||
        user.role?.toLowerCase().includes(query)
    );
  }, [searchTerm, users]);

  const stats = useMemo(
    () => ({
      total: users.length,
      admins: users.filter((user) => user.role === 'admin').length,
      active: users.filter((user) => user.is_active).length,
    }),
    [users]
  );

  return (
    <ProtectedAdminRoute>
      <div className="flex min-h-screen bg-background">
        <AdminSidebar />

        <main className="flex-1 p-8">
          <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-4xl font-bold text-foreground">Users</h1>
              <p className="text-muted-foreground">Manage registered accounts, admin access, and database deletion.</p>
            </div>

            <button
              type="button"
              onClick={fetchUsers}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted/60"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <div className="card p-5">
              <p className="text-sm font-semibold text-muted-foreground">Registered Users</p>
              <p className="mt-2 text-3xl font-bold text-foreground">{stats.total}</p>
            </div>
            <div className="card p-5">
              <p className="text-sm font-semibold text-muted-foreground">Admins</p>
              <p className="mt-2 text-3xl font-bold text-primary">{stats.admins}</p>
            </div>
            <div className="card p-5">
              <p className="text-sm font-semibold text-muted-foreground">Active Accounts</p>
              <p className="mt-2 text-3xl font-bold text-green-500">{stats.active}</p>
            </div>
          </div>

          <div className="card mb-6 p-6">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UserPlus className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Make Admin By Email</h2>
                <p className="text-sm text-muted-foreground">Enter a registered user&apos;s email address to grant admin access.</p>
              </div>
            </div>

            <form onSubmit={handlePromoteByEmail} className="flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                value={promotingEmail}
                onChange={(event) => setPromotingEmail(event.target.value)}
                placeholder="registered.user@example.com"
                className="h-11 flex-1 rounded-md border border-border bg-input px-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="submit"
                disabled={!!updatingId}
                className="btn-primary h-11 gap-2 px-5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ShieldCheck className="h-4 w-4" />
                Make Admin
              </button>
            </form>
          </div>

          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
              <p className="text-sm font-semibold text-destructive">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 rounded-lg border border-green-500/20 bg-green-500/10 p-4">
              <p className="text-sm font-semibold text-green-400">{success}</p>
            </div>
          )}

          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search users by email, username, or role"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="h-12 w-full rounded-md border border-border bg-input pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center">
              <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="mt-4 text-muted-foreground">Loading users...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-lg text-muted-foreground">
                {searchTerm ? 'No users found matching your search.' : 'No users found.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/40 bg-card shadow">
              <table className="w-full">
                <thead className="border-b border-border/60 bg-muted/30">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-muted-foreground">User</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-muted-foreground">Role</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-muted-foreground">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-muted-foreground">Joined</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filteredUsers.map((user) => {
                    const isCurrentAdmin = adminEmail && user.email?.toLowerCase() === adminEmail.toLowerCase();
                    const isUpdating = updatingId === user.id;
                    const isDeleting = deletingId === user.id;

                    return (
                      <tr key={user.id} className="hover:bg-muted/30">
                        <td className="px-6 py-4">
                          <p className="text-sm font-semibold text-foreground">{user.email}</p>
                          <p className="text-sm text-muted-foreground">{user.username || 'No username'}</p>
                          {isCurrentAdmin && (
                            <p className="mt-1 text-xs font-semibold text-primary">Current admin</p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <select
                            value={user.role || 'user'}
                            onChange={(event) => updateUserRole(user.id, event.target.value)}
                            disabled={isUpdating || isCurrentAdmin}
                            className="h-9 rounded-md border border-border bg-input px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                          >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                              user.is_active ? 'bg-green-500/10 text-green-400' : 'bg-destructive/10 text-destructive'
                            }`}
                          >
                            {user.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">
                          {user.date_joined ? new Date(user.date_joined).toLocaleDateString() : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <button
                            type="button"
                            onClick={() => handleDelete(user)}
                            disabled={isDeleting || isCurrentAdmin}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-destructive/30 px-3 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground"
                          >
                            <Trash2 className="h-4 w-4" />
                            {isDeleting ? 'Deleting' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="border-t border-border/60 bg-muted/30 px-6 py-4">
                <p className="text-sm text-muted-foreground">
                  Showing {filteredUsers.length} of {users.length} users
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </ProtectedAdminRoute>
  );
}
