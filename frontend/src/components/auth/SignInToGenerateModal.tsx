"use client";
import { useAuthStore } from "@/store/auth";
import { Sparkles, X } from "lucide-react";

interface SignInToGenerateModalProps {
  onClose: () => void;
}

export function SignInToGenerateModal({ onClose }: SignInToGenerateModalProps) {
  const { signInWithGoogle, signInWithGitHub } = useAuthStore();

  const googleEnabled = process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true";
  const githubEnabled = process.env.NEXT_PUBLIC_AUTH_GITHUB_ENABLED === "true";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/80 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 w-[380px] shadow-2xl relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-600 hover:text-neutral-300 transition"
        >
          <X size={16} />
        </button>

        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-900/40 border border-blue-700 mb-4">
          <Sparkles size={18} className="text-blue-400" />
        </div>

        <h2 className="text-white font-semibold text-base mb-1">Sign in to generate</h2>
        <p className="text-neutral-500 text-sm mb-6">
          Your pipeline is ready. Create a free account to run it and save your work permanently.
        </p>

        <div className="flex flex-col gap-3">
          {googleEnabled && (
            <button
              type="button"
              onClick={signInWithGoogle}
              className="w-full px-4 py-2.5 bg-white hover:bg-neutral-100 text-black text-sm font-medium rounded-xl transition"
            >
              Continue with Google
            </button>
          )}
          {githubEnabled && (
            <button
              type="button"
              onClick={signInWithGitHub}
              className="w-full px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm font-medium rounded-xl transition"
            >
              Continue with GitHub
            </button>
          )}
          {!googleEnabled && !githubEnabled && (
            <p className="text-xs text-neutral-600 text-center">Social login not configured.</p>
          )}
        </div>

        <p className="text-[11px] text-neutral-600 text-center mt-4">
          Free account · No credit card required
        </p>
      </div>
    </div>
  );
}
