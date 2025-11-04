import { Injectable } from '@nestjs/common';
import type { PresignPutParams, PresignPutResult, StorageService } from './storage.service';

@Injectable()
export class S3StorageService implements StorageService {
  private client: any;
  private readonly forcePathStyle: boolean;

  constructor() {
    const endpoint = process.env.S3_ENDPOINT || undefined;
    const region = process.env.S3_REGION || 'us-east-1';
    const credentials =
      process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY
        ? { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY }
        : undefined;
    // For MinIO/path-style we forcePathStyle when a custom endpoint is used
    this.forcePathStyle = !!endpoint;
    // Lazy client init to allow running without @aws-sdk during tests unless REAL mode is used
    this.client = { __lazy__: true, region, endpoint, credentials } as any;
  }

  async presignGet(params: { bucket: string; key: string; expiresInSeconds?: number; responseContentType?: string; responseContentDisposition?: string }): Promise<{ url: string; expiresIn: number }> {
    const { bucket, key, expiresInSeconds = 300, responseContentType, responseContentDisposition } = params;
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    if ((this.client as any).__lazy__) {
      const c = new S3Client({
        region: (this.client as any).region,
        endpoint: (this.client as any).endpoint,
        forcePathStyle: this.forcePathStyle,
        credentials: (this.client as any).credentials,
      });
      this.client = c;
    }
    const cmd = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentType: responseContentType,
      ResponseContentDisposition: responseContentDisposition,
    } as any);
    const url = await getSignedUrl(this.client, cmd, { expiresIn: expiresInSeconds });
    return { url, expiresIn: expiresInSeconds };
  }

  async presignPut(params: PresignPutParams): Promise<PresignPutResult> {
    const { bucket, key, contentType, expiresInSeconds = 300, sseMode = 'S3', kmsKeyId } = params;

    const headers: Record<string, string> = {};
    if (contentType) headers['content-type'] = contentType;
    if (sseMode === 'S3') headers['x-amz-server-side-encryption'] = 'AES256';
    if (sseMode === 'KMS') {
      headers['x-amz-server-side-encryption'] = 'aws:kms';
      if (kmsKeyId) headers['x-amz-server-side-encryption-aws-kms-key-id'] = kmsKeyId;
    }

    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    if ((this.client as any).__lazy__) {
      const c = new S3Client({
        region: (this.client as any).region,
        endpoint: (this.client as any).endpoint,
        forcePathStyle: this.forcePathStyle,
        credentials: (this.client as any).credentials,
      });
      this.client = c;
    }
    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ServerSideEncryption: sseMode === 'S3' ? 'AES256' : sseMode === 'KMS' ? 'aws:kms' : undefined,
      SSEKMSKeyId: sseMode === 'KMS' ? kmsKeyId : undefined,
    } as any);
    const uploadUrl = await getSignedUrl(this.client, cmd, { expiresIn: expiresInSeconds });
    return { uploadUrl, headers, expiresIn: expiresInSeconds };
  }

  async headObject(bucket: string, key: string): Promise<{ etag?: string; contentLength?: number } | null> {
    try {
      const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
      if ((this.client as any).__lazy__) {
        const { S3Client } = await import('@aws-sdk/client-s3');
        const c = new S3Client({
          region: (this.client as any).region,
          endpoint: (this.client as any).endpoint,
          forcePathStyle: this.forcePathStyle,
          credentials: (this.client as any).credentials,
        });
        this.client = c;
      }
      const out = await this.client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return { etag: out.ETag?.replace(/\"/g, ''), contentLength: out.ContentLength };
    } catch {
      return null;
    }
  }

  async getObjectStream(bucket: string, key: string): Promise<NodeJS.ReadableStream | null> {
    try {
      const { GetObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
      if ((this.client as any).__lazy__) {
        const c = new S3Client({
          region: (this.client as any).region,
          endpoint: (this.client as any).endpoint,
          forcePathStyle: this.forcePathStyle,
          credentials: (this.client as any).credentials,
        });
        this.client = c;
      }
      const out: any = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return out.Body as NodeJS.ReadableStream;
    } catch {
      return null;
    }
  }

  async copyObject(srcBucket: string, srcKey: string, dstBucket: string, dstKey: string): Promise<{ etag?: string } | null> {
    try {
      const { CopyObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
      if ((this.client as any).__lazy__) {
        const c = new S3Client({
          region: (this.client as any).region,
          endpoint: (this.client as any).endpoint,
          forcePathStyle: this.forcePathStyle,
          credentials: (this.client as any).credentials,
        });
        this.client = c;
      }
      const out: any = await this.client.send(new CopyObjectCommand({
        Bucket: dstBucket,
        Key: dstKey,
        CopySource: `/${encodeURIComponent(srcBucket)}/${encodeURIComponent(srcKey)}`,
      }));
      return { etag: out.CopyObjectResult?.ETag?.replace(/\"/g, '') };
    } catch {
      return null;
    }
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    try {
      const { DeleteObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
      if ((this.client as any).__lazy__) {
        const c = new S3Client({
          region: (this.client as any).region,
          endpoint: (this.client as any).endpoint,
          forcePathStyle: this.forcePathStyle,
          credentials: (this.client as any).credentials,
        });
        this.client = c;
      }
      await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch {
      // ignore
    }
  }
}
