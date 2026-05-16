'use client';

import { useContext, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AdminAuthContext } from '@/context/AdminAuthContext';

export default function ProtectedAdminRoute({ children }) {
  const router = useRouter();
  const { isAdminAuthenticated, adminLoading } = useContext(AdminAuthContext);

  useEffect(() => {
    if (!adminLoading && !isAdminAuthenticated) {
      router.push('/admin/login');
    }
  }, [isAdminAuthenticated, adminLoading, router]);

  if (adminLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <div className="mb-4">
            <div className="inline-block w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-gray-600 text-lg">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (!isAdminAuthenticated) {
    return null; // Router will redirect
  }

  return children;
}
