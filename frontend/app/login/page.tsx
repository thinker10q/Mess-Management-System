"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChefHat, LogIn } from "lucide-react";
import {
  login as apiLogin,
  fetchMe,
  extractError,
} from "@/lib/api";
import { useAuthStore } from "@/store/auth";

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const tok = await apiLogin(username.trim(), password);
      const me = await fetchMe();
      setAuth(tok.access_token, me as any);
      const next = sp.get("next") ?? "/";
      router.push(next);
    } catch (e: any) {
      setError(extractError(e, "Login failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="card mt-10">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="rounded-full bg-brand-50 p-3">
            <ChefHat className="h-7 w-7 text-brand-600" />
          </div>
          <h1 className="text-xl font-bold">Sign in</h1>
          <p className="text-sm text-slate-500 text-center">
            For mess managers only. Members can{" "}
            <a href="/enter" className="font-medium text-brand-700 hover:underline">
              enter a mess
            </a>{" "}
            directly with a code.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Username</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Password</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && (
            <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
          )}
          <button disabled={loading} className="btn-primary w-full">
            <LogIn className="h-4 w-4" /> {loading ? "Please wait..." : "Sign in"}
          </button>
          <div className="text-center text-sm text-slate-600">
            Just want to track meals?{" "}
            <a href="/enter" className="font-medium text-brand-700 hover:underline">
              Enter with a code
            </a>
            .
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-slate-500">Loading...</div>}>
      <LoginInner />
    </Suspense>
  );
}