import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { encryptGoogleRefreshToken } from "../../../lib/email/google-token";
import { safeNextPath } from "../../../lib/auth/safe-next";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const connectGmail = requestUrl.searchParams.get("connect_gmail") === "1";
  const requestedNext = requestUrl.searchParams.get("next");
  const next = safeNextPath(requestedNext, "/");
  const supabase = await createSupabaseServerClient();

  if (code && supabase) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session) {
      if (connectGmail) {
        const refreshToken = data.session.provider_refresh_token;
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const { data: adminMembership } = await supabase.from("club_members").select("id")
          .eq("user_id", data.session.user.id).eq("is_active", true).in("role", ["owner", "admin"]).limit(1).maybeSingle();
        if (!refreshToken || !url || !serviceKey || !process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || !adminMembership) {
          const destination = new URL(next, requestUrl.origin);
          destination.searchParams.set("gmail_connect", "failed");
          return NextResponse.redirect(destination);
        }
        const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
        const { error: saveError } = await admin.from("google_mail_tokens").upsert({
          user_id: data.session.user.id,
          encrypted_refresh_token: encryptGoogleRefreshToken(refreshToken),
          updated_at: new Date().toISOString(),
        });
        if (saveError) {
          console.error("Could not save Google mail refresh token", saveError.message);
          const destination = new URL(next, requestUrl.origin);
          destination.searchParams.set("gmail_connect", "failed");
          return NextResponse.redirect(destination);
        }
        const destination = new URL(next, requestUrl.origin);
        destination.searchParams.set("gmail_connect", "success");
        return NextResponse.redirect(destination);
      }
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=oauth", requestUrl.origin));
}
