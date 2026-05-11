export type RecipientRecord = Record<string, string>;

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

export function extractVariables(html: string) {
  const found = new Set<string>();
  let match: RegExpExecArray | null = null;
  const regex = new RegExp(VARIABLE_REGEX);
  while ((match = regex.exec(html)) !== null) {
    found.add(match[1]);
  }
  return Array.from(found.values());
}
