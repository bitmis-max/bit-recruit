import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f7f8f6] text-zinc-900">
      <section className="relative overflow-hidden bg-emerald-950 px-5 py-20 text-white sm:px-8 sm:py-28">
        <div className="pointer-events-none absolute -right-28 -top-36 size-[480px] rounded-full border border-emerald-800/70" />
        <div className="pointer-events-none absolute -right-8 -top-16 size-[330px] rounded-full border border-emerald-800/70" />
        <div className="relative mx-auto max-w-6xl">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">Cổng thông tin tuyển thành viên BIT</p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">Tìm nơi bạn thuộc về.<br /><span className="text-emerald-300">Bắt đầu cùng BIT.</span></h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-emerald-100">Khám phá các câu lạc bộ, tìm hiểu những đợt tuyển thành viên và gửi hồ sơ ứng tuyển ngay trên một nền tảng.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/clubs" className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-100">Khám phá CLB <span aria-hidden="true">→</span></Link>
            <Link href="/guide" className="rounded-xl border border-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-900">Xem hướng dẫn</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Một hành trình rõ ràng</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Mọi điều cần cho hành trình ứng tuyển</h2>
          <p className="mt-4 leading-7 text-zinc-600">Từ lúc tìm hiểu CLB đến khi gửi đơn, bạn có thể theo dõi các bước ngay trên cổng thông tin.</p>
        </div>
        <div className="mt-9 grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"><span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-lg text-emerald-800" aria-hidden="true">⌕</span><h3 className="mt-5 text-lg font-semibold">Khám phá CLB</h3><p className="mt-2 leading-7 text-zinc-600">Tìm hiểu thông tin, hoạt động và các ban của từng câu lạc bộ.</p></article>
          <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"><span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-lg text-emerald-800" aria-hidden="true">◷</span><h3 className="mt-5 text-lg font-semibold">Theo dõi đợt tuyển</h3><p className="mt-2 leading-7 text-zinc-600">Xem vị trí đang mở, yêu cầu ứng tuyển và thời gian nhận hồ sơ.</p></article>
          <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"><span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-lg text-emerald-800" aria-hidden="true">↗</span><h3 className="mt-5 text-lg font-semibold">Ứng tuyển trực tuyến</h3><p className="mt-2 leading-7 text-zinc-600">Điền biểu mẫu của ban bạn quan tâm và gửi hồ sơ trực tiếp.</p></article>
        </div>
      </section>


    </main>
  );
}
