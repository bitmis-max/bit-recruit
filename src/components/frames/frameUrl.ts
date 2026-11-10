export type AvatarFrame = { id: string; name: string; image_path: string };

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Bucket avatar-frames là public nên ghép URL trực tiếp, không cần gọi API.
export function frameImageUrl(imagePath: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/avatar-frames/${imagePath}`;
}
