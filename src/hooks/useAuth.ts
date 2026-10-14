import { useState, useEffect, useCallback, useMemo } from "react";
import { type Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "../lib/supabase/client";

export function useAuth() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const supabaseConfigured = supabase !== null;

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => supabase !== null);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleLogin = useCallback(async (email: string, password: string) => {
    if (!supabase) return;
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setLastError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Đăng nhập thất bại";
      setLastError(message);
    }
  }, [supabase]);

  const handleLogout = useCallback(async () => {
    if (!supabase) return;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setSession(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Đăng xuất thất bại";
      setLastError(message);
    }
  }, [supabase]);

  return {
    session,
    loading,
    supabaseConfigured,
    lastError,
    setLastError,
    handleLogin,
    handleLogout,
  };
}
