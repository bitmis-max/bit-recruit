import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function getEncryptionKey() {
  const encoded = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error("Missing GOOGLE_TOKEN_ENCRYPTION_KEY");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64 encoded 32-byte key");
  return key;
}

export function encryptGoogleRefreshToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptGoogleRefreshToken(value: string) {
  const [encodedIv, encodedTag, encodedCiphertext] = value.split(".");
  if (!encodedIv || !encodedTag || !encodedCiphertext) throw new Error("Invalid encrypted Google token");
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(encodedIv, "base64url"));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
