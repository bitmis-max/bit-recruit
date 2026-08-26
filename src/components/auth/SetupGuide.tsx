"use client";

export function SetupGuide() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-3 border-b border-zinc-100 pb-5 dark:border-zinc-800">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500 text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Cấu hình Supabase & Google OAuth</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Thiết lập các biến môi trường để đăng nhập và gửi mail cá nhân.</p>
          </div>
        </div>

        <div className="mt-6 space-y-4 text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
          <p>Ứng dụng yêu cầu cấu hình Supabase để đăng nhập bằng tài khoản Google của bạn. Hãy làm theo các bước sau:</p>
          
          <ol className="list-decimal pl-5 space-y-3 text-xs">
            <li>
              <strong className="text-zinc-900 dark:text-white">Tạo dự án Supabase:</strong> Truy cập{" "}
              <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-semibold hover:underline dark:text-indigo-400">
                supabase.com
              </a>{" "}
              và tạo một project mới.
            </li>
            <li>
              <strong className="text-zinc-900 dark:text-white">Cấu hình Google Auth:</strong>
              <ul className="list-disc pl-5 mt-1 space-y-1 text-zinc-500 dark:text-zinc-400">
                <li>Truy cập Google Cloud Console, tạo dự án và tạo <strong>OAuth Client ID</strong> (Web application).</li>
                <li>Trong Supabase Console, vào <strong>Authentication &gt; Providers &gt; Google</strong>. Copy địa chỉ <i>Redirect URL</i> và dán vào <strong>Authorized redirect URIs</strong> của Google Cloud Credentials.</li>
                <li>Nhập <strong>Client ID</strong> và <strong>Client Secret</strong> từ Google Cloud vào Supabase và kích hoạt Google provider.</li>
              </ul>
            </li>
            <li>
              <strong className="text-zinc-900 dark:text-white">Cập nhật file cấu hình:</strong> Mở file <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800 text-rose-500 font-mono">.env.local</code> ở thư mục gốc của dự án và điền thông tin:
              <pre className="mt-2 rounded-lg bg-zinc-900 p-3 text-[11px] text-zinc-200 font-mono leading-normal">
{`NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key`}
              </pre>
            </li>
          </ol>
        </div>

        <div className="mt-8 flex items-center justify-end border-t border-zinc-100 pt-5 dark:border-zinc-800">
          <a
            href="https://supabase.com"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500"
          >
            Tạo dự án Supabase
          </a>
        </div>
      </div>
    </div>
  );
}
