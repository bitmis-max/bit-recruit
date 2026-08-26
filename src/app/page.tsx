"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MailMergeApp } from "../components/MailMergeApp";
import { useAuth } from "../hooks/useAuth";
import { SetupGuide } from "../components/auth/SetupGuide";

export default function Home() {
  const { session, loading, supabaseConfigured } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && supabaseConfigured && !session) {
      router.push("/login");
    }
  }, [session, loading, supabaseConfigured, router]);

  if (!supabaseConfigured) {
    return <SetupGuide />;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Đang kiểm tra thông tin đăng nhập...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return <MailMergeApp />;
}
