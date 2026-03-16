import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";

interface Credits {
  generate_credits: number;
  edit_credits: number;
  animate_credits: number;
}

interface AuthStore {
  session: Session | null;
  user: User | null;
  credits: Credits | null;
  loading: boolean;
  isAnonymous: boolean;

  init: () => Promise<void>;
  signInAnonymously: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithGitHub: () => Promise<void>;
  signOut: () => Promise<void>;
  fetchCredits: () => Promise<void>;
}

let authSubscriptionInitialized = false;

export const useAuthStore = create<AuthStore>((set, get) => ({
  session: null,
  user: null,
  credits: null,
  loading: true,
  isAnonymous: false,

  init: async () => {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    const user = session?.user ?? null;
    const isAnonymous = user?.is_anonymous ?? false;
    set({ session, user, loading: true, isAnonymous });

    if (session) {
      await get().fetchCredits();
      set({ loading: false });
    } else {
      await get().signInAnonymously();
    }

    if (!authSubscriptionInitialized) {
      authSubscriptionInitialized = true;
      supabase.auth.onAuthStateChange(async (_event, session) => {
        const user = session?.user ?? null;
        set({ session, user, isAnonymous: user?.is_anonymous ?? false });
        if (session) {
          await get().fetchCredits();
        } else {
          set({ credits: null });
        }
      });
    }
  },

  signInAnonymously: async () => {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (!error && data.session) {
      set({
        session: data.session,
        user: data.user,
        isAnonymous: true,
        loading: false,
      });
      await get().fetchCredits();
    } else {
      set({ loading: false });
    }
  },

  signInWithGoogle: async () => {
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) throw error;
  },

  signInWithGitHub: async () => {
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({ provider: "github", options: { redirectTo } });
    if (error) throw error;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, credits: null, isAnonymous: false });
  },

  fetchCredits: async () => {
    try {
      const credits = await api.get<Credits>("/credits");
      set({ credits });
    } catch {
      // Usuarios anónimos pueden no tener créditos aún
    }
  },
}));
