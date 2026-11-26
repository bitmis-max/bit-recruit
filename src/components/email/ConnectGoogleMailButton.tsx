"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "../../lib/supabase/client";
import { friendlyError } from "../../lib/ui/friendly-error";

export function ConnectGoogleMailButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("gmail_connect");
    if (!result) return;
    if (result === "success") setNotice("Đã kết nối Gmail. Token sẽ tự làm mới khi gửi mail.");
    else setError("Chưa lưu được quyền Gmail. Hãy thử kết nối lại.");
    params.delete("gmail_connect");
    const query = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, []);

  async function connect() {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Chưa cấu hình kết nối Supabase.");
      return;
    }
    setBusy(true);
    setError("");
    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", `${window.location.pathname}${window.location.search}`);
    callback.searchParams.set("connect_gmail", "1");
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callback.toString(),
        scopes: "https://www.googleapis.com/auth/gmail.send",
        queryParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
      },
    });
    if (authError) {
      setError(friendlyError(authError, "Không kết nối được Google. Hãy thử lại."));
      setBusy(false);
    }
  }

  return <div className="flex flex-col items-end gap-1">
    <button type="button" onClick={() => void connect()} disabled={busy} className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50">
      {busy ? "Đang kết nối Google…" : "Kết nối / làm mới quyền Gmail"}
    </button>
    {error && <p role="alert" className="max-w-xs text-right text-xs text-rose-700">{error}</p>}
    {notice && <p role="status" className="max-w-xs text-right text-xs text-emerald-700">{notice}</p>}
  </div>;
}
