import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// MinIO uses path-style URLs (http://host/bucket/key) and ignores region.
// Real AWS S3 uses virtual-hosted-style by default.
//
// Note: the same `S3_ENDPOINT` is what we connect to internally AND what gets
// embedded into presigned URLs. For a physical mobile device to upload directly,
// `S3_ENDPOINT` must resolve from the device — set it to your LAN IP, not localhost.

const ENDPOINT = process.env.S3_ENDPOINT ?? 'http://localhost:9000'
const REGION = process.env.S3_REGION ?? 'us-east-1'
const BUCKET = process.env.S3_BUCKET ?? 'sandeshak'
const ACCESS_KEY = process.env.S3_ACCESS_KEY ?? 'minioadmin'
const SECRET_KEY = process.env.S3_SECRET_KEY ?? 'minioadmin'

const s3 = new S3Client({
  endpoint: ENDPOINT,
  region: REGION,
  forcePathStyle: true,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
})

export const S3_BUCKET = BUCKET
export const PRESIGN_EXPIRES_IN_SECONDS = 600 // 10 minutes

export async function createPresignedPutUrl(
  key: string,
  contentType: string,
  expiresIn: number = PRESIGN_EXPIRES_IN_SECONDS,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(s3, command, { expiresIn })
}

// Anonymous-download is enabled on the `public/` prefix in docker-compose
// (see docker-compose.yml's minio-init step), so any key under that prefix
// is fetchable directly by URL.
export function publicUrlForKey(key: string): string {
  return `${ENDPOINT}/${BUCKET}/${key}`
}
