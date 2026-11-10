import type { Metadata } from "next";
import { FrameMaker } from "../../../components/frames/FrameMaker";

export const metadata: Metadata = {
  title: "Tạo avatar có khung | BIT",
  description: "Ghép ảnh của bạn với khung avatar của CLB BIT ngay trên trình duyệt. Ảnh không được tải lên đâu.",
};

export default async function FramePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main className="flex-1 bg-[#f7f8f6] text-zinc-900"><FrameMaker frameId={id} /></main>;
}
