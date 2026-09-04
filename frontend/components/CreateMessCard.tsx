"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import {
  createMess,
  extractError,
  type MessAdminLoginResponse,
} from "@/lib/api";
import { useAuthStore } from "@/store/auth";

export function CreateMessCard() {
  const router = useRouter();
  const qc = useQueryClient();
  const setAuth = useAuthStore((s) => s.setAuth);
  const setMesses = useAuthStore((s) => s.setMesses);
  const setMessSession = useAuthStore((s) => s.setMessSession);
  const setCurrentMess = useAuthStore((s) => s.setCurrentMess);

  const [name, setName] = useState("");
  const [managerName, setManagerName] = useState("");
  const [managerPassword, setManagerPassword] = useState("");
  const [code, setCode] = useState("");
  const [desc, setDesc] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      createMess({
        name: name.trim(),
        manager_name: managerName.trim(),
        manager_password: managerPassword,
        code: code.trim().toUpperCase(),
        description: desc.trim() || undefined,
      }),
    onSuccess: async (resp: MessAdminLoginResponse) => {
      setError(null);
      const messId = resp.mess.id;
      const displayName = managerName.trim();

      // The backend now returns the admin JWT directly. Pin it as both the
      // global admin auth and the per-mess admin session so subsequent calls
      // (chart create, member list, etc.) all succeed without a second login.
      setAuth(resp.access_token, {
        id: 0,
        username: `manager_${messId}`,
        full_name: displayName,
        role: "admin",
      });
      setMessSession(messId, {
        token: resp.access_token,
        display_name: displayName,
        role: "admin",
      });

      // Reset the form fields.
      setName("");
      setManagerName("");
      setManagerPassword("");
      setCode("");
      setDesc("");

      // Refresh the public mess listing and switch into the new mess as admin.
      try {
        const list = await qc.fetchQuery({
          queryKey: ["messes"],
          queryFn: () =>
            import("@/lib/api").then((mod) => mod.listAllMesses()),
        });
        setMesses(list as any);
      } catch {
        /* non-fatal: the user is still landing in /mess/{id}/admin */
      }
      setCurrentMess(messId);
      router.push(`/mess/${messId}/admin`);
    },
    onError: (e) => setError(extractError(e, "Could not create mess")),
  });

  const submitDisabled =
    !name.trim() ||
    !managerName.trim() ||
    managerPassword.length < 4 ||
    code.trim().length < 4 ||
    create.isPending;

  return (
    <div className="card">
      <h2 className="mb-3 text-lg font-semibold flex items-center gap-2">
        <Plus className="h-4 w-4" /> Create a mess
      </h2>
      <p className="mb-3 text-sm text-slate-600">
        Become the admin of your own mess. Pick a code your flatmates can share.
      </p>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Mess name</label>
          <input
            className="input"
            placeholder="House 12 Mess"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Manager name</label>
          <input
            className="input"
            placeholder="Sabbir"
            value={managerName}
            onChange={(e) => setManagerName(e.target.value)}
            maxLength={80}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Manager password</label>
          <input
            type="password"
            className="input"
            placeholder="at least 4 characters"
            value={managerPassword}
            onChange={(e) => setManagerPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Join code</label>
          <input
            className="input font-mono uppercase tracking-widest"
            placeholder="ALPHA1"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
            }
            maxLength={16}
          />
          <p className="mt-1 text-xs text-slate-500">
            Members just type this code to enter. Only the manager needs the
            password below.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Description (optional)
          </label>
          <input
            className="input"
            placeholder="Block A, Floor 3"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            maxLength={200}
          />
        </div>
        {error && (
          <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
        <button
          disabled={submitDisabled}
          onClick={() => create.mutate()}
          className="btn-primary w-full"
        >
          {create.isPending ? "Creating..." : "Create mess"}
        </button>
      </div>
    </div>
  );
}
