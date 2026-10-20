import Link from "next/link";

export function ClubsPage() {
  return (
    <main className="min-h-screen bg-[#f7f8f6] text-zinc-900">
      <section className="bg-emerald-950 px-5 py-16 text-white sm:px-8 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">Khám phá câu lạc bộ</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">CLB Công nghệ ngân hàng BIT</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-emerald-100">Câu lạc bộ dành cho sinh viên yêu thích công nghệ và lập trình.</p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-16">
        <div className="grid gap-10 md:grid-cols-[1.1fr_0.9fr] md:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">Về CLB BIT</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Cùng học hỏi, cùng tạo ra sản phẩm</h2>
            <p className="mt-4 leading-7 text-zinc-600">BIT là nơi các bạn sinh viên cùng khám phá công nghệ, thực hành lập trình và phát triển kỹ năng qua những dự án thực tế. Thành viên có cơ hội làm việc trong các ban chuyên môn, tổ chức và truyền thông.</p>
          </div>
          <div className="rounded-3xl border border-emerald-100 bg-white p-7 shadow-sm">
            <p className="text-sm font-semibold text-emerald-800">Bạn sẽ tìm thấy tại BIT</p>
            <ul className="mt-5 space-y-4 text-sm leading-6 text-zinc-700">
              <li className="flex gap-3"><span className="text-emerald-700" aria-hidden="true">✓</span><span>Môi trường học tập và thực hành công nghệ cùng đồng đội.</span></li>
              <li className="flex gap-3"><span className="text-emerald-700" aria-hidden="true">✓</span><span>Cơ hội tham gia dự án và hoạt động của câu lạc bộ.</span></li>
              <li className="flex gap-3"><span className="text-emerald-700" aria-hidden="true">✓</span><span>Các ban với vai trò phù hợp nhiều sở thích và kỹ năng.</span></li>
            </ul>
            <Link href="/positions" className="mt-7 inline-flex items-center rounded-xl bg-emerald-800 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-900">Xem các ban đang tuyển <span className="ml-2" aria-hidden="true">→</span></Link>
          </div>
        </div>
      </section>
    </main>
  );
}
