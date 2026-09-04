"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChefHat,
  Users,
  Calendar,
  Loader2,
  X,
  ArrowLeft,
  Plus,
} from "lucide-react";
import { listAllMesses, type MessSummary } from "@/lib/api";
import { CreateMessCard } from "@/components/CreateMessCard";
import { EnterMessCard } from "@/components/EnterMessCard";
import { AdminSignInCard } from "@/components/AdminSignInCard";

export default function HomePage() {
  const [filter, setFilter] = useState("");
  const [selectedMess, setSelectedMess] = useState<MessSummary | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const messesQuery = useQuery({
    queryKey: ["all-messes"],
    queryFn: () => listAllMesses(),
    refetchOnWindowFocus: true,
  });

  const allMesses: MessSummary[] = messesQuery.data ?? [];
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return allMesses;
    // NOTE: never search by code — the code is secret and must not show.
    return allMesses.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.manager_name ?? "").toLowerCase().includes(q)
    );
  }, [allMesses, filter]);

  const selectMess = (m: MessSummary) => {
    setSelectedMess(m);
    setShowCreate(false);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const closeSelected = () => setSelectedMess(null);
  const toggleCreate = () => {
    setSelectedMess(null);
    setShowCreate((v) => !v);
  };

  return (
    <div className="space-y-6">
      {/* ---------- Header card ---------- */}
      <div className="card flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-[240px]">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ChefHat className="h-5 w-5 text-brand-600" />
            All Messes
          </h1>
          <p className="text-sm text-slate-600">
            Browse messes or join one with a code. No registration needed to
            enter as a member.
          </p>
          <div className="mt-4 max-w-md">
            <input
              className="input"
              placeholder="Search by name or manager..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        </div>
        {/* Corner "Create a mess" button */}
        <button
          type="button"
          onClick={toggleCreate}
          className="btn-primary shrink-0 self-start"
        >
          <Plus className="h-4 w-4" />
          {showCreate ? "Close" : "Create a mess"}
        </button>
      </div>

      {messesQuery.isLoading && (
        <div className="card flex items-center gap-2 text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading messes...
        </div>
      )}

      {messesQuery.isError && (
        <div className="card border border-rose-200 bg-rose-50 text-sm text-rose-700">
          Could not load messes. Is the backend reachable at the configured API URL?
        </div>
      )}

      {!messesQuery.isLoading && allMesses.length === 0 && (
        <div className="card text-sm text-slate-600">
          No messes exist yet. Be the first to{" "}
          <button
            type="button"
            className="text-brand-600 underline"
            onClick={() => setShowCreate(true)}
          >
            create one
          </button>
          .
        </div>
      )}

      {filtered.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Available messes
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((m) => (
              <MessTile
                key={m.id}
                mess={m}
                selected={selectedMess?.id === m.id}
                onClick={() => selectMess(m)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ---------- Selected mess panel: Admin sign-in + Enter mess ---------- */}
      {selectedMess && (
        <section className="space-y-3" data-testid="selected-mess-panel">
          <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={closeSelected}
                  className="btn-secondary flex items-center gap-1 text-xs"
                  type="button"
                >
                  <ArrowLeft className="h-3 w-3" /> Back
                </button>
                <h2 className="text-lg font-semibold">{selectedMess.name}</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {selectedMess.member_count} members
                </span>
              </div>
              <p className="text-sm text-slate-600">
                Manager: {selectedMess.manager_name || "—"}
              </p>
              {selectedMess.description && (
                <p className="text-xs text-slate-500">{selectedMess.description}</p>
              )}
            </div>
            <button
              onClick={closeSelected}
              className="btn-secondary flex items-center gap-1 self-start"
              type="button"
              aria-label="Close selected mess"
            >
              <X className="h-4 w-4" /> Close
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <AdminSignInCard
              lockToCode={selectedMess.code}
              lockToName={selectedMess.name}
            />
            <EnterMessCard
              lockToCode={selectedMess.code}
              lockToName={selectedMess.name}
              lockToMessId={selectedMess.id}
            />
          </div>
        </section>
      )}

      {/* ---------- Create-a-mess panel ---------- */}
      {showCreate && !selectedMess && (
        <section data-testid="create-mess-panel">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              New mess
            </h2>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              close
            </button>
          </div>
          <div className="mt-3">
            <CreateMessCard />
          </div>
        </section>
      )}
    </div>
  );
}

function MessTile({
  mess,
  selected,
  onClick,
}: {
  mess: MessSummary;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "card text-left transition hover:border-brand-300 hover:shadow-md " +
        (selected ? "border-brand-400 ring-2 ring-brand-200" : "")
      }
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{mess.name}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
          {selected ? "Selected" : "Tap to enter"}
        </span>
      </div>
      {mess.description && (
        <p className="mt-1 text-sm text-slate-600">{mess.description}</p>
      )}
      <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          <span>{mess.member_count} members</span>
        </div>
        <div className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          <span>Manager: {mess.manager_name || "—"}</span>
        </div>
      </div>
    </button>
  );
}
