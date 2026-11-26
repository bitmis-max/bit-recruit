import { MAX_HTML_LENGTH, MAX_SUBJECT_LENGTH } from "./validators.ts";

export type RecipientRecord = Record<string, string>;

export type EmailImageAsset = {
  name: string;
  mimeType: string;
  source: string;
  isSvg: boolean;
  svgText?: string;
};

export type EmailAttachment = {
  filename: string;
  content: string;
  contentType?: string;
  encoding?: "base64" | "utf8";
};

export const VARIABLE_REGEX = /{{\s*([\w.-]+)\s*}}/g;

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function interpolateTemplate(html: string, record: RecipientRecord) {
  return html.replace(VARIABLE_REGEX, (_, key: string) => {
    const rawValue = record[key] ?? record[key.toLowerCase()] ?? "";
    return escapeHtml(String(rawValue));
  });
}

export function interpolateSvgTemplate(svg: string, record: RecipientRecord) {
  return svg.replace(/\{([\w.-]+)\}/g, (_, key: string) => {
    const rawValue = record[key] ?? record[key.toLowerCase()] ?? "";
    return escapeHtml(String(rawValue));
  });
}

export function resolveImageSource(
  image: EmailImageAsset,
  record?: RecipientRecord
) {
  if (!image.isSvg || !image.svgText) {
    return image.source;
  }

  const svgText = record
    ? interpolateSvgTemplate(image.svgText, record)
    : image.svgText;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
}

export function buildEmailHtml(
  html: string,
  record: RecipientRecord,
  image?: EmailImageAsset | null
) {
  const mergedHtml = interpolateTemplate(html, record);
  if (!image) return mergedHtml;

  const imageSource = resolveImageSource(image, record);
  const imageMarkup = `<div style="margin:0 0 16px 0;"><img src="${escapeHtml(imageSource)}" alt="${escapeHtml(image.name)}" style="display:block;max-width:100%;height:auto;border:0;" /></div>`;

  return `${imageMarkup}${mergedHtml}`;
}

const IMAGE_TYPE_BY_EXTENSION: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp",
};

/** Luôn trả về kiểu `image/*` (máy chủ từ chối kiểu khác): theo mimeType, rồi tiền tố data URL, rồi đuôi tên file, mặc định image/png. */
export function resolveImageMimeType(image: EmailImageAsset): string {
  if (image.mimeType.startsWith("image/")) return image.mimeType;
  const fromDataUrl = /^data:(image\/[\w.+-]+)[;,]/i.exec(image.source)?.[1];
  if (fromDataUrl) return fromDataUrl.toLowerCase();
  const ext = image.name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_TYPE_BY_EXTENSION[ext] ?? "image/png";
}

export function buildImageAttachment(
  image: EmailImageAsset,
  record?: RecipientRecord
): EmailAttachment {
  if (image.isSvg && image.svgText) {
    const svgText = record
      ? interpolateSvgTemplate(image.svgText, record)
      : image.svgText;

    return {
      filename: image.name,
      content: svgText,
      contentType: resolveImageMimeType(image),
      encoding: "utf8",
    };
  }

  const base64 = image.source.includes(",")
    ? image.source.split(",").slice(1).join(",")
    : image.source;

  return {
    filename: image.name,
    content: base64,
    contentType: resolveImageMimeType(image),
    encoding: "base64",
  };
}

export function extractVariables(html: string) {
  const found = new Set<string>();
  let match: RegExpExecArray | null = null;
  const regex = new RegExp(VARIABLE_REGEX);
  while ((match = regex.exec(html)) !== null) {
    found.add(match[1]);
  }
  return Array.from(found.values());
}

/** Nội dung có chữ hoặc ảnh/bảng (bỏ thẻ HTML rỗng và `&nbsp;`). */
export function htmlHasContent(html: string) {
  if (/<(img|table|video|iframe|hr)\b/i.test(html)) return true;
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/gi, " ").trim().length > 0;
}

/** Kiểm trước khi gửi. Trả về thông báo tiếng Việt, hoặc null nếu hợp lệ. Giới hạn khớp /api/send-email. */
export function checkComposeBeforeSend(subject: string, html: string): string | null {
  if (!subject.trim()) return "Tiêu đề thư đang trống.";
  if (!htmlHasContent(html)) return "Nội dung thư đang trống.";
  if (subject.length > MAX_SUBJECT_LENGTH) return `Tiêu đề dài quá ${MAX_SUBJECT_LENGTH} ký tự.`;
  if (html.length > MAX_HTML_LENGTH) return "Nội dung thư quá lớn (tối đa 500 KB).";
  return null;
}
