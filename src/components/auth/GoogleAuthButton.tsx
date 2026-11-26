"use client";

import { useState } from "react";
import { getSupabaseClient } from "../../lib/supabase/client";
import { safeNextPath } from "../../lib/auth/safe-next";
import { friendlyError } from "../../lib/ui/friendly-error";

export function GoogleAuthButton({ next }: { next?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function continueWithGoogle() {
    setError(null);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Hệ thống đăng nhập chưa được cấu hình.");
      return;
    }

    setLoading(true);
    const requestedNext = new URLSearchParams(window.location.search).get("next");
    const destination = safeNextPath(next ?? requestedNext);
    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", destination);
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    });
    if (authError) {
      setError(friendlyError(authError, "Không bắt đầu được đăng nhập Google. Vui lòng thử lại."));
      setLoading(false);
    }
  }

  return <div>
    <button type="button" disabled={loading} onClick={() => void continueWithGoogle()} className="flex w-full items-center justify-center gap-3 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-wait disabled:opacity-60">
      <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5">
        <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5h6.6c3.9-3.6 6.1-8.8 6.1-14.9Z" />
        <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.6-5c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2A20 20 0 0 0 24 44Z" />
        <path fill="#FBBC05" d="M12.6 27.8a12 12 0 0 1 0-7.6V15H5.8a20 20 0 0 0 0 18Z" />
        <path fill="#EA4335" d="M24 11.8c3 0 5.7 1 7.8 3.1l5.8-5.8A19.4 19.4 0 0 0 24 4 20 20 0 0 0 5.8 15l6.8 5.2c1.6-4.8 6.1-8.4 11.4-8.4Z" />
      </svg>
      {loading ? "Đang chuyển tới Google…" : "Tiếp tục với Google"}
    </button>
    {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
  </div>;
}
