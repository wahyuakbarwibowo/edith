const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL } = process.env;

/** Cloudflare R2 via Bun's built-in S3 client; null when not configured. */
export const r2 = R2_BUCKET
  ? new Bun.S3Client({
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      region: "auto",
      bucket: R2_BUCKET,
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    })
  : null;

export const publicUrl = (key: string) => `${R2_PUBLIC_URL}/${key}`;
