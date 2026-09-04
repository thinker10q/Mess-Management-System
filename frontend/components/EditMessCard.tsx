"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, Pencil, Save, X } from "lucide-react";
import { extractError, fetchMess, updateMess, type MessDetail } from "@/lib/api";

interface Props {
  messId: number;
}

export function EditMessCard({ messId }: Props) {
  const qc = useQueryClient();

  // Fetch the latest mess details so the form is always pre-filled with the
  // current values (name, code, manager_name, description) straight from the
  // server, not from whatever stale copy is in the auth store.
  const messQuery = useQuery({
    queryKey: ["mess", messId],
    queryFn: () => fetchMess(messId),
  });

  const mess = messQuery.data;

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [managerName, setManagerName] = useState("");
  const [description, setDescription] = useState("");
  const [managerPassword, setManagerPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // Whenever the source data changes (or we open the editor), reset the buffer.
  useEffect(() => {
    if (!mess) return;
    setName(mess.name);
    setCode(mess.code);
    setManagerName(mess.manager_name ?? "");
    setDescription(mess.description ?? "");
  }, [mess]);

  const mutation = useMutation({
    mutationFn: () => {
      const trimmedName = name.trim();
      const trimmedCode = code.trim().toUpperCase();
      const trimmedMgr = managerName.trim();
      const trimmedDesc = description.trim();

      const patch: {
        name?: string;
        code?: string;
        manager_name?: string;
        description?: string | null;
        manager_password?: string;
      } = {};

      if (mess) {
        if (trimmedName && trimmedName !== mess.name) patch.name = trimmedName;
        if (trimmedCode && trimmedCode !== mess.code) patch.code = trimmedCode;
        if (trimmedMgr && trimmedMgr !== mess.manager_name)
          patch.manager_name = trimmedMgr;
        if (trimmedDesc !== (mess.description ?? ""))
          patch.description = trimmedDesc || null;
      } else {
        if (trimmedName) patch.name = trimmedName;
        if (trimmedCode) patch.code = trimmedCode;
        if (trimmedMgr) patch.manager_name = trimmedMgr;
        patch.description = trimmedDesc || null;
      }

      if (managerPassword.trim()) patch.manager_password = managerPassword;

      if (Object.keys(patch).length === 0) {
        // Nothing to change - just close the editor.
        return Promise.resolve(mess);
      }
      return updateMess(messId, patch).then(() => undefined);
    },
    onSuccess: () => {
      setError(null);
      setOkMsg("Mess details updated.");
      setManagerPassword("");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["mess", messId] });
      qc.invalidateQueries({ queryKey: ["messes"] });
      qc.invalidateQueries({ queryKey: ["messes-all"] });
    },
    onError: (err) => {
      setError(extractError(err, "Could not update mess."));
    },
  });

  function startEdit() {
    if (mess) {
      setName(mess.name);
      setCode(mess.code);
      setManagerName(mess.manager_name ?? "");
      setDescription(mess.description ?? "");
    }
    setManagerPassword("");
    setError(null);
    setOkMsg(null);
    setEditing(true);
  }

  function cancelEdit() {
    if (mutation.isPending) return;
    setEditing(false);
    setError(null);
    setManagerPassword("");
  }

  if (messQuery.isLoading) {
    return (
      <div className="card flex items-center gap-2 text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading mess details...
      </div>
    );
  }

  if (!mess) {
    return (
      <div className="card border-rose-200 bg-rose-50 text-rose-700">
        <AlertCircle className="mr-2 inline h-4 w-4" />
        Could not load mess details.
      </div>
    );
  }

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Mess details</h3>
        {!editing && (
          <button
            type="button"
            onClick={startEdit}
            className="btn-secondary inline-flex items-center gap-1 text-sm"
          >
            <Pencil className="h-4 w-4" /> Edit
          </button>
        )}
      </div>

      {okMsg && !editing && (
        <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {okMsg}
        </div>
      )}

      {!editing && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Name</dt>
            <dd className="font-medium text-slate-800">{mess.name}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Code</dt>
            <dd className="font-mono font-medium text-slate-800">{mess.code}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Manager</dt>
            <dd className="font-medium text-slate-800">{mess.manager_name}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Description</dt>
            <dd className="text-slate-700">{mess.description || <em className="text-slate-400">none</em>}</dd>
          </div>
        </dl>
      )}

      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setOkMsg(null);
            mutation.mutate();
          }}
          className="space-y-3"
        >
          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <AlertCircle className="mr-2 inline h-4 w-4" />
              {error}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="block text-xs font-medium text-slate-600">Mess name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                required
                className="input mt-1"
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs font-medium text-slate-600">Mess code (uppercase)</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={8}
                required
                className="input mt-1 font-mono uppercase"
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs font-medium text-slate-600">Manager name</span>
              <input
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                maxLength={80}
                required
                className="input mt-1"
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs font-medium text-slate-600">
                New manager password <span className="font-normal text-slate-400">(leave blank to keep current)</span>
              </span>
              <input
                type="password"
                value={managerPassword}
                onChange={(e) => setManagerPassword(e.target.value)}
                minLength={6}
                className="input mt-1"
                placeholder="••••••"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="block text-xs font-medium text-slate-600">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={300}
              className="input mt-1"
              placeholder="What is this mess about?"
            />
          </label>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={mutation.isPending}
              className="btn-secondary inline-flex items-center justify-center gap-1 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save changes
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// Re-export so the admin page can use the same shape without an extra import.
export type { MessDetail };
