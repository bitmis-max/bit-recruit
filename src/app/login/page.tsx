"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../hooks/useAuth";
import { LoginGate } from "../../components/auth/LoginGate";
import { SetupGuide } from "../../components/auth/SetupGuide";

export default function LoginPage() {
  const { session, loading, supabaseConfigured, handleLogin, lastError, setLastError } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "oauth") {
      setLastError("Đăng nhập Google chưa thành công. Vui lòng thử lại.");
    }
  }, [setLastError]);

  useEffect(() => {
    if (!loading && session) {
      // Clear URL parameters to hide sensitive tokens
      const requestedNext = new URLSearchParams(window.location.search).get("next");
      const destination = requestedNext?.startsWith("/admin") && !requestedNext.startsWith("//") ? requestedNext : "/admin";
      window.history.replaceState({}, document.title, destination);
      router.replace(destination);
    }
  }, [session, loading, router]);

  if (!supabaseConfigured) {
    return <SetupGuide />;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Đang tải...</p>
        </div>
      </div>
    );
  }

  return <LoginGate onLogin={handleLogin} lastError={lastError} />;
}
