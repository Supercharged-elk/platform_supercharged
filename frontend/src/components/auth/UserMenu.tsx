"use client";
import { useState } from "react";
import { useAuthStore } from "@/store/auth";
import { LogOut, Zap, Edit2, Video } from "lucide-react";

export function UserMenu() {
  const { user, credits, isAnonymous, signInWithGoogle, signInWithGitHub, signOut } = useAuthStore();
  const [authError, setAuthError] = useState<string | null>(null);

  const googleEnabled = process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true";
  const githubEnabled = process.env.NEXT_PUBLIC_AUTH_GITHUB_ENABLED === "true";

  const startGoogleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch {
      setAuthError("Google auth is not enabled");
    }
  };

  const startGithubSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithGitHub();
    } catch {
      setAuthError("GitHub auth is not enabled");
    }
  };

  if (!user) return null;

  return (
    <div className="flex items-center gap-3">
      {/* Créditos */}
      {credits && (
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <span className="flex items-center gap-1" title="Generate credits">
            <Zap size={12} className="text-yellow-400" />
            <span className={credits.generate_credits <= 2 ? "text-amber-400 font-semibold" : ""}>{credits.generate_credits}</span>
            <span className="text-neutral-600">gen</span>
          </span>
          <span className="flex items-center gap-1" title="Edit credits">
            <Edit2 size={12} className="text-blue-400" />
            <span className={credits.edit_credits <= 1 ? "text-amber-400 font-semibold" : ""}>{credits.edit_credits}</span>
            <span className="text-neutral-600">edit</span>
          </span>
          <span className="flex items-center gap-1" title="Animate credits">
            <Video size={12} className="text-purple-400" />
            <span className={credits.animate_credits === 0 ? "text-red-400 font-semibold" : ""}>{credits.animate_credits}</span>
            <span className="text-neutral-600">anim</span>
          </span>
        </div>
      )}

      {/* Banner upgrade para anónimos */}
      {isAnonymous ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-600 hidden sm:block">Sign in to generate & save</span>
          {googleEnabled && (
            <button
              onClick={startGoogleSignIn}
              className="px-3 py-1 text-xs bg-white text-black rounded-full font-medium hover:bg-neutral-200 transition"
            >
              Sign in with Google
            </button>
          )}
          {githubEnabled && (
            <button
              onClick={startGithubSignIn}
              className="px-3 py-1 text-xs bg-neutral-800 text-neutral-200 rounded-full font-medium hover:bg-neutral-700 transition"
            >
              GitHub
            </button>
          )}
          {!googleEnabled && !githubEnabled && (
            <span className="text-xs text-neutral-600">Social login disabled</span>
          )}
          {authError && (
            <span className="text-xs text-red-400">{authError}</span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {user.user_metadata?.avatar_url && (
            <img
              src={user.user_metadata.avatar_url}
              alt="avatar"
              className="w-6 h-6 rounded-full"
            />
          )}
          <span className="text-xs text-neutral-400">
            {user.user_metadata?.name || user.email}
          </span>
          <button
            onClick={signOut}
            className="text-neutral-600 hover:text-neutral-300 transition"
          >
            <LogOut size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
