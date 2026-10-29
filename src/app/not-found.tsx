import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#08090a] text-zinc-100 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 text-purple-400 font-bold text-2xl shadow-xl shadow-purple-500/10 mb-6">
          404
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
          Page not found
        </h1>
        <p className="text-sm text-zinc-400 mb-8 leading-relaxed">
          The document or page you are looking for has moved, expired, or does not exist in the Noctra darkness.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-sm transition-all shadow-lg shadow-purple-600/20 text-center"
          >
            Back to Home
          </Link>
          <Link
            href="/dashboard"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-medium text-sm transition-all text-center"
          >
            View Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
