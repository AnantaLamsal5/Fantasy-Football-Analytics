"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { APP_ROUTES } from "@/utils/constants";

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isValidatingAuth } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isValidatingAuth) return;
    if (!isAuthenticated) {
      router.push(APP_ROUTES.login);
    }
  }, [isAuthenticated, isValidatingAuth, router]);

  if (isValidatingAuth || !isAuthenticated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return children;
}
