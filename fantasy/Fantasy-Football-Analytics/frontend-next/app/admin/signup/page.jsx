'use client';

import Link from 'next/link';

export default function AdminSignupPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Admin Signup</h1>
          <p className="text-gray-600">Fantasy Football Analytics</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-8 p-6 bg-amber-50 border border-amber-200 rounded-lg">
            <h2 className="text-2xl font-bold text-amber-900 mb-3">Admin Account Restricted</h2>
            <p className="text-amber-700 text-sm leading-relaxed">
              Admin accounts are managed in the backend. Only users with the Admin role can access the admin panel.
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-blue-900 text-sm font-medium mb-2">For Admin Access:</p>
            <ul className="text-blue-700 text-xs space-y-1">
              <li>Contact the system administrator</li>
              <li>Use your backend staff account credentials</li>
              <li>Request access through official channels</li>
            </ul>
          </div>

          <div className="space-y-3">
            <Link
              href="/admin/login"
              className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              Go to Admin Login
            </Link>

            <Link
              href="/signup"
              className="block w-full text-center bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold py-3 rounded-lg transition-colors"
            >
              Create User Account
            </Link>
          </div>
        </div>

        <div className="text-center mt-6">
          <p className="text-gray-600 text-sm">
            Back to{' '}
            <Link href="/login" className="text-blue-600 hover:text-blue-700 font-semibold">
              User Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
