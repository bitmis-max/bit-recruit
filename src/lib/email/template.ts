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
      contentType: image.mimeType || "image/svg+xml",
      encoding: "utf8",
    };
  }

  const base64 = image.source.includes(",")
    ? image.source.split(",").slice(1).join(",")
    : image.source;

  return {
    filename: image.name,
    content: base64,
    contentType: image.mimeType || "application/octet-stream",
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
