"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  ShoppingCart,
  Trash2,
  Wallet,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import {
  createMarket,
  deleteMarket,
  extractError,
  fetchActiveChart,
  listMarkets,
  type MarketOut,
} from "@/lib/api";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Mobile keyboards may emit commas or Bengali digits for decimals.
function parseAmountInput(raw: string): number {
  const normalized = (raw || "")
    .trim()
    .replace(/,/g, ".")
    .replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)));
  return Number(normalized);
}

type CellState = "idle" | "saving" | "saved" | "error";

export default function MessBazarPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const messId = Number(params.id);

  const token = useAuthStore((s) => s.token);
  const messes = useAuthStore((s) => s.messes);
  const messSessions = useAuthStore((s) => s.messSessions);
  const setCurrentMess = useAuthStore((s) => s.setCurrentMess);
  const mess = messes.find((m) => m.id === messId);

  const hasSession = !!(messSessions[messId]?.token || token);
  const role = messSessions[messId]?.role ?? "member";
  const isAdmin = role === "admin";
  // Fixed name of the signed-in person. Non-admin members may only edit the
  // bazar row that matches their own name — every other row is locked.
  const myName = (messSessions[messId]?.display_name ?? "").trim().toLowerCase();

  useEffect(() => {
    if (!hasSession) {
      router.replace(
        `/enter?code=&next=${encodeURIComponent(`/mess/${messId}/bazar`)}`
      );
      return;
    }
    setCurrentMess(messId);
  }, [hasSession, messId, setCurrentMess, router]);

  const activeChartQuery = useQuery({
    queryKey: ["active-chart", messId],
    enabled: hasSession && !!messId,
    queryFn: () => fetchActiveChart(messId),
    retry: false,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  const chartId = activeChartQuery.data?.id;

  const marketsQuery = useQuery({
    queryKey: ["markets", messId, chartId],
    enabled: !!chartId,
    queryFn: () => listMarkets(messId, chartId!),
    // Live bazar: anyone's update appears automatically for everyone.
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  // Draft state: per-member amount + per-member description, keyed by member id.
  // Nothing is saved until Enter is pressed inside an amount field.
  const [date, setDate] = useState(todayIso());
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [descriptions, setDescriptions] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [cellState, setCellState] = useState<Record<number, CellState>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Tracks the exact string value we have already POSTed; prevents redundant
  // saves for the same value.
  const lastPostedAmount = useRef<Record<number, string>>({});
  // Prevents overlapping POSTs for the same row.
  const inFlight = useRef<Set<number>>(new Set());

  // Mirror latest values in refs so the Enter handler always reads the
  // freshest input — no stale closures.
  const amountsRef = useRef(amounts);
  const descriptionsRef = useRef(descriptions);
  useEffect(() => {
    amountsRef.current = amounts;
  }, [amounts]);
  useEffect(() => {
    descriptionsRef.current = descriptions;
  }, [descriptions]);

  const qc = useQueryClient();
  const createMut = useMutation({
    mutationFn: (vars: {
      memberId: number;
      amount: number;
      description: string;
    }) =>
      createMarket(messId, chartId!, {
        chart_id: chartId!,
        member_id: vars.memberId,
        date,
        amount: vars.amount,
        description: vars.description || undefined,
      }),
    onSuccess: (_d, vars) => {
      lastPostedAmount.current[vars.memberId] = String(vars.amount);
      setErrors((p) => {
        const n = { ...p };
        delete n[vars.memberId];
        return n;
      });
      setCellState((p) => ({ ...p, [vars.memberId]: "saved" }));
      setGlobalError(null);
      qc.invalidateQueries({ queryKey: ["markets", messId, chartId] });
      qc.invalidateQueries({ queryKey: ["chart-view", messId, chartId] });
      qc.invalidateQueries({ queryKey: ["report", messId, chartId] });
      // Reset to idle shortly so the saved indicator doesn't stick forever.
      setTimeout(() => {
        setCellState((p) =>
          p[vars.memberId] === "saved" ? { ...p, [vars.memberId]: "idle" } : p
        );
      }, 1500);
    },
    onError: (err, vars) => {
      setErrors((p) => ({ ...p, [vars.memberId]: extractError(err) }));
      setCellState((p) => ({ ...p, [vars.memberId]: "error" }));
    },
  });

  const deleteMut = useMutation({
    mutationFn: (marketId: number) => deleteMarket(messId, chartId!, marketId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["markets", messId, chartId] });
      qc.invalidateQueries({ queryKey: ["chart-view", messId, chartId] });
      qc.invalidateQueries({ queryKey: ["report", messId, chartId] });
    },
  });

  const members = useMemo(
    () => activeChartQuery.data?.members ?? [],
    [activeChartQuery.data?.members]
  );

  // Row lock: admin edits everyone; a member edits only their own fixed name.
  const canEditRow = (memberName: string) =>
    isAdmin || memberName.trim().toLowerCase() === myName;

  const myRowMissing =
    !isAdmin &&
    myName !== "" &&
    members.length > 0 &&
    !members.some((m) => m.name.trim().toLowerCase() === myName);

  const markets: MarketOut[] = marketsQuery.data ?? [];

  // Original entered name per bazar row: server member_name first, then the
  // chart member list (names entered at chart creation). Never blank.
  const nameById = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m.name])),
    [members]
  );
  const displayName = (e: MarketOut) =>
    e.member_name || nameById[e.member_id] || `Member #${e.member_id}`;

  // Today's totals per member for quick reference.
  const todayTotals = useMemo(() => {
    const sums: Record<number, number> = {};
    for (const m of markets) {
      if (m.date === date) {
        sums[m.member_id] = (sums[m.member_id] ?? 0) + m.amount;
      }
    }
    return sums;
  }, [markets, date]);

  const grandTotal = useMemo(
    () => markets.reduce((acc, m) => acc + m.amount, 0),
    [markets]
  );

  const todayTotal = useMemo(() => {
    let s = 0;
    for (const k in todayTotals) s += todayTotals[Number(k)];
    return s;
  }, [todayTotals]);

  const todayEntryCount = useMemo(
    () => markets.filter((m) => m.date === date).length,
    [markets, date]
  );

  // Set of "<memberId>:<amount>" already present in markets for the current
  // date. Used as a hard dedupe: if the user re-enters a value that is
  // already saved on the server (e.g. after navigating away and back, after
  // a remount, etc.), we never POST it again.
  const existingAmounts = useMemo(() => {
    const set = new Set<string>();
    for (const m of markets) {
      if (m.date === date) {
        set.add(`${m.member_id}:${m.amount.toFixed(2)}`);
      }
    }
    return set;
  }, [markets, date]);

  // Validate-and-save for a single row, triggered by Enter key or the
  // per-row Add button (needed on mobile where Enter may not exist).
  // Performs layered dedupe checks so it can never create a duplicate entry
  // regardless of how many times it is invoked.
  const performSave = (memberId: number) => {
    const raw = (amountsRef.current[memberId] ?? "").trim();
    const desc = descriptionsRef.current[memberId] ?? "";

    if (!raw) {
      // Empty -> treat as idle, clear any prior error.
      setCellState((p) => ({ ...p, [memberId]: "idle" }));
      setErrors((p) => {
        const n = { ...p };
        delete n[memberId];
        return n;
      });
      return;
    }
    const amt = parseAmountInput(raw);
    if (!Number.isFinite(amt) || amt <= 0) {
      setErrors((p) => ({
        ...p,
        [memberId]: "Enter an amount greater than 0",
      }));
      setCellState((p) => ({ ...p, [memberId]: "error" }));
      return;
    }

    // Dedupe 1: don't re-post an amount we already saved this session.
    if (lastPostedAmount.current[memberId] === raw) return;
    // Dedupe 2: skip if a save is already in flight for this row.
    if (inFlight.current.has(memberId)) return;
    // Dedupe 3: if this (member, amount) already exists on the server for
    // today's date, don't POST again. This catches any path that wasn't
    // covered by refs (e.g. remount, page refresh, stale event).
    if (existingAmounts.has(`${memberId}:${parseAmountInput(raw).toFixed(2)}`)) {
      lastPostedAmount.current[memberId] = raw;
      return;
    }

    inFlight.current.add(memberId);
    setErrors((p) => {
      const n = { ...p };
      delete n[memberId];
      return n;
    });
    setCellState((p) => ({ ...p, [memberId]: "saving" }));
    createMut.mutate(
      { memberId, amount: amt, description: desc },
      {
        onSettled: () => {
          inFlight.current.delete(memberId);
        },
      }
    );
  };

  // Manual save: nothing is posted while typing or on blur. Pressing Enter
  // inside an amount field OR tapping the per-row Add button saves the entry.
  const flushSave = (memberId: number) => {
    // Fast-path: empty or unchanged value -> don't even call performSave.
    const raw = (amountsRef.current[memberId] ?? "").trim();
    if (!raw) {
      performSave(memberId); // surfaces "enter amount" idle state / clears error
      return;
    }
    if (lastPostedAmount.current[memberId] === raw) return;
    if (existingAmounts.has(`${memberId}:${parseAmountInput(raw).toFixed(2)}`)) {
      lastPostedAmount.current[memberId] = raw;
      return;
    }
    performSave(memberId);
  };

  // Pressing Enter inside an amount field saves the entry.
  const onAmountKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    memberId: number
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      flushSave(memberId);
      e.currentTarget.blur();
    }
  };
  // Reset dedupe tracking when the user changes the date, otherwise an entry
  // posted for "today" would block a re-post on a new day with the same value.
  useEffect(() => {
    lastPostedAmount.current = {};
  }, [date]);

  if (!hasSession) return null;

  if (activeChartQuery.isLoading) {
    return (
      <div className="card flex items-center gap-2 text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading chart...
      </div>
    );
  }

  if (!chartId) {
    return (
      <div className="card border-amber-200 bg-amber-50 text-amber-800">
        <AlertCircle className="mr-2 inline h-4 w-4" />
        No active chart. Ask an admin to create one before logging bazar.
        <Link href={`/mess/${messId}`} className="ml-2 underline">
          back to dashboard
        </Link>
      </div>
    );
  }

  const renderCellIndicator = (memberId: number) => {
    const state = cellState[memberId] ?? "idle";
    if (state === "saving") {
      return (
        <span className="ml-2 inline-flex items-center gap-1 text-xs text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" /> saving…
        </span>
      );
    }
    if (state === "saved") {
      return (
        <span className="ml-2 inline-flex items-center gap-1 text-xs text-emerald-600">
          <CheckCircle2 className="h-3 w-3" /> saved
        </span>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/mess/${messId}`}
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-800">
          <ShoppingCart className="h-5 w-5 text-brand-600" />
          {mess?.name ?? `Mess #${messId}`} - Bazar
        </h1>
        <p className="text-sm text-slate-600">
          {activeChartQuery.data?.title} &middot; signed in as{" "}
          <span className="font-semibold">
            {messSessions[messId]?.display_name ?? "guest"}
          </span>
          {isAdmin ? " (admin)" : " (member)"} &middot;
          <span className="ml-1 italic text-slate-500">
            {isAdmin
              ? "type an amount and press Enter to save it"
              : "only your own row is editable — type an amount and press Enter"}
          </span>
        </p>
      </div>

      {myRowMissing && (
        <div className="card border-amber-200 bg-amber-50 text-sm text-amber-800">
          Your name isn&apos;t on this chart, so all rows are locked for you. Ask
          the admin to add you to Members.
        </div>
      )}

      <div className="card">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Wallet className="h-5 w-5 text-brand-600" />
            Add bazar entry
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
            <label className="text-sm text-slate-600 sm:hidden">Date</label>
            <label className="hidden text-sm text-slate-600 sm:inline">
              Date
            </label>
            <input
              type="date"
              className="input w-full sm:w-auto"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={todayIso()}
            />
          </div>
        </div>

        {globalError && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{globalError}</span>
          </div>
        )}

        {/* Mobile-friendly stacked cards (shown < sm) */}
        <ul className="space-y-3 sm:hidden">
          {members.length === 0 && (
            <li className="rounded-lg border border-slate-200 px-3 py-4 text-center text-sm text-slate-500">
              No members on this chart.
            </li>
          )}
          {members.map((m) => {
            const state = cellState[m.id] ?? "idle";
            const editable = canEditRow(m.name);
            return (
              <li
                key={m.id}
                className="rounded-lg border border-slate-200 p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">
                    {m.name}
                    {!editable && (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                        locked
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    Today:{" "}
                    <span className="font-mono">
                      {(todayTotals[m.id] ?? 0).toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    enterKeyHint="go"
                    autoComplete="off"
                    placeholder={editable ? "Amount (0.00)" : "Locked"}
                    disabled={!editable}
                    className="input disabled:cursor-not-allowed disabled:bg-slate-50"
                    value={amounts[m.id] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setAmounts((p) => ({ ...p, [m.id]: v }));
                    }}
                    onKeyDown={(e) => onAmountKeyDown(e, m.id)}
                  />
                  <input
                    className="input disabled:cursor-not-allowed disabled:bg-slate-50"
                    placeholder={editable ? "What did you buy?" : "Locked"}
                    disabled={!editable}
                    value={descriptions[m.id] ?? ""}
                    onChange={(e) =>
                      setDescriptions((p) => ({
                        ...p,
                        [m.id]: e.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    disabled={!editable || state === "saving"}
                    onClick={() => flushSave(m.id)}
                    className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {state === "saving" ? (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 className="h-4 w-4 animate-spin" /> Adding...
                      </span>
                    ) : state === "saved" ? (
                      "Added ✓"
                    ) : (
                      "Add entry"
                    )}
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs">
                  {errors[m.id] && state !== "saving" ? (
                    <span className="text-rose-600">{errors[m.id]}</span>
                  ) : (
                    <span className="text-slate-400">
                      {editable ? "tap Add entry or press Enter" : "only this member can edit"}
                    </span>
                  )}
                  {renderCellIndicator(m.id)}
                </div>
              </li>
            );
          })}
          {members.length > 0 && (
            <li className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold">
              <span>Today total</span>
              <span className="font-mono">{todayTotal.toFixed(2)}</span>
            </li>
          )}
        </ul>

        {/* Wide table on sm+ */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="sticky-first w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-3 py-2 text-left">Member</th>
                <th className="px-3 py-2 text-right">Today total</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                    No members on this chart.
                  </td>
                </tr>
              )}
              {members.map((m) => {
                const state = cellState[m.id] ?? "idle";
                const editable = canEditRow(m.name);
                return (
                  <tr key={m.id} className="border-b align-top">
                    <td className="px-3 py-2 font-medium">
                      {m.name}
                      {!editable && (
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                          locked
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-700">
                      {(todayTotals[m.id] ?? 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        enterKeyHint="go"
                        autoComplete="off"
                        placeholder={editable ? "0.00" : "Locked"}
                        disabled={!editable}
                        className="input w-32 disabled:cursor-not-allowed disabled:bg-slate-50"
                        value={amounts[m.id] ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setAmounts((p) => ({ ...p, [m.id]: v }));
                        }}
                        onKeyDown={(e) => onAmountKeyDown(e, m.id)}
                      />
                      {errors[m.id] && state !== "saving" && (
                        <div className="mt-1 text-xs text-rose-600">
                          {errors[m.id]}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="input w-full disabled:cursor-not-allowed disabled:bg-slate-50"
                        placeholder={editable ? "What did you buy?" : "Locked"}
                        disabled={!editable}
                        value={descriptions[m.id] ?? ""}
                        onChange={(e) =>
                          setDescriptions((p) => ({
                            ...p,
                            [m.id]: e.target.value,
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={!editable || state === "saving"}
                          onClick={() => flushSave(m.id)}
                          className="btn-primary px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {state === "saving" ? "Adding..." : state === "saved" ? "Added ✓" : "Add"}
                        </button>
                        {renderCellIndicator(m.id)}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {members.length > 0 && (
                <tr className="bg-slate-50">
                  <td
                    className="px-3 py-2 text-right font-semibold"
                    colSpan={1}
                  >
                    Today total
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">
                    {todayTotal.toFixed(2)}
                  </td>
                  <td colSpan={3}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- All bazar entries (visible to all members) ---------- */}
      <div className="card">
        <h2 className="mb-3 text-lg font-semibold flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-brand-600" />
            All bazar entries
          </span>
          <span className="text-sm font-normal text-slate-500">
            ({markets.length}) &middot; today {todayEntryCount} &middot; grand
            total {grandTotal.toFixed(2)}
          </span>
        </h2>

        {marketsQuery.isLoading && (
          <p className="text-sm text-slate-500">Loading entries...</p>
        )}
        {!marketsQuery.isLoading && markets.length === 0 && (
          <p className="text-sm text-slate-500">No bazar entries yet.</p>
        )}

        {markets.length > 0 && (
          <>
            {/* Mobile-friendly stacked cards (< sm) */}
            <ul className="space-y-3 sm:hidden">
              {markets.map((e) => (
                <li
                  key={e.id}
                  className="rounded-lg border border-slate-200 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm">
                      <div className="font-medium">{displayName(e)}</div>
                      <div className="text-xs text-slate-500">
                        {e.date}
                        {e.description ? ` - ${e.description}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold">
                        {e.amount.toFixed(2)}
                      </span>
                      {isAdmin && (
                        <button
                          onClick={() => deleteMut.mutate(e.id)}
                          className="rounded p-1 text-rose-600 hover:bg-rose-50"
                          title="Delete entry"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Wide table on sm+ */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="sticky-first w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-2 py-1 text-left">Date</th>
                    <th className="px-2 py-1 text-left">Member</th>
                    <th className="px-2 py-1 text-right">Amount</th>
                    <th className="px-2 py-1 text-left">Description</th>
                    <th className="px-2 py-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {markets.map((e) => (
                    <tr key={e.id} className="border-b">
                      <td className="px-2 py-1">{e.date}</td>
                      <td className="px-2 py-1">{displayName(e)}</td>
                      <td className="px-2 py-1 text-right font-mono">
                        {e.amount.toFixed(2)}
                      </td>
                      <td className="px-2 py-1 text-slate-600">
                        {e.description || "-"}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {isAdmin && (
                          <button
                            onClick={() => deleteMut.mutate(e.id)}
                            className="rounded p-1 text-rose-600 hover:bg-rose-50"
                            title="Delete entry"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
