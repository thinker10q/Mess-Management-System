"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, Eye, EyeOff } from "lucide-react";
import { adminLoginMess, extractError } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface AdminSignInCardProps {
  /**
   * If provided, the card is "locked" to this mess. The manager must type this
   * exact code (case-insensitive) before the password field is submitted.
   * Typing any other code shows "Wrong code" and does NOT call the backend.
   * Leave undefined for a generic "type any mess code + password" flow.
   */
  lockToCode?: string;
  lockToName?: string;
  onSuccess?: (messId: number) => void;
}

/**
 * Manager sign-in for an EXISTING mess.
 *
 * Two modes:
 *   1. Generic mode (no lockToCode): type any mess code + manager password.
 *   2. Locked mode (lockToCode set): only the selected mess's code is accepted.
 *      Typing a different code shows "Wrong code" and does not submit.
 */
export function AdminSignInCard({
  lockToCode,
  lockToName,
  onSuccess,
}: AdminSignInCardProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const setMessSession = useAuthStore((s) => s.setMessSession);
  const setCurrentMess = useAuthStore((s) => s.setCurrentMess);

  const [code, setCode] = useState<string>("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  // Mask the mess code like a password so it doesn't show on screen.
  const [showCode, setShowCode] = useState(false);

  // Deep-link pre-fill via ?code=... only applies in generic (unlocked) mode.
  useEffect(() => {
    if (lockToCode) return;
    const q = sp?.get("code");
    if (q) setCode(q.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  }, [sp, lockToCode]);

  const codeMatchesLock = useMemo(() => {
    if (!lockToCode) return true;
    return code.trim().toUpperCase() === lockToCode.toUpperCase();
  }, [code, lockToCode]);

  const login = useMutation({
    mutationFn: () => adminLoginMess(code.trim(), password),
    onSuccess: (resp) => {
      const messId = resp.mess.id;
      const managerName = resp.mess.manager_name ?? "Manager";
      setAuth(resp.access_token, {
        id: 0,
        username: `manager_${messId}`,
        full_name: managerName,
        role: "admin",
      });
      setMessSession(messId, {
        token: resp.access_token,
        display_name: managerName,
        role: "admin",
      });
      setCurrentMess(messId);
      if (onSuccess) onSuccess(messId);
      else router.push(`/mess/${messId}/admin`);
    },
  });

  const submit = () => {
    setLocalError(null);
    if (!code.trim() || !password) return;
    if (!codeMatchesLock) {
      setLocalError("Wrong code");
      return;
    }
    login.mutate();
  };

  // Keep clickable on wrong code so the user sees "Wrong code".
  // Only block empty input / pending.
  const disabled =
    code.trim().length < 1 ||
    password.length < 1 ||
    login.isPending;

  // Map backend 404 "not found" details to a friendly "Wrong code" message.
  const loginErrorMessage = (() => {
    if (localError) return localError;
    if (!login.isError) return null;
    const raw = extractError(login.error, "Could not sign in as manager");
    const status = (login.error as any)?.response?.status;
    if (status === 404 || /not found/i.test(raw)) return "Wrong code";
    return raw;
  })();

  return (
    <div className="card border-indigo-200 bg-indigo-50/30">
      <h2 className="mb-3 text-lg font-semibold flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-indigo-700" /> Manager sign-in
      </h2>
      <p className="mb-3 text-sm text-slate-600">
        Already created this mess? Sign in as the manager with your mess code and
        manager password to access the admin dashboard (members, charts, reports).
      </p>
      {lockToCode && (
        <p className="mb-3 text-xs text-slate-500">
          Signing into{" "}
          <span className="font-semibold text-slate-700">
            {lockToName ?? "this mess"}
          </span>
          . Close the selection above to switch messes.
        </p>
      )}
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Mess code</label>
          <div className="relative">
            <input
              type={showCode ? "text" : "password"}
              className="input pr-11 font-mono uppercase tracking-widest"
              placeholder="• • • • • •"
              value={code}
              onChange={(e) => {
                setLocalError(null);
                if (login.isError) login.reset();
                setCode(
                  e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")
                );
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              maxLength={16}
              autoComplete="off"
              data-testid="admin-code-input"
            />
            <button
              type="button"
              aria-label={showCode ? "Hide mess code" : "Show mess code"}
              onClick={() => setShowCode((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-700"
              data-testid="admin-code-toggle"
            >
              {showCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Manager password</label>
          <input
            type="password"
            className="input"
            placeholder="the password you set when you created this mess"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            autoComplete="current-password"
          />
        </div>
        {loginErrorMessage && (
          <div
            className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700"
            data-testid="admin-error"
          >
            {loginErrorMessage}
          </div>
        )}
        <button
          disabled={disabled}
          onClick={submit}
          className="btn-primary w-full bg-indigo-600 hover:bg-indigo-700"
          data-testid="admin-signin-submit"
        >
          <KeyRound className="h-4 w-4" />
          {login.isPending ? "Signing in..." : "Sign in as manager"}
        </button>
      </div>
    </div>
  );
}