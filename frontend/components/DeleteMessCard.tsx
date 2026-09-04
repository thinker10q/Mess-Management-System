"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, Trash2 } from "lucide-react";
import { deleteMess, extractError, fetchMess } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface Props {
  messId: number;
  messName: string;
  messCode: string;
}

export function DeleteMessCard({ messId, messName, messCode }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const clearMessSession = useAuthStore((s) => s.clearMessSession);
  const removeMess = useAuthStore((s) => s.removeMess);

  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => deleteMess(messId),
    onSuccess: () => {
      setError(null);
      setOpen(false);
      setConfirmText("");
      // Wipe local session for this mess and bust all related caches.
      clearMessSession(messId);
      removeMess(messId);
      qc.invalidateQueries({ queryKey: ["mess", messId] });
      qc.invalidateQueries({ queryKey: ["messes"] });
      qc.invalidateQueries({ queryKey: ["messes-all"] });
      // Send the manager back to the landing page.
      router.push("/");
    },
    onError: (err) => {
      setError(extractError(err, "Could not delete mess."));
    },
  });

  // Re-fetch the mess so we can show the user a real chart / member count
  // before they confirm (gives them one more chance to back out).
  const messDetail = useQuery({
    queryKey: ["mess", messId],
    queryFn: () => fetchMess(messId),
    enabled: open,
  });

  const expectedPhrase = messCode.toUpperCase();
  const canConfirm = confirmText.trim().toUpperCase() === expectedPhrase;

  return (
    <div className="card border-rose-200 bg-rose-50/40">
      <h3 className="text-lg font-semibold text-rose-700">Danger zone</h3>
      <p className="mt-1 text-sm text-slate-600">
        Delete the entire mess <span className="font-medium">{messName}</span> (code{" "}
        <span className="font-mono">{messCode}</span>). All members, charts, meals and
        market entries will be removed. This cannot be undone.
      </p>

      {error && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertCircle className="mr-2 inline h-4 w-4" />
          {error}
        </div>
      )}

      <div className="mt-4">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setConfirmText("");
            setOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-md border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
        >
          <Trash2 className="h-4 w-4" />
          Delete mess
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="card w-full max-w-md border-rose-200">
            <h3 className="text-lg font-semibold text-rose-700">Delete mess?</h3>
            <p className="mt-2 text-sm text-slate-600">
              This will permanently delete{" "}
              <span className="font-medium">{messName}</span> and every chart, member,
              meal, and market entry inside it.
            </p>

            {messDetail.data && (
              <p className="mt-2 text-xs text-slate-500">
                {messDetail.data.members.length} member(s) will be removed.
              </p>
            )}

            <label className="mt-4 block text-sm">
              <span className="block text-xs font-medium text-slate-600">
                Type <span className="font-mono">{expectedPhrase}</span> to confirm
              </span>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoFocus
                className="input mt-1 font-mono uppercase"
              />
            </label>

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  if (mutation.isPending) return;
                  setOpen(false);
                  setConfirmText("");
                  setError(null);
                }}
                disabled={mutation.isPending}
                className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || !canConfirm}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {mutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Delete mess
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
