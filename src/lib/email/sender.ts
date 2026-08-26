import { getSupabaseClient } from "../supabase/client";

export type SendEmailPayload = {
  to: string;
  from?: string;
  subject: string;
  html: string;
  attachmentUrl?: string;
  driveId?: string;
  attachmentName?: string;
  variables?: Record<string, string>;
  recipientId?: string;
  campaignId?: string;
  providerToken?: string;
};

const DEBUG = process.env.NEXT_PUBLIC_EMAIL_DEBUG === "true";

type SendStage =
  | "validate-env"
  | "invoke-api-route"
  | "api-route-response"
  | "invoke-function"
  | "function-response"
  | "mock-send";

function debugLog(stage: SendStage, message: string, detail?: unknown) {
  if (!DEBUG) return;
  const payload = detail ? { detail } : undefined;
  console.info(`[send-email][${stage}] ${message}`, payload ?? "");
}

export async function sendEmail(payload: SendEmailPayload) {
  const supabase = getSupabaseClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const useApiRoute = process.env.NEXT_PUBLIC_USE_API_ROUTE === "true";

  if (!url || !anonKey) {
    debugLog(
      "validate-env",
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  if (useApiRoute) {
    debugLog("invoke-api-route", "Calling /api/send-email", {
      to: payload.to,
      from: payload.from,
    });
    const response = await fetch("/api/send-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      debugLog("api-route-response", "API route error", data);
      throw new Error(data?.error ?? "API route error");
    }
    debugLog("api-route-response", "API route ok", data);
    return data;
  }

  if (supabase) {
    debugLog("invoke-function", "Calling send-email Edge Function", {
      to: payload.to,
      from: payload.from,
    });
    const { data, error } = await supabase.functions.invoke("send-email", {
      body: payload,
    });

    if (error) {
      debugLog("function-response", "Edge Function returned error", {
        name: error.name,
        message: error.message,
        context: error.context,
      });
      throw error;
    }

    debugLog("function-response", "Edge Function ok", data);

    return data;
  }

  debugLog("mock-send", "Supabase not configured; using mock send");
  await new Promise((resolve) => setTimeout(resolve, 350));
  return { ok: true };
}
