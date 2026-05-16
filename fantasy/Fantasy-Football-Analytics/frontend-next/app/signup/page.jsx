"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestSignupCode, signup } from "@/services/authService";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function SignupPage() {
  const [form, setForm] = useState({ username: "", email: "", password: "", code: "" });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [signupToken, setSignupToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  async function getCode() {
    setLoading(true);
    setError("");
    try {
      const res = await requestSignupCode({ email: form.email });
      // backend returns a signed signup_token; save it for registration
      if (res?.signup_token) {
        setSignupToken(res.signup_token);
      }
      setMessage("Verification code sent.");
    } catch (err) {
      setError(err.message || "Unable to request code.");
    } finally {
      setLoading(false);
    }
  }

  const { setAuthenticatedUser } = useAuth();

  async function onSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (!signupToken) {
        setError("Please request a verification code first.");
        setLoading(false);
        return;
      }

      const payload = { ...form, signup_token: signupToken };
      const res = await signup(payload);
      if (res?.user) {
        setAuthenticatedUser(res.user);
      }
      // Redirect to dashboard after successful signup
      router.push("/dashboard");
    } catch (err) {
      setError(err.message || "Unable to register.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto p-6 md:p-10 flex items-center justify-center min-h-[60vh]">
      <div className="card max-w-md w-full">
        <h1 className="text-2xl font-bold mb-2">Create account</h1>
        <p className="text-muted-foreground mb-4">
          Create an account to start building and managing your squad.
        </p>
        <form onSubmit={onSubmit} className="space-y-3">
          <input
            className="w-full px-4 py-2 rounded-md bg-input border border-border text-foreground"
            type="text"
            placeholder="Username"
            value={form.username}
            onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
            required
          />
          <input
            className="w-full px-4 py-2 rounded-md bg-input border border-border text-foreground"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            required
          />
          <div className="relative">
            <input
              className="w-full pr-12 px-4 py-2 rounded-md bg-input border border-border text-foreground"
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-primary px-2 py-1"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9.27-3-11-8 1.02-2.58 2.79-4.72 4.94-6.06" />
                  <path d="M1 1l22 22" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <input
              className="col-span-2 px-4 py-2 rounded-md bg-input border border-border text-foreground"
              type="text"
              placeholder="Verification code"
              value={form.code}
              onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
              required
            />
            <button
              type="button"
              onClick={getCode}
              disabled={loading || !form.email}
              className="btn-primary"
            >
              Request
            </button>
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Submitting..." : "Sign up"}
          </button>
          {message ? <p className="text-sm text-green-400">{message}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </form>
        <div className="mt-4 text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href={"/login"} className="text-primary hover:underline">
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
