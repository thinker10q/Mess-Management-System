"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import {
  addMessMember,
  extractError,
  fetchMessMembers,
  removeMessMember,
  updateMessMember,
  type MessMemberOut,
} from "@/lib/api";

interface Draft {
  display_name: string;
  phone: string;
  department: string;
  university: string;
}

function toDraft(m: MessMemberOut): Draft {
  return {
    display_name: m.display_name ?? m.full_name ?? m.username ?? "",
    phone: m.phone ?? "",
    department: m.department ?? "",
    university: m.university ?? "",
  };
}

/**
 * Members directory: every mess member with name, phone, department,
 * university. Visible to all members; admin can edit each row inline.
 */
export default function MessMembersPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const messId = Number(params.id);

  const token = useAuthStore((s) => s.token);
  const messSessions = useAuthStore((s) => s.messSessions);
  const setCurrentMess = useAuthStore((s) => s.setCurrentMess);

  const hasSession = !!(messSessions[messId]?.token || token);
  const role = messSessions[messId]?.role ?? "member";
  const isAdmin = role === "admin";

  const [filter, setFilter] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>({
    display_name: "",
    phone: "",
    department: "",
    university: "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newMember, setNewMember] = useState<Draft>({
    display_name: "",
    phone: "",
    department: "",
    university: "",
  });
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSession) {
      router.replace(`/enter?code=&next=${encodeURIComponent(`/mess/${messId}/members`)}`);
      return;
    }
    setCurrentMess(messId);
  }, [hasSession, messId, setCurrentMess, router]);

  const qc = useQueryClient();
  const membersQuery = useQuery({
    queryKey: ["mess-members", messId],
    enabled: hasSession && !!messId,
    queryFn: () => fetchMessMembers(messId),
    refetchOnWindowFocus: true,
  });

  const saveMut = useMutation({
    mutationFn: (vars: { userId: number; patch: Draft }) =>
      updateMessMember(messId, vars.userId, {
        display_name: vars.patch.display_name.trim(),
        phone: vars.patch.phone.trim() || null,
        department: vars.patch.department.trim() || null,
        university: vars.patch.university.trim() || null,
      }),
    onSuccess: () => {
      setFormError(null);
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["mess-members", messId] });
      qc.invalidateQueries({ queryKey: ["mess", messId] });
    },
    onError: (e) => setFormError(extractError(e, "Could not save member.")),
  });

  const removeMut = useMutation({
    mutationFn: (userId: number) => removeMessMember(messId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mess-members", messId] });
      qc.invalidateQueries({ queryKey: ["mess", messId] });
    },
  });

  const addMut = useMutation({
    mutationFn: (payload: Draft) =>
      addMessMember(messId, {
        display_name: payload.display_name.trim(),
        phone: payload.phone.trim() || null,
        department: payload.department.trim() || null,
        university: payload.university.trim() || null,
      }),
    onSuccess: () => {
      setAddError(null);
      setNewMember({ display_name: "", phone: "", department: "", university: "" });
      setShowAdd(false);
      qc.invalidateQueries({ queryKey: ["mess-members", messId] });
      qc.invalidateQueries({ queryKey: ["mess", messId] });
    },
    onError: (e) => setAddError(extractError(e, "Could not add member.")),
  });

  const members: MessMemberOut[] = membersQuery.data ?? [];
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      [m.display_name, m.full_name, m.username, m.phone, m.department, m.university]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q))
    );
  }, [members, filter]);

  if (!hasSession) return null;

  const startEdit = (m: MessMemberOut) => {
    setDraft(toDraft(m));
    setFormError(null);
    setEditingId(m.user_id);
  };

  const displayName = (m: MessMemberOut) =>
    m.display_name || m.full_name || m.username || `User #${m.user_id}`;

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
          <Users className="h-5 w-5 text-brand-600" /> Members
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
            {members.length}
          </span>
        </h1>
        <p className="text-sm text-slate-600">
          Member directory — name, phone, department, university.
          {isAdmin
            ? " As admin you can add members and edit every row."
            : " Only the admin can edit."}
        </p>
        <div className="mt-3 flex max-w-xl flex-col gap-2 sm:flex-row">
          <input
            className="input flex-1"
            placeholder="Search members..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setAddError(null);
                setShowAdd((v) => !v);
              }}
              className="btn-primary inline-flex shrink-0 items-center gap-1"
            >
              <Plus className="h-4 w-4" /> {showAdd ? "Close" : "Add member"}
            </button>
          )}
        </div>
      </div>

      {isAdmin && showAdd && (
        <div className="card border-brand-200">
          <h2 className="mb-3 text-lg font-semibold">Add member</h2>
          <p className="mb-3 text-sm text-slate-600">
            Fixed name set by you — the member picks this name when entering.
          </p>
          {addError && (
            <p className="mb-3 flex items-start gap-1 text-sm text-rose-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {addError}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="block text-xs font-medium text-slate-600">Name *</span>
              <input
                className="input mt-1"
                value={newMember.display_name}
                onChange={(e) =>
                  setNewMember((p) => ({ ...p, display_name: e.target.value }))
                }
                maxLength={80}
                placeholder="e.g. Rahim Uddin"
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs font-medium text-slate-600">Phone</span>
              <input
                className="input mt-1"
                value={newMember.phone}
                onChange={(e) =>
                  setNewMember((p) => ({ ...p, phone: e.target.value }))
                }
                maxLength={30}
                placeholder="01XXXXXXXXX"
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs font-medium text-slate-600">Department</span>
              <input
                className="input mt-1"
                value={newMember.department}
                onChange={(e) =>
                  setNewMember((p) => ({ ...p, department: e.target.value }))
                }
                maxLength={80}
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs font-medium text-slate-600">University</span>
              <input
                className="input mt-1"
                value={newMember.university}
                onChange={(e) =>
                  setNewMember((p) => ({ ...p, university: e.target.value }))
                }
                maxLength={120}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={addMut.isPending || !newMember.display_name.trim()}
            onClick={() => addMut.mutate(newMember)}
            className="btn-primary mt-3 inline-flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {addMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add member
          </button>
        </div>
      )}

      {membersQuery.isLoading && (
        <div className="card flex items-center gap-2 text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading members...
        </div>
      )}

      {membersQuery.isError && (
        <div className="card border border-rose-200 bg-rose-50 text-sm text-rose-700">
          Could not load members: {extractError(membersQuery.error)}
        </div>
      )}

      {!membersQuery.isLoading && !membersQuery.isError && (
        <div className="card overflow-x-auto">
          {formError && (
            <p className="mb-3 flex items-start gap-1 text-sm text-rose-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {formError}
            </p>
          )}
          {filtered.length === 0 && (
            <p className="text-sm text-slate-500">No members found.</p>
          )}
          {filtered.length > 0 && (
            <table className="sticky-first w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Phone</th>
                  <th className="px-3 py-2 text-left">Department</th>
                  <th className="px-3 py-2 text-left">University</th>
                  <th className="px-3 py-2 text-left">Role</th>
                  {isAdmin && <th className="px-3 py-2 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const editing = editingId === m.user_id;
                  return (
                    <tr key={m.user_id} className="border-b align-top">
                      <td className="px-3 py-2 font-medium">
                        {editing ? (
                          <input
                            className="input"
                            value={draft.display_name}
                            onChange={(e) =>
                              setDraft((p) => ({ ...p, display_name: e.target.value }))
                            }
                            maxLength={80}
                          />
                        ) : (
                          displayName(m)
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <input
                            className="input"
                            value={draft.phone}
                            onChange={(e) =>
                              setDraft((p) => ({ ...p, phone: e.target.value }))
                            }
                            maxLength={30}
                            placeholder="01XXXXXXXXX"
                          />
                        ) : (
                          <span className="font-mono">{m.phone || "—"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <input
                            className="input"
                            value={draft.department}
                            onChange={(e) =>
                              setDraft((p) => ({ ...p, department: e.target.value }))
                            }
                            maxLength={80}
                          />
                        ) : (
                          m.department || "—"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <input
                            className="input"
                            value={draft.university}
                            onChange={(e) =>
                              setDraft((p) => ({ ...p, university: e.target.value }))
                            }
                            maxLength={120}
                          />
                        ) : (
                          m.university || "—"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            m.role === "admin"
                              ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
                              : "rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                          }
                        >
                          {m.role}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-3 py-2 text-right">
                          {editing ? (
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                disabled={saveMut.isPending || !draft.display_name.trim()}
                                onClick={() =>
                                  saveMut.mutate({ userId: m.user_id, patch: draft })
                                }
                                className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                                title="Save"
                              >
                                {saveMut.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Save className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={saveMut.isPending}
                                onClick={() => {
                                  setEditingId(null);
                                  setFormError(null);
                                }}
                                className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                                title="Cancel"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => startEdit(m)}
                                className="rounded p-1.5 text-indigo-600 hover:bg-indigo-50"
                                title="Edit member info"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              {m.role !== "admin" && (
                                <button
                                  type="button"
                                  onClick={() => removeMut.mutate(m.user_id)}
                                  className="rounded p-1.5 text-rose-600 hover:bg-rose-50"
                                  title="Remove member"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
