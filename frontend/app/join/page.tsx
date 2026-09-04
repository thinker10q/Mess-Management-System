"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2, LogIn, QrCode } from "lucide-react";
import {
  enterMess,
  extractError,
  fetchMessNames,
  listAllMesses,
  type MessEnterResponse,
} from "@/lib/api";
import { useAuthStore } from "@/store/auth";

function JoinInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const code = (sp?.get("code") ?? "").trim().toUpperCase();

  const [name, setName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const setMessSession = useAuthStore((s) => s.setMessSession);
  const setCurrentMess = useAuthStore((s) => s.setCurrentMess);

  // Resolve the mess id from the public listing so we can load its fixed names.
  const allMessesQuery = useQuery({
    queryKey: ["all-messes"],
    queryFn: () => listAllMesses(),
    staleTime: 30_000,
  });
  const mess = useMemo(
    () => (allMessesQuery.data ?? []).find((m) => m.code.toUpperCase() === code),
    [allMessesQuery.data, code]
  );

  const namesQuery = useQuery({
    queryKey: ["mess-names", mess?.id],
    enabled: mess?.id != null,
    queryFn: () => fetchMessNames(mess!.id),
    staleTime: 30_000,
  });
  const fixedNames: string[] = namesQuery.data ?? [];

  const enter = useMutation({
    mutationFn: () => enterMess(code, name.trim()),
    onSuccess: (resp: MessEnterResponse) => {
      setMessSession(resp.mess.id, {
        token: resp.access_token,
        display_name: resp.display_name,
        role: resp.mess.my_role === "admin" ? "admin" : "member",
      });
      setCurrentMess(resp.mess.id);
      router.replace(`/mess/${resp.mess.id}`);
    },
  });

  const submit = () => {
    setLocalError(null);
    if (!name.trim()) {
      setLocalError("Pick your fixed name first");
      return;
    }
    enter.mutate();
  };

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
    <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="mb-4 rounded-full bg-emerald-50 p-3 text-emerald-700">
        <QrCode className="h-6 w-6" />
      </div>
      <h1 className="text-xl font-semibold text-slate-800">
        {mess ? `Joining ${mess.name}` : "Joining mess…"}
      </h1>
      <p className="mt-2 text-center text-sm text-slate-600">
        {code
          ? `Pick your fixed name and enter with code ${code}. No Guest names — your name is fixed by the admin.`
          : "No mess code was supplied. Please use the enter page or scan a valid QR code."}
      </p>

      {code && (
        <div className="mt-6 w-full space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Your name</label>
            <select
              className="input"
              value={name}
              onChange={(e) => {
                setLocalError(null);
                if (enter.isError) enter.reset();
                setName(e.target.value);
              }}
              data-testid="join-name-select"
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
          </div>

          {enterErrorMessage && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {enterErrorMessage}
            </div>
          )}

          <button
            onClick={submit}
            disabled={!name.trim() || enter.isPending}
            className="btn-primary w-full bg-emerald-600 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogIn className="h-4 w-4" />
            {enter.isPending ? "Entering..." : "Enter mess"}
          </button>

          {enter.isPending && (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Entering mess...
            </div>
          )}
        </div>
      )}

      {!code && (
        <a href="/enter" className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700">
          Go to enter page <ArrowRight className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<div className="text-slate-500">Loading join link…</div>}>
      <JoinInner />
    </Suspense>
  );
}
