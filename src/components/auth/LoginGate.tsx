"use client";

export type LoginGateProps = {
  onLogin: () => void;
  lastError: string | null;
};

export function LoginGate({ onLogin, lastError }: LoginGateProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500 text-white shadow-md shadow-indigo-500/25">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 19v-8.93a2 2 0 01.89-1.664l8-5.333a2 2 0 012.22 0l8 5.333A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-2.25-1.5a2 2 0 00-2.22 0l-2.25 1.5" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Đăng nhập BIT MAIL</h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Hãy đăng nhập bằng Google để gửi email hàng loạt bằng tài khoản của bạn.
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <button
            type="button"
            onClick={onLogin}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582l3.51-3.51C17.745 1.054 15.036 0 12 0 7.354 0 3.382 2.673 1.482 6.555l3.784 3.21z"
              />
              <path
                fill="#4285F4"
                d="M23.49 12.275c0-.825-.075-1.613-.21-2.373H12v4.582h6.44c-.273 1.455-1.09 2.691-2.327 3.518l3.627 2.809c2.127-1.964 3.75-4.836 3.75-8.536z"
              />
              <path
                fill="#FBBC05"
                d="M5.266 14.235A7.053 7.053 0 0 1 4.909 12c0-.79.135-1.555.357-2.264l-3.784-3.21C.536 8.355 0 12c0 1.882.536 3.645 1.482 5.474l3.784-3.239z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.955-1.073 7.94-2.918l-3.627-2.809C15.22 19.01 13.727 19.09 12 19.09c-3.736 0-6.9-2.527-8.03-5.918L.186 16.41C2.086 21.327 6.058 24 12 24z"
              />
            </svg>
            Đăng nhập bằng Google
          </button>
        </div>

        {lastError && (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-xs text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
            {lastError}
          </p>
        )}
      </div>
    </div>
  );
}
