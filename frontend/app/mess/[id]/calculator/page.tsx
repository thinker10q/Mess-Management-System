"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Calculator,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  TrendingUp,
  Utensils,
  Wallet,
} from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useAuthStore } from "@/store/auth";
import {
  fetchActiveChart,
  fetchReport,
  downloadReportExcel,
  downloadChartExcel,
  extractError,
  type ChartOut,
} from "@/lib/api";

export default function MessCalculatorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const messId = Number(params.id);

  const token = useAuthStore((s) => s.token);
  const messes = useAuthStore((s) => s.messes);
  const messSessions = useAuthStore((s) => s.messSessions);
  const setCurrentMess = useAuthStore((s) => s.setCurrentMess);
  const mess = messes.find((m) => m.id === messId);

  const hasSession = !!(messSessions[messId]?.token || token);

  useEffect(() => {
    if (!hasSession) {
      router.replace(`/enter?code=&next=${encodeURIComponent(`/mess/${messId}/calculator`)}`);
      return;
    }
    setCurrentMess(messId);
  }, [hasSession, messId, setCurrentMess, router]);

  const activeChartQuery = useQuery({
    queryKey: ["active-chart", messId],
    enabled: hasSession && !!messId,
    queryFn: () => fetchActiveChart(messId),
    retry: false,
  });

  const chart: ChartOut | undefined = activeChartQuery.data;

  const reportQuery = useQuery({
    queryKey: ["report", messId, chart?.id],
    enabled: !!chart,
    queryFn: () => fetchReport(messId, chart!.id),
    // Live totals: a bazar update by anyone refreshes balances automatically.
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  if (!hasSession) return null;

  if (activeChartQuery.isLoading) {
    return (
      <div className="card flex items-center gap-2 text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading chart...
      </div>
    );
  }

  if (!chart) {
    return (
      <div className="card border-amber-200 bg-amber-50 text-amber-800">
        <AlertCircle className="mr-2 inline h-4 w-4" />
        No active chart. Ask an admin to create one.
        <Link href={`/mess/${messId}`} className="ml-2 underline">
          back to dashboard
        </Link>
      </div>
    );
  }

  const report = reportQuery.data;

  const reportRef = useRef<HTMLDivElement | null>(null);
  const [isExporting, setIsExporting] = useState<null | "pdf" | "png" | "excel" | "chart">(null);
  const [excelError, setExcelError] = useState<string | null>(null);

  const safeFileBase = useMemo(() => {
    const slug =
      (mess?.name ?? `mess-${messId}`).toString().trim().replace(/[^a-z0-9-_]+/gi, "_") ||
      `mess-${messId}`;
    const period = `${chart.start_date}_to_${chart.end_date}`.replace(/[^a-z0-9-_]/gi, "_");
    return `${slug}_report_${period}`;
  }, [mess?.name, messId, chart.start_date, chart.end_date]);

  async function captureReportNode(): Promise<HTMLCanvasElement | null> {
    const node = reportRef.current;
    if (!node) return null;
    return await html2canvas(node, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      logging: false,
    });
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function handleDownloadPng() {
    if (!report || isExporting) return;
    setIsExporting("png");
    try {
      const canvas = await captureReportNode();
      if (!canvas) return;
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png")
      );
      if (blob) triggerDownload(blob, `${safeFileBase}.png`);
    } finally {
      setIsExporting(null);
    }
  }

  async function handleDownloadPdf() {
    if (!report || isExporting) return;
    setIsExporting("pdf");
    try {
      const canvas = await captureReportNode();
      if (!canvas) return;
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? "landscape" : "portrait",
        unit: "pt",
        format: "a4",
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 16;
      const availableWidth = pageWidth - margin * 2;
      const availableHeight = pageHeight - margin * 2;
      const ratio = canvas.width / canvas.height;
      let renderWidth = availableWidth;
      let renderHeight = renderWidth / ratio;
      if (renderHeight > availableHeight) {
        renderHeight = availableHeight;
        renderWidth = renderHeight * ratio;
      }
      const offsetX = (pageWidth - renderWidth) / 2;
      const offsetY = margin;
      pdf.addImage(imgData, "PNG", offsetX, offsetY, renderWidth, renderHeight);
      pdf.save(`${safeFileBase}.pdf`);
    } finally {
      setIsExporting(null);
    }
  }

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
          <Calculator className="h-5 w-5 text-brand-600" />
          {mess?.name ?? `Mess #${messId}`} - Calculator
        </h1>
        <p className="text-sm text-slate-600">
          {chart.title} ({chart.start_date} -&gt; {chart.end_date})
        </p>
      </div>

      {reportQuery.isLoading && (
        <div className="card flex items-center gap-2 text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Calculating...
        </div>
      )}

      {report && (
        <>
          <div ref={reportRef} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <SummaryCard
                icon={<Wallet className="h-5 w-5 text-brand-600" />}
                label="Total market"
                value={report.total_market.toFixed(2)}
              />
              <SummaryCard
                icon={<Utensils className="h-5 w-5 text-brand-600" />}
                label="Total meals"
                value={report.total_meals.toFixed(1)}
              />
              <SummaryCard
                icon={<TrendingUp className="h-5 w-5 text-brand-600" />}
                label="Meal rate"
                value={report.meal_rate.toFixed(2)}
              />
            </div>

            <div className="card overflow-x-auto">
              <h3 className="mb-3 text-lg font-semibold">Member balances</h3>
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-3 py-2 text-left">Member</th>
                    <th className="px-3 py-2 text-right">Meals</th>
                    <th className="px-3 py-2 text-right">Market</th>
                    <th className="px-3 py-2 text-right">Meal cost</th>
                    <th className="px-3 py-2 text-right">Net balance</th>
                  </tr>
                </thead>
                <tbody>
                  {report.balances.map((b) => (
                    <tr key={b.member_id} className="border-b">
                      <td className="px-3 py-2 font-medium">{b.name}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {b.meals.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {b.market_total.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {b.meal_cost.toFixed(2)}
                      </td>
                      <td
                        className={
                          "px-3 py-2 text-right font-mono font-semibold " +
                          (b.net_balance >= 0 ? "text-emerald-700" : "text-rose-700")
                        }
                      >
                        {b.net_balance.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExporting !== null}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isExporting === "pdf" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              Download PDF
            </button>
            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={isExporting !== null}
              className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isExporting === "png" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileImage className="h-4 w-4" />
              )}
              Download PNG
            </button>
            <button
              type="button"
              onClick={async () => {
                setExcelError(null);
                setIsExporting("excel");
                try {
                  await downloadReportExcel(messId, chart.id);
                } catch (e) {
                  setExcelError(extractError(e, "Could not download Excel"));
                } finally {
                  setIsExporting(null);
                }
              }}
              disabled={isExporting !== null}
              className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isExporting === "excel" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              Download Excel
            </button>
            <button
              type="button"
              onClick={async () => {
                setExcelError(null);
                setIsExporting("chart");
                try {
                  await downloadChartExcel(messId, chart.id);
                } catch (e) {
                  setExcelError(extractError(e, "Could not download chart"));
                } finally {
                  setIsExporting(null);
                }
              }}
              disabled={isExporting !== null}
              className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isExporting === "chart" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              Download Chart
            </button>
          </div>
          {excelError && (
            <p className="mt-2 text-sm text-rose-600">{excelError}</p>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="card flex items-center gap-3">
      <div className="rounded-full bg-brand-100 p-3">{icon}</div>
      <div>
        <div className="text-xs uppercase text-slate-500">{label}</div>
        <div className="text-xl font-bold text-slate-800">{value}</div>
      </div>
    </div>
  );
}
