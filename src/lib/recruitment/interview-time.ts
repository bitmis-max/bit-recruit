export function formatInterviewTime(value: string) {
  const date = new Date(value);
  const timezone = "Asia/Ho_Chi_Minh";
  const time = new Intl.DateTimeFormat("vi-VN", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  const dateParts = new Intl.DateTimeFormat("vi-VN", { timeZone: timezone, weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(date);
  const part = (type: string) => dateParts.find((item) => item.type === type)?.value ?? "";
  return `${time} giờ ${part("weekday")} ngày ${part("day")}/${part("month")}/${part("year")}`;
}

export function formatInterviewRange(startTime: string, endTime: string) {
  return `${formatInterviewTime(startTime)} – ${formatInterviewTime(endTime)}`;
}
