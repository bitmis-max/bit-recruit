"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { getSupabaseClient } from "../../lib/supabase/client";
import { GoogleAuthButton } from "../../components/auth/GoogleAuthButton";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const supabase = getSupabaseClient();
    if (!supabase) { setError("Hệ thống đăng ký chưa được cấu hình."); return; }
    setSubmitting(true);
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name.trim() } },
    });
    setSubmitting(false);
    if (signUpError) { setError(signUpError.message); return; }
    setNotice("Tài khoản đã được tạo. Hãy kiểm tra email để xác nhận nếu hệ thống yêu cầu.");
  }

  return <main className="flex min-h-[calc(100vh-72px)] items-center justify-center bg-[#f7f8f6] px-4 py-12">
    <form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">BIT · Cộng đồng CLB</p><h1 className="mt-2 text-2xl font-bold text-zinc-900">Tạo tài khoản</h1><p className="mt-1 text-sm text-zinc-500">Đăng ký để kết nối với cộng đồng BIT.</p></div>
      <label className="block text-sm font-medium text-zinc-800">Họ và tên<input required value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2.5" /></label>
      <label className="block text-sm font-medium text-zinc-800">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2.5" /></label>
      <label className="block text-sm font-medium text-zinc-800">Mật khẩu<input required minLength={6} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2.5" /></label>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      <button disabled={submitting} className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white disabled:opacity-60">{submitting ? "Đang tạo tài khoản…" : "Đăng kí"}</button>
      <div className="relative py-1"><div className="absolute inset-0 flex items-center"><span className="w-full border-t border-zinc-200" /></div><div className="relative flex justify-center"><span className="bg-white px-3 text-xs font-medium text-zinc-500">hoặc</span></div></div>
      <GoogleAuthButton next="/" />
      <p className="text-center text-sm text-zinc-600">Đã có tài khoản? <Link href="/login" className="font-semibold text-emerald-800 hover:underline">Đăng nhập</Link></p>
    </form>
  </main>;
}
