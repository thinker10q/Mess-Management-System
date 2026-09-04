"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChefHat, ArrowLeft, LogOut, KeySquare, Menu, X } from "lucide-react";
import clsx from "clsx";
import { useQueryClient } from "@tanstack/react-query";
import { listAllMesses, type MessSummary } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const currentMessId = useAuthStore((s) => s.currentMessId);
  const messSessions = useAuthStore((s) => s.messSessions);
  const clearMessSession = useAuthStore((s) => s.clearMessSession);

  const inMess = pathname?.startsWith("/mess/") && currentMessId != null;
  const session = currentMessId != null ? messSessions[currentMessId] : undefined;
  const messes = qc.getQueryData<MessSummary[]>(["all-messes"]) ?? [];
  const mess = messes.find((m) => m.id === currentMessId);
  const role = session?.role ?? null;

  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handler = () => {
      if (window.innerWidth >= 768) setMenuOpen(false);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const leaveMess = () => {
    if (currentMessId == null) return;
    clearMessSession(currentMessId);
    setMenuOpen(false);
    router.push("/");
  };

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {inMess && (
            <Link
              href="/"
              className="rounded-md p-2 hover:bg-slate-100"
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          )}
          <Link
            href={inMess && currentMessId ? `/mess/${currentMessId}` : "/"}
            className="flex min-w-0 items-center gap-2 font-semibold text-slate-800"
          >
            <ChefHat className="h-5 w-5 shrink-0 text-brand-600" />
            <span className="truncate">{mess ? mess.name : "Mess Manager"}</span>
          </Link>
          {session && (
            <span
              className={clsx(
                "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                role === "admin"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-slate-100 text-slate-700"
              )}
            >
              {role === "admin" ? "admin" : "member"}
            </span>
          )}
        </div>

        <div className="hidden items-center gap-1 md:flex">
          {inMess && currentMessId && (
            <NavLinks
              currentMessId={currentMessId}
              role={role}
              pathname={pathname}
            />
          )}
          {session && (
            <span className="ml-2 hidden items-center gap-1 text-sm text-slate-600 sm:inline-flex">
              <KeySquare className="h-3 w-3" />
              {session.display_name}
            </span>
          )}
          {inMess && session && (
            <button
              onClick={leaveMess}
              className="ml-2 flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Leave</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded-md p-2 hover:bg-slate-100 md:hidden"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {menuOpen && (
        <div className="border-t border-slate-200 bg-white md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3">
            {inMess && currentMessId && (
              <NavLinks
                currentMessId={currentMessId}
                role={role}
                pathname={pathname}
                onNavigate={() => setMenuOpen(false)}
                vertical
              />
            )}
            {session && (
              <span className="flex items-center gap-1 px-3 py-2 text-sm text-slate-600">
                <KeySquare className="h-3 w-3" />
                {session.display_name}
              </span>
            )}
            {inMess && session && (
              <button
                onClick={leaveMess}
                className="mt-2 flex items-center justify-center gap-1 rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
              >
                <LogOut className="h-4 w-4" /> Leave mess
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function NavLinks({
  currentMessId,
  role,
  pathname,
  onNavigate,
  vertical = false,
}: {
  currentMessId: number;
  role: string | null;
  pathname: string | null;
  onNavigate?: () => void;
  vertical?: boolean;
}) {
  const base = vertical
    ? "rounded-md px-3 py-2 text-sm hover:bg-slate-100"
    : "rounded-md px-3 py-1.5 text-sm hover:bg-slate-100";

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname?.startsWith(href));

  const cls = (href: string) =>
    clsx(
      base,
      isActive(href) && "bg-slate-100 font-semibold text-slate-900"
    );

  return (
    <>
      <Link
        href={`/mess/${currentMessId}`}
        onClick={onNavigate}
        className={cls(`/mess/${currentMessId}`)}
      >
        Dashboard
      </Link>
      <Link
        href={`/mess/${currentMessId}/bazar`}
        onClick={onNavigate}
        className={cls(`/mess/${currentMessId}/bazar`)}
      >
        Bazar
      </Link>
      <Link
        href={`/mess/${currentMessId}/members`}
        onClick={onNavigate}
        className={cls(`/mess/${currentMessId}/members`)}
      >
        Members
      </Link>
      <Link
        href={`/mess/${currentMessId}/calculator`}
        onClick={onNavigate}
        className={cls(`/mess/${currentMessId}/calculator`)}
      >
        Calculator
      </Link>
      {role === "admin" && (
        <Link
          href={`/mess/${currentMessId}/admin`}
          onClick={onNavigate}
          className={cls(`/mess/${currentMessId}/admin`)}
        >
          Admin
        </Link>
      )}
    </>
  );
}
