"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "../../lib/supabase/client";
import { friendlyError } from "../../lib/ui/friendly-error";
import { Button } from "../admin/ui/Button";

export type GmailMessage = { tone: "error" | "success"; text: string };

/** Nút kết nối Gmail. Kết quả báo qua `onMessage` để trang hiện bằng Notice. */
export function ConnectGoogleMailButton({ onMessage }: { onMessage: (message: GmailMessage | null) => void }) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("gmail_connect");
    if (!result) return;
    if (result === "success") onMessage({ tone: "success", text: "Đã kết nối Gmail. Token sẽ tự làm mới khi gửi mail." });
    else onMessage({ tone: "error", text: "Chưa lưu được quyền Gmail. Hãy thử kết nối lại." });
    params.delete("gmail_connect");
    const query = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [onMessage]);

  async function connect() {
    const supabase = getSupabaseClient();
    if (!supabase) {
      onMessage({ tone: "error", text: "Chưa cấu hình kết nối Supabase." });
      return;
    }
    setBusy(true);
    onMessage(null);
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
      onMessage({ tone: "error", text: friendlyError(authError, "Không kết nối được Google. Hãy thử lại.") });
      setBusy(false);
    }
  }

  return <Button variant="secondary" icon="mail" loading={busy} onClick={() => void connect()}>
    {busy ? "Đang kết nối Google…" : "Kết nối / làm mới quyền Gmail"}
  </Button>;
}
