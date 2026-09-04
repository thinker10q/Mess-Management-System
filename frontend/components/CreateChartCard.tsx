"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, Plus } from "lucide-react";
import { createChart, extractError, fetchMess } from "@/lib/api";

interface Props {
  messId: number;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CreateChartCard({ messId }: Props) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [membersText, setMembersText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // Auto-fill the manager's name: the mess creator is a mess member too.
  const messQuery = useQuery({
    queryKey: ["mess", messId],
    queryFn: () => fetchMess(messId),
    retry: false,
  });
  const managerName = (messQuery.data?.manager_name || "").trim();
  useEffect(() => {
    if (managerName && !membersText) setMembersText(managerName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managerName]);

  const mutation = useMutation({
    mutationFn: () => {
      const member_names = membersText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      return createChart(messId, {
        title: title.trim(),
        start_date: startDate,
        end_date: endDate,
        member_names,
      });
    },
    onSuccess: (chart) => {
      setError(null);
      setOkMsg(
        `Chart "${chart.title}" created with ${chart.members.length} members. All names are also in Members now.`
      );
      setTitle("");
      setMembersText("");
      setTimeout(() => setOkMsg(null), 4000);
      qc.invalidateQueries({ queryKey: ["charts", messId] });
      qc.invalidateQueries({ queryKey: ["active-chart", messId] });
      qc.invalidateQueries({ queryKey: ["mess-members", messId] });
      qc.invalidateQueries({ queryKey: ["mess", messId] });
    },
    onError: (err) => {
      setOkMsg(null);
      setError(extractError(err, "Failed to create chart"));
    },
  });

  return (
    <div className="card">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Plus className="h-5 w-5 text-brand-600" />
        Create new chart
      </h3>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
        className="space-y-3"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Title</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="August 2026"
            required
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Start date</label>
            <input
              type="date"
              className="input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">End date</label>
            <input
              type="date"
              className="input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Members (one per line, or comma-separated)
          </label>
          <textarea
            className="input min-h-[100px]"
            value={membersText}
            onChange={(e) => setMembersText(e.target.value)}
            placeholder={"Alice\nBob\nCharlie"}
          />
          <p className="mt-1 text-xs text-slate-500">
            Manager is filled in automatically and always kept on the chart.
            Leave empty to auto-use every mess member. Every name is also
            created in Members automatically, and any bazar update refreshes
            totals live.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {okMsg && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {okMsg}
          </div>
        )}

        <button
          type="submit"
          className="btn-primary"
          disabled={mutation.isPending || !title.trim()}
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Creating...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" /> Create chart
            </>
          )}
        </button>
      </form>
    </div>
  );
}
