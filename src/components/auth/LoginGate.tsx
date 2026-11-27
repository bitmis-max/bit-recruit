"use client";

import { useState, type FormEvent } from "react";
import { GoogleAuthButton } from "./GoogleAuthButton";

export function LoginGate({ onLogin, lastError }: { onLogin: (email: string, password: string) => Promise<void>; lastError: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true);
    try { await onLogin(email, password); } finally { setSubmitting(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4"><form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
    <div><p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">BIT · Quản trị CLB</p><h1 className="mt-2 text-2xl font-bold">Đăng nhập</h1><p className="mt-1 text-sm text-zinc-500">Bấm “Tiếp tục với Google” và chọn đúng Gmail đã đăng ký với CLB. Chưa vào được thì nhờ Ban chủ chốt kiểm tra email trong hồ sơ thành viên của bạn.</p></div>
    <label className="block text-sm font-medium">Email<input required type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
    <label className="block text-sm font-medium">Mật khẩu<input required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
    {lastError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{lastError}</p>}
    <button disabled={submitting} className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white disabled:opacity-60">{submitting ? "Đang đăng nhập…" : "Đăng nhập"}</button>
    <div className="relative py-1"><div className="absolute inset-0 flex items-center"><span className="w-full border-t border-zinc-200" /></div><div className="relative flex justify-center"><span className="bg-white px-3 text-xs font-medium text-zinc-500">hoặc</span></div></div>
    <GoogleAuthButton />
  </form></main>;
}
