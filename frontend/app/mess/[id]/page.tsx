"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ChefHat, Loader2, Plus, LogIn, ShoppingCart, Users } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { fetchActiveChart, listCharts, listAllMesses, type ChartOut, type MessSummary } from "@/lib/api";
import { LiveMatrix } from "@/components/LiveMatrix";

export default function MessDashboardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const messId = Number(params.id);

  const messSessions = useAuthStore((s) => s.messSessions);
  const currentMessId = useAuthStore((s) => s.currentMessId);
  const setCurrentMess = useAuthStore((s) => s.setCurrentMess);

  const qc = useQueryClient();

  // Try to find this mess in the cached listAllMesses data; if missing,
  // refetch it (in case the user landed here via deep link).
  const cachedAllMesses = qc.getQueryData<MessSummary[]>(["all-messes"]);
  const allMessesQuery = useQuery({
    queryKey: ["all-messes"],
    queryFn: () => listAllMesses(),
    enabled: !cachedAllMesses,
    staleTime: 30_000,
  });

  const messes: MessSummary[] =
    cachedAllMesses ?? allMessesQuery.data ?? [];
  const mess = messes.find((m) => m.id === messId);

  const session = messSessions[messId];

  useEffect(() => {
    if (currentMessId !== messId) setCurrentMess(messId);
  }, [currentMessId, messId, setCurrentMess]);

  const chartsQuery = useQuery({
    queryKey: ["charts", messId],
    enabled: !!session && !!messId,
    queryFn: () => listCharts(messId),
    refetchOnWindowFocus: true,
  });

  const activeChartQuery = useQuery({
    queryKey: ["active-chart", messId],
    enabled: !!session && !!messId,
    queryFn: () => fetchActiveChart(messId),
    retry: false,
  });

  const [selectedChartId, setSelectedChartId] = useState<number | null>(null);

  const charts: ChartOut[] = chartsQuery.data ?? [];
  const selectedChart = useMemo(() => {
    if (selectedChartId) {
      return charts.find((c) => c.id === selectedChartId) || null;
    }
    return activeChartQuery.data ?? charts.find((c) => c.status === "active") ?? charts[0] ?? null;
  }, [selectedChartId, charts, activeChartQuery.data]);

  if (!session) {
    return (
      <div className="card">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <ChefHat className="h-5 w-5 text-brand-600" />
          {mess ? mess.name : `Mess #${messId}`}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          You haven&apos;t entered this mess yet. Select this mess on the home
          page and type its secret code to get a session. The code stays hidden
          while you type, and a wrong code will tell you.
        </p>
        <div className="mt-4 flex gap-2">
          <Link href="/" className="btn-primary">
            <LogIn className="h-4 w-4" /> Select mess &amp; enter code
          </Link>
          <Link href="/" className="btn-secondary">
            Back to all messes
          </Link>
        </div>
      </div>
    );
  }

  const role = session.role ?? "member";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
            <ChefHat className="h-5 w-5 text-brand-600" />
            {mess?.name ?? `Mess #${messId}`}
          </h1>
          <p className="text-sm text-slate-600">
            Signed in as <span className="font-semibold">{session.display_name}</span> · Role:{" "}
            <span className="font-semibold">{role}</span>
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
          {charts.length > 0 && (
            <select
              className="input w-full lg:w-auto"
              value={selectedChart?.id ?? ""}
              onChange={(e) => setSelectedChartId(Number(e.target.value))}
            >
              {charts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.start_date} → {c.end_date}) {c.status === "active" ? "•" : ""}
                </option>
              ))}
            </select>
          )}
          {role === "admin" && (
            <Link href={`/mess/${messId}/admin`} className="btn-primary">
              <Plus className="h-4 w-4" /> Chart / Market
            </Link>
          )}
          <Link href={`/mess/${messId}/calculator`} className="btn-secondary">
            Calculator
          </Link>
          <Link href={`/mess/${messId}/bazar`} className="btn-secondary">
            <ShoppingCart className="h-4 w-4" /> Bazar
          </Link>
          <Link href={`/mess/${messId}/members`} className="btn-secondary">
            <Users className="h-4 w-4" /> Members
          </Link>
        </div>
      </div>

      {chartsQuery.isLoading && (
        <div className="card flex items-center gap-2 text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading charts...
        </div>
      )}

      {!chartsQuery.isLoading && charts.length === 0 && (
        <div className="card">
          <p className="text-slate-700">No charts yet for this mess.</p>
          {role === "admin" ? (
            <Link href={`/mess/${messId}/admin`} className="mt-3 inline-block btn-primary">
              Create a chart
            </Link>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              Ask an admin to create a chart to start tracking meals.
            </p>
          )}
        </div>
      )}

      {selectedChart && (
        <LiveMatrix
          messId={messId}
          chartId={selectedChart.id}
          isAdmin={role === "admin"}
        />
      )}
    </div>
  );
}
