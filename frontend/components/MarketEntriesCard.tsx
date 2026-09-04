"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, ShoppingCart, AlertCircle, Loader2 } from "lucide-react";
import {
  createMarket,
  deleteMarket,
  extractError,
  fetchChart,
  listMarkets,
  type MarketOut,
} from "@/lib/api";

interface Props {
  messId: number;
  chartId: number;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Mobile keyboards may emit commas or Bengali digits for decimals.
// Normalize to a plain dot-decimal string before Number().
function parseAmount(raw: string): number {
  const normalized = (raw || "")
    .trim()
    .replace(/,/g, ".")
    .replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)));
  return Number(normalized);
}

export function MarketEntriesCard({ messId, chartId }: Props) {
  const qc = useQueryClient();
  const [memberId, setMemberId] = useState<string>("");
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const chartQuery = useQuery({
    queryKey: ["chart", messId, chartId],
    queryFn: () => fetchChart(messId, chartId),
  });

  const marketsQuery = useQuery({
    queryKey: ["markets", messId, chartId],
    queryFn: () => listMarkets(messId, chartId),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  const createMut = useMutation({
    mutationFn: () => {
      if (!memberId) throw new Error("Select a member first");
      const amountNum = parseAmount(amount);
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        throw new Error("Enter an amount greater than 0");
      }
      return createMarket(messId, chartId, {
        chart_id: chartId,
        member_id: Number(memberId),
        date,
        amount: amountNum,
        description: description.trim() || undefined,
      });
    },
    onSuccess: () => {
      setAmount("");
      setDescription("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["markets", messId, chartId] });
      qc.invalidateQueries({ queryKey: ["chart-view", messId, chartId] });
      qc.invalidateQueries({ queryKey: ["report", messId, chartId] });
    },
    onError: (err) => setError(extractError(err, "Failed to add market entry")),
  });

  const deleteMut = useMutation({
    mutationFn: (marketId: number) => deleteMarket(messId, chartId, marketId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["markets", messId, chartId] });
      qc.invalidateQueries({ queryKey: ["chart-view", messId, chartId] });
      qc.invalidateQueries({ queryKey: ["report", messId, chartId] });
    },
  });

  const members = chartQuery.data?.members ?? [];
  const markets: MarketOut[] = marketsQuery.data ?? [];

  return (
    <div className="card">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <ShoppingCart className="h-5 w-5 text-brand-600" />
        Market entries
      </h3>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMut.mutate();
        }}
        className="mb-4 grid gap-2 sm:grid-cols-4"
      >
        <select
          className="input"
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          required
        >
          <option value="">Member...</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
        <input
          type="text"
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          className="input"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <input
          className="input"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          enterKeyHint="go"
          onKeyDown={(e) => {
            // Some mobile keyboards fire Enter without submitting when the
            // submit button is disabled; submit explicitly instead.
            if (e.key === "Enter") {
              e.preventDefault();
              if (!createMut.isPending) createMut.mutate();
            }
          }}
        />
        <button
          type="submit"
          className="btn-primary sm:col-span-4"
          disabled={createMut.isPending}
        >
          {createMut.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Adding...
            </>
          ) : (
            <>Add market entry</>
          )}
        </button>
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-4">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </form>

      {marketsQuery.isLoading && (
        <p className="text-sm text-slate-500">Loading markets...</p>
      )}

      {!marketsQuery.isLoading && markets.length === 0 && (
        <p className="text-sm text-slate-500">No market entries yet.</p>
      )}

      {markets.length > 0 && (
        <div className="overflow-x-auto">
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
                  <td className="px-2 py-1">{e.member_name || `Member #${e.member_id}`}</td>
                  <td className="px-2 py-1 text-right font-mono">
                    {e.amount.toFixed(2)}
                  </td>
                  <td className="px-2 py-1 text-slate-600">{e.description || "-"}</td>
                  <td className="px-2 py-1">
                    <button
                      onClick={() => deleteMut.mutate(e.id)}
                      className="rounded p-1 text-rose-600 hover:bg-rose-50"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
