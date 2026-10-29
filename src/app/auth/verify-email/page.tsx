"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const verified = searchParams.get("verified") === "true";

  return (
    <div className="min-h-screen bg-[#08090a] text-zinc-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link href="/" className="inline-flex items-center gap-2 group mb-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center font-bold text-white shadow-lg shadow-purple-500/20">
            N
          </div>
          <span className="text-xl font-bold tracking-tight text-white group-hover:text-purple-400 transition-colors">
            Noctra
          </span>
        </Link>
        <h2 className="text-2xl font-bold tracking-tight text-white">
          {verified ? "Email Verified" : "Verify Your Email"}
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-[#0f1115] border border-zinc-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-purple-950/60 border border-purple-800/50 flex items-center justify-center text-purple-400 mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>

          {verified ? (
            <div>
              <p className="text-sm text-zinc-300">
                Your email has been successfully verified! You can now access all Noctra features.
              </p>
              <Link
                href="/auth/login"
                className="mt-6 inline-flex items-center justify-center w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-sm transition-all shadow-lg shadow-purple-600/20"
              >
                Sign in to Dashboard
              </Link>
            </div>
          ) : (
            <div>
              <p className="text-sm text-zinc-300">
                We sent a verification link to your email address. Please click the link inside that email to activate your account.
              </p>
              <p className="text-xs text-zinc-500 mt-4">
                Did not receive the email? Check your spam folder or try signing in to request another link.
              </p>
              <Link
                href="/auth/login"
                className="mt-6 inline-flex items-center justify-center w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-sm transition-all"
              >
                Return to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#08090a] flex items-center justify-center text-zinc-400">
          Loading...
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
