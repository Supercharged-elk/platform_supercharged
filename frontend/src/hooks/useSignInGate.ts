import { useState } from "react";
import { useAuthStore } from "@/store/auth";

/**
 * Returns whether the anonymous user has no credits and needs to sign in.
 * showGate: whether to show the SignInToGenerateModal
 * checkGate: call before any generation — returns true if blocked
 */
export function useSignInGate() {
  const { isAnonymous, credits } = useAuthStore();
  const [showGate, setShowGate] = useState(false);

  const isBlocked =
    isAnonymous &&
    (!credits ||
      (credits.generate_credits === 0 &&
        credits.edit_credits === 0 &&
        credits.animate_credits === 0));

  const checkGate = (): boolean => {
    if (isBlocked) {
      setShowGate(true);
      return true;
    }
    return false;
  };

  return { showGate, setShowGate, checkGate };
}
