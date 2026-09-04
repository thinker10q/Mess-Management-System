"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChefHat, AlertCircle, ArrowLeft, Trash2, Loader2 } from "lucide-react";
import { useAuthStore, getCurrentRole } from "@/store/auth";
import {
  deleteChart,
  fetchActiveChart,
  fetchMess,
  listCharts,
  type ChartOut,
} from "@/lib/api";
import { extractError } from "@/lib/api";
import { CreateChartCard } from "@/components/CreateChartCard";
import { MarketEntriesCard } from "@/components/MarketEntriesCard";
import { EditMessCard } from "@/components/EditMessCard";
import { DeleteMessCard } from "@/components/DeleteMessCard";
import { QrShareCard } from "@/components/QrShareCard";

export default function MessAdminPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const messId = Number(params.id);

  const token = useAuthStore((s) => s.token);
  const messes = useAuthStore((s) => s.messes);
  const messSessions = useAuthStore((s) => s.messSessions);
  const setCurrentMess = useAuthStore((s) => s.setCurrentMess);

  const session = messSessions[messId];
  const hasSession = !!(session?.token || token);
  const roleFromSession = session?.role;
  const roleFromGlobal = getCurrentRole(messes, messId);
  const role = roleFromSession ?? roleFromGlobal;
  const mess = messes.find((m) => m.id === messId);

  useEffect(() => {
    if (!hasSession) {
      router.replace(`/enter?code=&next=${encodeURIComponent(`/mess/${messId}/admin`)}`);
      return;
    }
    if (role !== "admin") {
      router.replace(`/mess/${messId}`);
      return;
    }
    setCurrentMess(messId);
  }, [hasSession, role, messId, setCurrentMess, router]);

  const qc = useQueryClient();
  const chartsQuery = useQuery({
    queryKey: ["charts", messId],
    enabled: hasSession && role === "admin",
    queryFn: () => listCharts(messId),
  });

  const activeChartQuery = useQuery({
    queryKey: ["active-chart", messId],
    enabled: hasSession && role === "admin",
    queryFn: () => fetchActiveChart(messId),
    retry: false,
  });

  const messQuery = useQuery({
    queryKey: ["mess", messId],
    enabled: hasSession && role === "admin",
    queryFn: () => fetchMess(messId),
    retry: false,
  });

  const [pendingDelete, setPendingDelete] = useState<ChartOut | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (chartId: number) => deleteChart(messId, chartId),
    onSuccess: (_data, chartId) => {
      setDeleteError(null);
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ["charts", messId] });
      qc.invalidateQueries({ queryKey: ["active-chart", messId] });
      qc.invalidateQueries({ queryKey: ["chart-view", messId, chartId] });
      qc.invalidateQueries({ queryKey: ["meals", messId, chartId] });
      qc.invalidateQueries({ queryKey: ["markets", messId, chartId] });
      qc.invalidateQueries({ queryKey: ["report", messId, chartId] });
    },
    onError: (err) => {
      setDeleteError(extractError(err, "Could not delete chart."));
    },
  });

  if (!hasSession) return null;

  if (role !== "admin") {
    return (
      <div className="card border-rose-200 bg-rose-50 text-rose-700">
        <AlertCircle className="mr-2 inline h-4 w-4" />
        Admin only.
        <Link href={`/mess/${messId}`} className="ml-2 underline">
          back to dashboard
        </Link>
      </div>
    );
  }

  const charts: ChartOut[] = chartsQuery.data ?? [];
  const activeChart = activeChartQuery.data;
  const messDetail = messQuery.data;
  const isDeleting = deleteMutation.isPending;

  function confirmDelete(c: ChartOut) {
    setDeleteError(null);
    setPendingDelete(c);
  }

  function cancelDelete() {
    if (deleteMutation.isPending) return;
    setPendingDelete(null);
    setDeleteError(null);
  }

  function performDelete() {
    if (!pendingDelete) return;
    deleteMutation.mutate(pendingDelete.id);
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/mess/${messId}`}
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Back to dashboard
          </Link>
          <Link
            href={`/mess/${messId}/members`}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Manage members →
          </Link>
        </div>
        <h1 className="mt-2 flex flex-wrap items-center gap-2 text-2xl font-bold text-slate-800">
          <ChefHat className="h-5 w-5 text-brand-600" />
          {mess?.name ?? `Mess #${messId}`} - Admin
        </h1>
      </div>

      {deleteError && (
        <div className="card border-rose-200 bg-rose-50 text-rose-700">
          <AlertCircle className="mr-2 inline h-4 w-4" />
          {deleteError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <CreateChartCard messId={messId} />

        <QrShareCard
          messId={messId}
          messName={mess?.name ?? messDetail?.name}
          code={messDetail?.code ?? mess?.code}
          qrPath={messDetail?.qr_path}
          qrLoading={messQuery.isLoading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-3 text-lg font-semibold">Existing charts</h3>
          {chartsQuery.isLoading && (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </p>
          )}
          {!chartsQuery.isLoading && charts.length === 0 && (
            <p className="text-sm text-slate-500">No charts yet.</p>
          )}
          <ul className="space-y-2">
            {charts.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-2 rounded-md border border-slate-200 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.title}</div>
                  <div className="text-xs text-slate-500">
                    {c.start_date} -&gt; {c.end_date} ({c.members.length} members)
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <span
                    className={
                      c.status === "active"
                        ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700"
                        : "rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                    }
                  >
                    {c.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => confirmDelete(c)}
                    disabled={isDeleting}
                    className="inline-flex items-center justify-center rounded-md border border-rose-200 bg-white p-1.5 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Delete chart ${c.title}`}
                    title="Delete chart"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {activeChart && (
        <MarketEntriesCard messId={messId} chartId={activeChart.id} />
      )}

      {!activeChart && !chartsQuery.isLoading && (
        <div className="card border-amber-200 bg-amber-50 text-amber-800">
          Create a chart first to start adding market entries.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <EditMessCard messId={messId} />
        {mess && (
          <DeleteMessCard
            messId={messId}
            messName={mess.name}
            messCode={mess.code}
          />
        )}
      </div>

      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="card w-full max-w-md border-rose-200">
            <h3 className="text-lg font-semibold text-slate-800">Delete chart?</h3>
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-medium">{pendingDelete.title}</span> (
              {pendingDelete.start_date} -&gt; {pendingDelete.end_date}) will be removed
              along with its meal entries and market expenses. This cannot be undone.
            </p>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={cancelDelete}
                disabled={isDeleting}
                className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={performDelete}
                disabled={isDeleting}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Delete chart
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
