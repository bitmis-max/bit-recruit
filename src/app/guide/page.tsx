import Link from "next/link";

const steps = [
  { number: "01", title: "Khám phá câu lạc bộ", description: "Mở danh sách CLB, đọc phần giới thiệu và chọn câu lạc bộ bạn muốn tìm hiểu." },
  { number: "02", title: "Xem đợt tuyển đang mở", description: "Trong trang CLB, xem các đợt tuyển và ban đang nhận hồ sơ. Chọn vị trí phù hợp để đọc mô tả và yêu cầu." },
  { number: "03", title: "Điền đơn ứng tuyển", description: "Mở biểu mẫu của vị trí, điền đầy đủ thông tin và câu trả lời, sau đó gửi đơn." },
  { number: "04", title: "Theo dõi thông tin từ CLB", description: "Kiểm tra email bạn đã dùng khi ứng tuyển để nhận thông báo hoặc lịch phỏng vấn từ ban tuyển thành viên." },
];

export default function GuidePage() {
  return (
    <main className="min-h-screen bg-[#f7f8f6] px-5 py-14 text-zinc-900 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-4xl">
        <header className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Hướng dẫn sử dụng</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Ứng tuyển theo cách của bạn</h1>
          <p className="mt-5 text-lg leading-8 text-zinc-600">Làm theo các bước dưới đây để tìm CLB phù hợp và gửi hồ sơ ứng tuyển trên cổng BIT.</p>
        </header>
        <ol className="mt-12 space-y-4">
          {steps.map((step) => <li key={step.number} className="flex gap-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:gap-7 sm:p-8">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-emerald-50 font-bold text-emerald-800">{step.number}</span>
            <div><h2 className="text-lg font-semibold">{step.title}</h2><p className="mt-2 leading-7 text-zinc-600">{step.description}</p></div>
          </li>)}
        </ol>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link href="/clubs" className="rounded-xl bg-emerald-800 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-900">Khám phá CLB <span aria-hidden="true">→</span></Link>
          <Link href="/positions" className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-700 hover:border-emerald-700 hover:text-emerald-800">Xem đợt tuyển</Link>
        </div>
      </div>
    </main>
  );
}
