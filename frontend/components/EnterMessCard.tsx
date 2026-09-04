"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LogIn, Eye, EyeOff } from "lucide-react";
import {
  enterMess,
  extractError,
  fetchMessNames,
  type MessEnterResponse,
} from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface EnterMessCardProps {
  /**
   * If provided, the card is "locked" to this mess. The user picks their
   * admin-fixed name from the list, types this mess's exact code
   * (case-insensitive), and enters. Typing any other code shows "Wrong code"
   * and does NOT submit. Leave undefined for a generic
   * "type any mess code + fixed name" flow (used on /enter).
   */
  lockToCode?: string;
  lockToName?: string;
  lockToMessId?: number;
  onSuccess?: (resp: MessEnterResponse) => void;
}

/**
 * Enter a mess as a fixed member.
 *
 * Two modes:
 *   1. Generic mode (no lockToCode): type any mess code + your fixed name.
 *   2. Locked mode (lockToCode set): pick your fixed name, type the selected
 *      mess's code. A different code shows "Wrong code" and does not submit.
 * No Guest users are created — names are fixed by the admin.
 */
export function EnterMessCard({
  lockToCode,
  lockToName,
  lockToMessId,
  onSuccess,
}: EnterMessCardProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const setMessSession = useAuthStore((s) => s.setMessSession);
  const setCurrentMess = useAuthStore((s) => s.setCurrentMess);

  // Fixed member name (set by admin) + secret code. Code is validated against
  // lockToCode on submit: a mismatch shows "Wrong code" and does NOT submit.
  const [name, setName] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [localError, setLocalError] = useState<string | null>(null);
  // Code is masked like a password so onlookers can't see it.
  const [showCode, setShowCode] = useState(false);

  // Fixed-name list for the selected mess (public, no auth needed).
  const namesQuery = useQuery({
    queryKey: ["mess-names", lockToMessId],
    enabled: lockToMessId != null,
    queryFn: () => fetchMessNames(lockToMessId!),
    staleTime: 30_000,
  });
  const fixedNames: string[] = namesQuery.data ?? [];

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

  const enter = useMutation({
    mutationFn: () => enterMess(code.trim(), name.trim()),
    onSuccess: (resp) => {
      setMessSession(resp.mess.id, {
        token: resp.access_token,
        display_name: resp.display_name,
        // Keep the real role from the backend: an admin entering with their
        // own fixed name stays admin instead of dropping to member.
        role: resp.mess.my_role === "admin" ? "admin" : "member",
      });
      setCurrentMess(resp.mess.id);
      if (onSuccess) onSuccess(resp);
      else router.push(`/mess/${resp.mess.id}`);
    },
  });

  const submit = () => {
    setLocalError(null);
    if (!name.trim()) {
      setLocalError("Pick your name");
      return;
    }
    if (!code.trim()) return;
    if (!codeMatchesLock) {
      // Selected-mess flow: the typed code must match the selected mess.
      // Tell the user instead of silently staying disabled.
      setLocalError("Wrong code");
      return;
    }
    enter.mutate();
  };

  // Keep the button clickable even when the code is wrong so the user
  // gets a clear "Wrong code" message. Only block empty input / pending.
  const disabled =
    name.trim().length < 1 || code.trim().length < 1 || enter.isPending;

  // Map backend errors to friendly messages.
  const enterErrorMessage = (() => {
    if (localError) return localError;
    if (!enter.isError) return null;
    const raw = extractError(enter.error, "Could not enter mess");
    const status = (enter.error as any)?.response?.status;
    if (status === 404 || /not found/i.test(raw)) {
      if (/name not found/i.test(raw)) return raw;
      return "Wrong code";
    }
    return raw;
  })();

  return (
    <div className="card border-emerald-200 bg-emerald-50/30">
      <h2 className="mb-3 text-lg font-semibold flex items-center gap-2">
        <LogIn className="h-4 w-4 text-emerald-700" /> Enter this mess
      </h2>
      <p className="mb-3 text-sm text-slate-600">
        Pick your fixed name, type the mess code shared by your manager, and
        press <strong>Enter mess</strong>. No Guest names — your name is fixed
        by the admin.
      </p>
      {lockToCode && (
        <p className="mb-3 text-xs text-slate-500">
          Entering{" "}
          <span className="font-semibold text-slate-700">
            {lockToName ?? "this mess"}
          </span>
          . Close the selection above to switch messes.
        </p>
      )}
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Your name</label>
          {lockToMessId != null ? (
            <>
              <select
                className="input"
                value={name}
                onChange={(e) => {
                  setLocalError(null);
                  if (enter.isError) enter.reset();
                  setName(e.target.value);
                }}
                data-testid="enter-name-select"
              >
                <option value="">Pick your fixed name...</option>
                {fixedNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              {namesQuery.isLoading && (
                <p className="mt-1 text-xs text-slate-500">Loading names...</p>
              )}
              {!namesQuery.isLoading && fixedNames.length === 0 && (
                <p className="mt-1 text-xs text-amber-700">
                  No fixed names yet — ask the admin to add members first.
                </p>
              )}
            </>
          ) : (
            <input
              className="input"
              placeholder="Your fixed name (set by admin)"
              value={name}
              onChange={(e) => {
                setLocalError(null);
                if (enter.isError) enter.reset();
                setName(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              maxLength={80}
              data-testid="enter-name-input"
            />
          )}
        </div>
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
                if (enter.isError) enter.reset();
                setCode(
                  e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")
                );
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              maxLength={16}
              autoComplete="off"
              data-testid="enter-code-input"
            />
            <button
              type="button"
              aria-label={showCode ? "Hide mess code" : "Show mess code"}
              onClick={() => setShowCode((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-700"
              data-testid="enter-code-toggle"
            >
              {showCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Ask your manager for the code. It stays hidden while you type.
          </p>
        </div>
        {enterErrorMessage && (
          <div
            className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700"
            data-testid="enter-error"
          >
            {enterErrorMessage}
          </div>
        )}
        <button
          disabled={disabled}
          onClick={submit}
          className="btn-primary w-full bg-emerald-600 hover:bg-emerald-700"
          data-testid="enter-mess-submit"
        >
          <LogIn className="h-4 w-4" />
          {enter.isPending ? "Entering..." : "Enter mess"}
        </button>
      </div>
    </div>
  );
}
