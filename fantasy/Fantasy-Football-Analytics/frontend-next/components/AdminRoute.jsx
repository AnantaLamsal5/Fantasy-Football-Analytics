"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { APP_ROUTES } from "@/utils/constants";

export default function AdminRoute({ children }) {
  const { isAuthenticated, isValidatingAuth, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isValidatingAuth) return;

    if (!isAuthenticated) {
      router.push(APP_ROUTES.login);
      return;
    }

    if (user?.role !== "admin") {
      router.push(APP_ROUTES.dashboard);
    }
  }, [isAuthenticated, isValidatingAuth, user?.role, router]);

  if (isValidatingAuth || !isAuthenticated || user?.role !== "admin") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return children;
}
