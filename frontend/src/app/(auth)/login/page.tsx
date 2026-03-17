"use client";
import { Suspense } from "react";
import { useAuthStore } from "@/store/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

function LoginPageContent() {
  const { session, loading, init, isAnonymous, signInWithGoogle, signInWithGitHub, signInAnonymously } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/studio";

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!loading && session && !isAnonymous) router.replace(redirect);
  }, [session, loading, isAnonymous, router, redirect]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-950">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-10 w-full max-w-sm flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-1">Canvas Platform</h1>
          <p className="text-sm text-neutral-500">AI-powered visual generation</p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => signInWithGoogle(redirect)}
            className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-white text-black rounded-xl font-medium text-sm hover:bg-neutral-100 transition"
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
              <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.01c-.72.49-1.63.78-2.7.78-2.08 0-3.84-1.4-4.47-3.29H1.83v2.07A8 8 0 0 0 8.98 17z"/>
              <path fill="#FBBC05" d="M4.51 10.54A4.8 4.8 0 0 1 4.26 9c0-.53.09-1.04.25-1.54V5.39H1.83A8 8 0 0 0 .98 9c0 1.29.31 2.51.85 3.61l2.68-2.07z"/>
              <path fill="#EA4335" d="M8.98 3.58c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.47c.63-1.89 2.4-3.89 4.48-3.89z"/>
            </svg>
            Continue with Google
          </button>

          <button
            onClick={() => signInWithGitHub(redirect)}
            className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-neutral-800 text-white rounded-xl font-medium text-sm hover:bg-neutral-700 transition border border-neutral-700"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.49.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0 1 12 6.8c.85.004 1.71.11 2.51.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10.01 10.01 0 0 0 22 12c0-5.52-4.48-10-10-10z"/>
            </svg>
            Continue with GitHub
          </button>

          <div className="relative flex items-center gap-3">
            <div className="flex-1 h-px bg-neutral-800" />
            <span className="text-xs text-neutral-600">or</span>
            <div className="flex-1 h-px bg-neutral-800" />
          </div>

          <button
            onClick={signInAnonymously}
            className="w-full px-4 py-3 text-neutral-400 rounded-xl text-sm hover:bg-neutral-800 transition border border-neutral-800"
          >
            Continue as Guest
          </button>
        </div>

        <p className="text-xs text-neutral-600 text-center">
          Guest accounts have limited trial credits
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-neutral-950" />}>
      <LoginPageContent />
    </Suspense>
  );
}
