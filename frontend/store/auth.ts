"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MessRef } from "@/lib/api";

export type { MessRef } from "@/lib/api";

export interface User {
  id: number;
  username: string;
  full_name?: string | null;
  role?: string;
}

export interface MessSession {
  token: string;
  display_name: string;
  role?: "admin" | "member";
}

interface AuthState {
  token: string | null;
  user: User | null;
  messes: MessRef[];
  currentMessId: number | null;
  messSessions: Record<number, MessSession>;
  setAuth: (token: string, user: User) => void;
  setMesses: (messes: MessRef[]) => void;
  setCurrentMess: (id: number | null) => void;
  setMessSession: (messId: number, session: MessSession) => void;
  clearMessSession: (messId: number) => void;
  removeMess: (messId: number) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      messes: [],
      currentMessId: null,
      messSessions: {},
      setAuth: (token, user) => {
        localStorage.setItem("token", token);
        localStorage.setItem("user", JSON.stringify(user));
        set({ token, user });
      },
      setMesses: (messes) => {
        localStorage.setItem("messes", JSON.stringify(messes));
        set({ messes });
      },
      setCurrentMess: (id) => {
        if (id === null) localStorage.removeItem("currentMessId");
        else localStorage.setItem("currentMessId", String(id));
        set({ currentMessId: id });
        // Mirror the guest token into the auth-override sessionStorage slot
        // so the Axios interceptor sends the right token for this mess.
        if (typeof window !== "undefined") {
          if (id === null) {
            sessionStorage.removeItem("auth-override");
          } else {
            const sess = get().messSessions[id];
            if (sess) {
              sessionStorage.setItem(
                "auth-override",
                JSON.stringify({ token: sess.token })
              );
            } else {
              sessionStorage.removeItem("auth-override");
            }
          }
        }
      },
      setMessSession: (messId, session) => {
        const next = { ...get().messSessions, [messId]: session };
        localStorage.setItem("mess-sessions", JSON.stringify(next));
        set({ messSessions: next });
        if (typeof window !== "undefined" && get().currentMessId === messId) {
          sessionStorage.setItem(
            "auth-override",
            JSON.stringify({ token: session.token })
          );
        }
      },
      clearMessSession: (messId) => {
        const next = { ...get().messSessions };
        delete next[messId];
        localStorage.setItem("mess-sessions", JSON.stringify(next));
        set({ messSessions: next });
        if (typeof window !== "undefined" && get().currentMessId === messId) {
          sessionStorage.removeItem("auth-override");
        }
      },
      removeMess: (messId) => {
        const next = get().messes.filter((m) => m.id !== messId);
        localStorage.setItem("messes", JSON.stringify(next));
        if (get().currentMessId === messId) {
          localStorage.removeItem("currentMessId");
        }
        set({ messes: next, currentMessId: get().currentMessId === messId ? null : get().currentMessId });
      },
      logout: () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("messes");
        localStorage.removeItem("currentMessId");
        localStorage.removeItem("mess-sessions");
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("auth-override");
        }
        set({
          token: null,
          user: null,
          messes: [],
          currentMessId: null,
          messSessions: {},
        });
      },
    }),
    {
      name: "auth-storage",
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        try {
          const raw = localStorage.getItem("messes");
          if (raw) state.setMesses(JSON.parse(raw));
        } catch {}
        try {
          const id = localStorage.getItem("currentMessId");
          if (id) state.setCurrentMess(Number(id));
        } catch {}
        try {
          const raw = localStorage.getItem("mess-sessions");
          if (raw) {
            const map = JSON.parse(raw) as Record<number, MessSession>;
            Object.entries(map).forEach(([k, v]) =>
              state.setMessSession(Number(k), v)
            );
          }
        } catch {}
      },
    }
  )
);

export function getCurrentRole(messes: MessRef[], messId: number | null): "admin" | "member" | null {
  if (messId === null) return null;
  return messes.find((m) => m.id === messId)?.my_role ?? null;
}