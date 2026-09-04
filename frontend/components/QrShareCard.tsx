"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  Loader2,
  RefreshCw,
  Share2,
} from "lucide-react";
import { API_BASE, extractError, regenerateMessQr } from "@/lib/api";

interface Props {
  messId: number;
  messName?: string | null;
  code?: string | null;
  qrPath?: string | null;
  qrLoading?: boolean;
}

/**
 * Admin QR card: shows the mess QR (created automatically with the mess),
 * with Download (SVG), Copy join link, native Share, and Regenerate.
 */
export function QrShareCard({ messId, messName, code, qrPath, qrLoading }: Props) {
  const qc = useQueryClient();
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgBroken, setImgBroken] = useState(false);

  const qrUrl = qrPath ? `${API_BASE}${qrPath}` : null;
  const joinLink =
    typeof window !== "undefined" && code
      ? `${window.location.origin}/join?code=${encodeURIComponent(code)}`
      : "";

  const regenMut = useMutation({
    mutationFn: () => regenerateMessQr(messId),
    onSuccess: () => {
      setError(null);
      setImgBroken(false);
      qc.invalidateQueries({ queryKey: ["mess", messId] });
    },
    onError: (e) => setError(extractError(e, "Could not regenerate QR.")),
  });

  const handleDownload = async () => {
    if (!qrUrl) return;
    setError(null);
    setDownloading(true);
    try {
      const res = await fetch(qrUrl);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mess-${code ?? messId}-qr.svg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      setError(e?.message || "Could not download QR.");
    } finally {
      setDownloading(false);
    }
  };

  const handleCopy = async () => {
    if (!joinLink) return;
    try {
      await navigator.clipboard.writeText(joinLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy failed — long-press the link to copy it manually.");
    }
  };

  const handleShare = async () => {
    const text = `Join ${messName ?? "our mess"} on Mess Manager — code ${code ?? ""}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: messName ?? "Mess invite", text, url: joinLink });
      } else {
        await handleCopy();
      }
    } catch {
      /* user cancelled the share sheet — not an error */
    }
  };

  return (
    <div className="card border-emerald-200 bg-emerald-50/40">
      <h3 className="mb-3 text-lg font-semibold text-slate-800">Join QR</h3>
      <p className="mb-4 text-sm text-slate-600">
        Created automatically with this mess. Download it, print it, or share the
        join link — anyone who scans it enters instantly.
      </p>

      {qrLoading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading QR...
        </div>
      )}

      {!qrLoading && qrUrl && !imgBroken && (
        <div className="flex flex-col items-start gap-3">
          <img
            src={qrUrl}
            alt={`QR for ${messName ?? "mess"}`}
            className="h-44 w-44 rounded-lg border border-white bg-white p-2"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgBroken(true)}
          />
          <p className="break-all text-xs text-slate-500">
            Join link: <span className="font-mono">{joinLink}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="btn-secondary inline-flex items-center gap-1 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="btn-secondary inline-flex items-center gap-1 text-sm"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy link"}
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="btn-secondary inline-flex items-center gap-1 text-sm"
            >
              <Share2 className="h-4 w-4" /> Share
            </button>
            <button
              type="button"
              onClick={() => regenMut.mutate()}
              disabled={regenMut.isPending}
              title="Rebuild the QR (use after changing the code)"
              className="btn-secondary inline-flex items-center gap-1 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {regenMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Regenerate
            </button>
          </div>
        </div>
      )}

      {!qrLoading && qrUrl && imgBroken && (
        <div className="space-y-2">
          <p className="text-sm text-amber-700">
            QR image is missing on the server (it is wiped on backend redeploy).
            Tap Regenerate to rebuild it.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={qrUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary inline-flex items-center gap-1 text-sm"
            >
              Open QR link
            </a>
            <button
              type="button"
              onClick={() => regenMut.mutate()}
              disabled={regenMut.isPending}
              className="btn-primary inline-flex items-center gap-1 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {regenMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Regenerate
            </button>
          </div>
        </div>
      )}

      {!qrLoading && !qrUrl && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            QR is not available yet for this mess.
          </p>
          <button
            type="button"
            onClick={() => regenMut.mutate()}
            disabled={regenMut.isPending}
            className="btn-primary inline-flex items-center gap-1 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {regenMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Generate QR
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 flex items-start gap-1 text-sm text-rose-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
