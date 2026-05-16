'use client';

import { useState, useEffect } from 'react';
import ProtectedAdminRoute from '@/components/ProtectedAdminRoute';
import AdminSidebar from '@/components/AdminSidebar';
import { API_BASE_URL } from '@/utils/constants';

export default function AdminTransfersPage() {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const adminToken = typeof window !== 'undefined' ? localStorage.getItem('ff_admin_token') : '';

  useEffect(() => {
    fetchTransfers();
  }, []);

  async function fetchTransfers() {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/transfers/`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      if (response.ok) {
        const data = await response.json();
        setTransfers(Array.isArray(data) ? data : []);
      } else {
        setTransfers([]);
      }
    } catch (err) {
      console.error('Error fetching transfers:', err);
      setTransfers([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ProtectedAdminRoute>
      <div className="flex min-h-screen bg-gray-100">
        <AdminSidebar />

        <main className="flex-1 p-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900">Transfers</h1>
            <p className="text-gray-600">View transfer history and activity</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 font-medium">{error}</p>
            </div>
          )}

          {/* Refresh Button */}
          <div className="mb-6">
            <button
              onClick={fetchTransfers}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
            >
              Refresh
            </button>
          </div>

          {/* Transfers Table */}
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="mt-4 text-gray-600">Loading transfers...</p>
            </div>
          ) : transfers.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <p className="text-gray-600 text-lg">No transfers found</p>
              <p className="text-gray-500 text-sm mt-2">Transfer history will appear here</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">User</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Player Out</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Player In</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {transfers.map((transfer, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900 font-semibold">{transfer.user || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{transfer.player_out || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{transfer.player_in || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {transfer.created_at ? new Date(transfer.created_at).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Info Card */}
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">Transfer Management</h3>
            <p className="text-blue-800 text-sm mb-4">
              View all player transfers made by users across the platform. This includes all buy/sell transactions from the transfer market.
            </p>
            <ul className="text-blue-700 text-sm space-y-2">
              <li>✓ Track all transfer activities</li>
              <li>✓ Monitor user spending and budget</li>
              <li>✓ Verify transfer integrity</li>
              <li>✓ Manage transfer disputes if needed</li>
            </ul>
          </div>
        </main>
      </div>
    </ProtectedAdminRoute>
  );
}
