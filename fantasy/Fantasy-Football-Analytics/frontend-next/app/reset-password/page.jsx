"use client";

import Link from "next/link";
import { useState } from "react";
import { confirmPasswordReset, requestPasswordReset } from "@/services/authService";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function requestReset(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await requestPasswordReset({ email });
      if (res?.reset_token) setToken(res.reset_token);
      setMessage(res?.detail || "Reset instructions sent.");
    } catch (err) {
      setError(err.message || "Unable to request reset.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmReset(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await confirmPasswordReset({ token, newPassword });
      setMessage(res?.detail || "Password reset successfully.");
    } catch (err) {
      setError(err.message || "Unable to reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto p-6 md:p-10 flex items-center justify-center min-h-[60vh]">
      <div className="card max-w-md w-full">
        <h1 className="text-2xl font-bold mb-2">Reset password</h1>
        <p className="text-muted-foreground mb-6">
          Request a reset token, then enter it with a new password.
        </p>

        <form onSubmit={requestReset} className="space-y-3">
          <input
            className="w-full px-4 py-2 rounded-md bg-input border border-border text-foreground"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button className="btn-primary w-full" disabled={loading || !email} type="submit">
            {loading ? "Sending..." : "Request reset token"}
          </button>
        </form>

        <form onSubmit={confirmReset} className="space-y-3 mt-6 pt-6 border-t border-border">
          <textarea
            className="w-full min-h-24 px-4 py-2 rounded-md bg-input border border-border text-foreground text-xs"
            placeholder="Reset token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
          />
          <input
            className="w-full px-4 py-2 rounded-md bg-input border border-border text-foreground"
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <button className="btn-primary w-full" disabled={loading || !token || !newPassword} type="submit">
            {loading ? "Resetting..." : "Set new password"}
          </button>
        </form>

        {message ? <p className="text-sm text-green-400 mt-4">{message}</p> : null}
        {error ? <p className="text-sm text-destructive mt-4">{error}</p> : null}
        <div className="mt-4 text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
