"use client";

import { AuthProvider } from "@/context/AuthContext";
import { PredictionProvider } from "@/context/PredictionContext";
import AdminAuthProvider from "@/context/AdminAuthContext";

export default function Providers({ children }) {
  return (
    <AuthProvider>
      <AdminAuthProvider>
        <PredictionProvider>{children}</PredictionProvider>
      </AdminAuthProvider>
    </AuthProvider>
  );
}
