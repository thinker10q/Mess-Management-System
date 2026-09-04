export function Footer() {
  return (
    <footer className="mt-10 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-4 text-center text-sm text-slate-500">
        Developed by{" "}
        <a
          href="https://meheerali.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-slate-700 underline decoration-slate-300 underline-offset-2 transition hover:text-slate-900 hover:decoration-slate-700"
        >
          Whitewolf
        </a>
      </div>
    </footer>
  );
}