"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Unlock, Loader2, FileSpreadsheet } from "lucide-react";
import clsx from "clsx";
import {
  bulkSaveMeals,
  downloadChartExcel,
  extractError,
  fetchChartView,
  lockDay,
  unlockDay,
  type ChartView,
} from "@/lib/api";
import { banglaDateLabel, messDayIndex, toBanglaNumber } from "@/lib/bangla";

interface Props {
  messId: number;
  chartId: number;
  pollMs?: number;
  isAdmin?: boolean;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Daily meal matrix.
 *
 * - Anyone (admin OR member) can type into an unlocked cell.
 * - Edits auto-save ~600 ms after the last keystroke (per-cell debounce).
 * - Past dates are auto-locked by the server (date < today) and rendered
 *   read-only for members. The admin can lock/unlock rows manually and can
 *   also override an existing lock to correct past-date mistakes.
 * - Meal values accept half-units (0.5, 1.5, ...).
 */
export function LiveMatrix({ messId, chartId, pollMs = 5000, isAdmin = false }: Props) {
  const qc = useQueryClient();
  const {
    data: view,
    isLoading,
    error,
    isFetching,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["chart-view", messId, chartId],
    queryFn: () => fetchChartView(messId, chartId),
    refetchInterval: pollMs,
    refetchOnWindowFocus: true,
  });

  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({});
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [cellError, setCellError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownloadChart = async () => {
    setDownloadError(null);
    setDownloading(true);
    try {
      await downloadChartExcel(messId, chartId);
    } catch (e) {
      setDownloadError(extractError(e, "Could not download chart"));
    } finally {
      setDownloading(false);
    }
  };

  // Reset per-chart local state when chart changes.
  useEffect(() => {
    setDraft({});
    setSavedNotice(null);
    setCellError(null);
    setDownloadError(null);
  }, [chartId]);

  // ----- All hooks above this line; conditional rendering below. -----
  const members = view?.chart.members ?? [];
  const dates = view?.dates ?? [];
  const lockedSet = useMemo(() => new Set(view?.locked_dates ?? []), [view]);
  const today = todayIso();

  // Look up the value for a (member, date) cell — draft first, server data otherwise.
  const cellValue = (memberId: number, date: string): string => {
    const key = String(memberId);
    const d = draft[key]?.[date];
    if (d !== undefined) return d;
    const v = view?.meals_by_member_date?.[String(memberId)]?.[date];
    return v === undefined || v === null ? "" : String(v);
  };

  const setCellDraft = (memberId: number, date: string, value: string) => {
    const key = String(memberId);
    setDraft((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [date]: value },
    }));
  };

  // Per-date totals — sum across members. Recompute whenever view or draft changes.
  const totalsByDate = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const d of dates) {
      let sum = 0;
      for (const m of members) {
        const raw = cellValue(m.id, d);
        const n = Number(raw);
        if (Number.isFinite(n)) sum += n;
      }
      totals[d] = sum;
    }
    return totals;
    // cellValue intentionally excluded from deps; we already depend on view + draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates, members, view, draft]);

  // ----- Mutations -----
  const saveCell = useMutation({
    mutationFn: async (args: {
      memberId: number;
      date: string;
      value: string;
    }) => {
      const meal = args.value === "" ? 0 : Number(args.value);
      if (!Number.isFinite(meal) || meal < 0 || meal > 10) {
        throw new Error("Meal must be between 0 and 10");
      }
      return bulkSaveMeals(messId, chartId, [
        { member_id: args.memberId, date: args.date, meal },
      ]);
    },
    onSuccess: (_data, vars) => {
      // Clear the cell from the local draft so the next render uses server data.
      setDraft((prev) => {
        const next = { ...prev };
        const memberDraft = { ...(next[String(vars.memberId)] || {}) };
        delete memberDraft[vars.date];
        if (Object.keys(memberDraft).length === 0) {
          delete next[String(vars.memberId)];
        } else {
          next[String(vars.memberId)] = memberDraft;
        }
        return next;
      });
      setSavedNotice(`Auto-saved ${vars.date}`);
      setTimeout(() => setSavedNotice(null), 1500);
      qc.invalidateQueries({ queryKey: ["chart-view", messId, chartId] });
    },
    onError: (err) => {
      setCellError(extractError(err));
      setTimeout(() => setCellError(null), 3000);
    },
  });

  const lockMut = useMutation({
    mutationFn: (date: string) => lockDay(messId, chartId, date),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chart-view", messId, chartId] }),
  });
  const unlockMut = useMutation({
    mutationFn: (date: string) => unlockDay(messId, chartId, date),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chart-view", messId, chartId] }),
  });

  // ----- Per-cell debounce -----
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
      debounceTimers.current = {};
    };
  }, [chartId]);

  const onCellChange = (memberId: number, date: string, value: string) => {
    if (lockedSet.has(date) && !isAdmin) return; // members can't bypass a lock.
    setCellDraft(memberId, date, value);
    const key = `${memberId}::${date}`;
    if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(() => {
      saveCell.mutate({ memberId, date, value });
    }, 600);
  };

  const onCellBlur = (memberId: number, date: string) => {
    // Flush any pending debounce immediately.
    const key = `${memberId}::${date}`;
    if (debounceTimers.current[key]) {
      clearTimeout(debounceTimers.current[key]);
      delete debounceTimers.current[key];
      const value = cellValue(memberId, date);
      saveCell.mutate({ memberId, date, value });
    }
  };

  const lastUpdated = useMemo(() => {
    if (!dataUpdatedAt) return "";
    const d = new Date(dataUpdatedAt);
    return d.toLocaleTimeString();
  }, [dataUpdatedAt]);

  // Header line: "মেস দিন: ৩২" — count of days since chart start.
  const messDay = messDayIndex(today, view?.chart.start_date ?? "");

  if (isLoading) {
    return (
      <div className="card flex items-center gap-2 text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading chart...
      </div>
    );
  }

  if (error || !view) {
    return (
      <div className="card border-rose-200 bg-rose-50 text-rose-700">
        Failed to load chart: {extractError(error)}
      </div>
    );
  }

  const startLabel = banglaDateLabel(view.chart.start_date);
  const endLabel = banglaDateLabel(view.chart.end_date);

  return (
    <div className="card overflow-x-auto">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">
            {view.chart.title}
          </h2>
          <p className="text-xs text-slate-500">
            {startLabel.day} {startLabel.month} {startLabel.year}
            {" → "}
            {endLabel.day} {endLabel.month} {endLabel.year}
            {" | "}
            {isFetching ? "syncing..." : `live (updated ${lastUpdated})`}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Edit unlocked cells — values auto-save. Past days lock at midnight. Admins can edit locked cells.
          </p>
          <p className="mt-1 text-[11px] font-medium text-brand-700 sm:hidden">
            Swipe sideways to see all members — the date stays fixed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {messDay > 0 && (
            <span className="rounded-md bg-slate-800 px-3 py-1 text-xs font-semibold text-white">
              মেস দিন: {toBanglaNumber(messDay)}
            </span>
          )}
          <button
            type="button"
            onClick={handleDownloadChart}
            disabled={downloading}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            title="Download this meal chart as Excel"
          >
            {downloading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-3 w-3" />
            )}
            {downloading ? "Downloading..." : "Download chart"}
          </button>
          {savedNotice && (
            <span className="rounded-md bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
              {savedNotice}
            </span>
          )}
          {cellError && (
            <span className="rounded-md bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700">
              {cellError}
            </span>
          )}
          {downloadError && (
            <span className="rounded-md bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700">
              {downloadError}
            </span>
          )}
        </div>
      </div>

      <table className="matrix matrix-days">
        <thead>
          <tr>
            <th className="text-left">তারিখ</th>
            {members.map((m) => (
              <th key={m.id} className="text-center" title={m.name}>
                <span className="block max-w-[5rem] truncate sm:max-w-none sm:whitespace-normal">
                  {m.name}
                </span>
              </th>
            ))}
            <th className="text-center">মোট</th>
            {isAdmin && <th className="text-center">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {dates.map((d) => {
            const locked = lockedSet.has(d);
            const past = d < today;
            const isToday = d === today;
            const total = totalsByDate[d] ?? 0;
            return (
              <tr key={d}>
                <td
                  className={clsx(
                    "text-left",
                    locked && "locked",
                    !locked && past && "past",
                    !locked && isToday && "today"
                  )}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-800">
                      {banglaDateLabel(d).day} {banglaDateLabel(d).month}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {banglaDateLabel(d).year}
                      {isToday && (
                        <span className="ml-1 rounded bg-amber-200 px-1 text-[10px] font-semibold text-amber-900">
                          আজ
                        </span>
                      )}
                    </span>
                  </div>
                </td>
                {members.map((m) => (
                  <td
                    key={m.id}
                    className={clsx(
                      locked && "locked",
                      !locked && past && "past",
                      !locked && isToday && "today"
                    )}
                  >
                    <input
                      type="number"
                      step="0.5"
                      min={0}
                      max={10}
                      inputMode="decimal"
                      disabled={locked && !isAdmin}
                      readOnly={locked && !isAdmin}
                      value={cellValue(m.id, d)}
                      onChange={(e) => onCellChange(m.id, d, e.target.value)}
                      onBlur={() => onCellBlur(m.id, d)}
                      placeholder="0"
                      title={locked && isAdmin ? "Admin override: lock is bypassed for editing" : undefined}
                    />
                  </td>
                ))}
                <td className="text-center font-mono font-semibold text-slate-800">
                  {Number(total).toFixed(1)}
                </td>
                {isAdmin && (
                  <td className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      {locked ? (
                        <button
                          title={`Unlock ${d}`}
                          onClick={() => unlockMut.mutate(d)}
                          className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                        >
                          <Unlock className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          title={`Lock ${d}`}
                          onClick={() => lockMut.mutate(d)}
                          className="rounded p-1 text-amber-600 hover:bg-amber-50"
                        >
                          <Lock className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="text-left font-semibold">Per-member total</td>
            {members.map((m) => {
              const t = view.totals_by_member?.[String(m.id)] ?? 0;
              return (
                <td key={m.id} className="text-center font-mono font-semibold">
                  {Number(t).toFixed(1)}
                </td>
              );
            })}
            <td className="text-center font-mono font-semibold">
              {toBanglaNumber(
                members.reduce(
                  (acc, m) => acc + (view.totals_by_member?.[String(m.id)] ?? 0),
                  0
                ).toFixed(1)
              )}
            </td>
            {isAdmin && <td></td>}
          </tr>
        </tfoot>
      </table>

      {lockMut.error && (
        <p className="mt-3 text-sm text-rose-600">
          Lock failed: {extractError(lockMut.error)}
        </p>
      )}
    </div>
  );
}
