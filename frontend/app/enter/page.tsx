"use client";

import { Suspense } from "react";
import { KeyRound } from "lucide-react";
import { EnterMessCard } from "@/components/EnterMessCard";

function EnterInner() {
  return (
    <div className="mx-auto max-w-md">
      <div className="mb-4 flex flex-col items-center gap-2">
        <div className="rounded-full bg-brand-50 p-3">
          <KeyRound className="h-6 w-6 text-brand-600" />
        </div>
        <h1 className="text-xl font-bold">Enter a mess</h1>
        <p className="text-center text-sm text-slate-600">
          Pick a mess on the home page, type its secret code (hidden while you
          type), and you&apos;ll be in. A wrong code will tell you.
        </p>
      </div>
      <EnterMessCard />
    </div>
  );
}

export default function EnterPage() {
  return (
    <Suspense fallback={<div className="text-slate-500">Loading...</div>}>
      <EnterInner />
    </Suspense>
  );
}