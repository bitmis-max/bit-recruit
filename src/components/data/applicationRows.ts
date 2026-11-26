export type ApplicationRecord = {
  position_id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  student_code: string | null;
  class_name: string | null;
};

export const APPLICATION_COLUMNS = ["email", "full_name", "phone", "student_code", "class_name", "campaign_name", "position_name"];

/**
 * Đổi đơn ứng tuyển thành dòng người nhận: bỏ đơn không có email, loại email trùng (không phân biệt hoa/thường).
 * Đơn đứng trước được giữ, nên truyền danh sách đã sắp mới nhất trước.
 */
export function buildApplicantRows(applications: ApplicationRecord[], campaignName: string, positionNames: Map<string, string>) {
  const seen = new Set<string>();
  const rows: Record<string, string>[] = [];
  let noEmail = 0;
  let duplicates = 0;
  for (const application of applications) {
    const email = application.email?.trim();
    if (!email) { noEmail += 1; continue; }
    const key = email.toLowerCase();
    if (seen.has(key)) { duplicates += 1; continue; }
    seen.add(key);
    rows.push({
      email,
      full_name: application.full_name ?? "",
      phone: application.phone ?? "",
      student_code: application.student_code ?? "",
      class_name: application.class_name ?? "",
      campaign_name: campaignName,
      position_name: positionNames.get(application.position_id) ?? "",
    });
  }
  return { rows, noEmail, duplicates };
}
