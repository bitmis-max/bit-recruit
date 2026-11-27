// Chọn đợt tuyển đang nhận đơn cho khối đếm ngược ở trang công khai.
// rows: các đợt `status = 'open'` đã bắt đầu, xếp theo start_date mới nhất trước.
// Đợt không đặt ngày kết thúc vẫn tính là đang mở (DB và submit_application đều cho phép).
export type OpenCampaignState = { open: boolean; deadline: string | null };

export function pickOpenCampaign(rows: { end_date: string | null }[] | null | undefined, now: Date): OpenCampaignState {
  const current = (rows ?? []).find((row) => row.end_date === null || Date.parse(row.end_date) >= now.getTime());
  return current ? { open: true, deadline: current.end_date } : { open: false, deadline: null };
}
