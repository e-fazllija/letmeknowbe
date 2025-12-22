import { Injectable, InternalServerErrorException } from '@nestjs/common';
import type { PresignPutParams, PresignPutResult, StorageService } from './storage.service';

@Injectable()
export class S3StorageService implements StorageService {
  private readonly provider: 'S3' | 'AZURE_BLOB';

  // S3 / MinIO
  private client: any;
  private readonly forcePathStyle: boolean;

  // Azure Blob
  private azureCredential: any;
  private azureServiceClient: any;

  constructor() {
    const providerEnv = (process.env.STORAGE_PROVIDER || 'S3').toUpperCase();
    this.provider = providerEnv === 'AZURE_BLOB' ? 'AZURE_BLOB' : 'S3';

    if (this.provider === 'S3') {
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
    } else {
      this.forcePathStyle = false;
      this.client = null;
    }
  }

  // --- Helpers ---------------------------------------------------------------

  private async ensureS3Client(): Promise<any> {
    if (this.provider !== 'S3') {
      throw new InternalServerErrorException('S3 provider not configured');
    }
    if (this.client && !(this.client as any).__lazy__) return this.client;
    const { S3Client } = await import('@aws-sdk/client-s3');
    const c = new S3Client({
      region: (this.client as any)?.region,
      endpoint: (this.client as any)?.endpoint,
      forcePathStyle: this.forcePathStyle,
      credentials: (this.client as any)?.credentials,
    });
    this.client = c;
    return this.client;
  }

  private async ensureAzureClient(): Promise<{ blobServiceClient: any; credential: any }> {
    if (this.provider !== 'AZURE_BLOB') {
      throw new InternalServerErrorException('Azure Blob provider not configured');
    }
    const accountName = process.env.AZURE_STORAGE_ACCOUNT || '';
    const accountKey = process.env.AZURE_STORAGE_KEY || '';
    if (!accountName || !accountKey) {
      throw new InternalServerErrorException('Azure storage account not configured (AZURE_STORAGE_ACCOUNT/AZURE_STORAGE_KEY)');
    }

    const { BlobServiceClient, StorageSharedKeyCredential } = await import('@azure/storage-blob');

    if (!this.azureCredential) {
      this.azureCredential = new StorageSharedKeyCredential(accountName, accountKey);
    }
    if (!this.azureServiceClient) {
      const endpoint = process.env.AZURE_STORAGE_ENDPOINT || `https://${accountName}.blob.core.windows.net`;
      this.azureServiceClient = new BlobServiceClient(endpoint, this.azureCredential);
    }

    return { blobServiceClient: this.azureServiceClient, credential: this.azureCredential };
  }

  // --- presign GET -----------------------------------------------------------

  async presignGet(params: { bucket: string; key: string; expiresInSeconds?: number; responseContentType?: string; responseContentDisposition?: string }): Promise<{ url: string; expiresIn: number }> {
    if (this.provider === 'AZURE_BLOB') {
      return this.presignGetAzure(params);
    }
    return this.presignGetS3(params);
  }

  private async presignGetS3(params: { bucket: string; key: string; expiresInSeconds?: number; responseContentType?: string; responseContentDisposition?: string }): Promise<{ url: string; expiresIn: number }> {
    const { bucket, key, expiresInSeconds = 300, responseContentType, responseContentDisposition } = params;
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const client = await this.ensureS3Client();
    const cmd = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentType: responseContentType,
      ResponseContentDisposition: responseContentDisposition,
    } as any);
    const url = await getSignedUrl(client, cmd, { expiresIn: expiresInSeconds });
    return { url, expiresIn: expiresInSeconds };
  }

  private async presignGetAzure(params: { bucket: string; key: string; expiresInSeconds?: number; responseContentType?: string; responseContentDisposition?: string }): Promise<{ url: string; expiresIn: number }> {
    const { bucket, key, expiresInSeconds = 300, responseContentType, responseContentDisposition } = params;
    const { blobServiceClient, credential } = await this.ensureAzureClient();
    const { BlobSASPermissions, SASProtocol, generateBlobSASQueryParameters } = await import('@azure/storage-blob');

    const containerClient = blobServiceClient.getContainerClient(bucket);
    const blobClient = containerClient.getBlobClient(key);

    const startsOn = new Date(Date.now() - 5 * 60 * 1000);
    const expiresOn = new Date(Date.now() + expiresInSeconds * 1000);
    const permissions = BlobSASPermissions.parse('r');
    const protocol =
      (process.env.AZURE_STORAGE_ENDPOINT || '').startsWith('http://')
        ? SASProtocol.HttpsAndHttp
        : SASProtocol.Https;

    const sas = generateBlobSASQueryParameters(
      {
        containerName: bucket,
        blobName: key,
        permissions,
        protocol,
        startsOn,
        expiresOn,
        contentType: responseContentType,
        contentDisposition: responseContentDisposition,
        version: '2020-10-02',
      },
      credential,
    );

    const url = `${blobClient.url}?${sas.toString()}`;
    return { url, expiresIn: expiresInSeconds };
  }

  // --- presign PUT -----------------------------------------------------------

  async presignPut(params: PresignPutParams): Promise<PresignPutResult> {
    if (this.provider === 'AZURE_BLOB') {
      return this.presignPutAzure(params);
    }
    return this.presignPutS3(params);
  }

  private async presignPutS3(params: PresignPutParams): Promise<PresignPutResult> {
    const { bucket, key, contentType, expiresInSeconds = 300, sseMode = 'S3', kmsKeyId } = params;

    const headers: Record<string, string> = {};
    if (contentType) headers['content-type'] = contentType;
    if (sseMode === 'S3') headers['x-amz-server-side-encryption'] = 'AES256';
    if (sseMode === 'KMS') {
      headers['x-amz-server-side-encryption'] = 'aws:kms';
      if (kmsKeyId) headers['x-amz-server-side-encryption-aws-kms-key-id'] = kmsKeyId;
    }

    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const client = await this.ensureS3Client();

    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ServerSideEncryption: sseMode === 'S3' ? 'AES256' : sseMode === 'KMS' ? 'aws:kms' : undefined,
      SSEKMSKeyId: sseMode === 'KMS' ? kmsKeyId : undefined,
    } as any);
    const uploadUrl = await getSignedUrl(client, cmd, { expiresIn: expiresInSeconds });
    return { uploadUrl, headers, expiresIn: expiresInSeconds };
  }

  private async presignPutAzure(params: PresignPutParams): Promise<PresignPutResult> {
    const { bucket, key, contentType, expiresInSeconds = 300 } = params;
    const { blobServiceClient, credential } = await this.ensureAzureClient();
    const { BlobSASPermissions, SASProtocol, generateBlobSASQueryParameters } = await import('@azure/storage-blob');

    const containerClient = blobServiceClient.getContainerClient(bucket);
    const blobClient = containerClient.getBlobClient(key);

    const startsOn = new Date(Date.now() - 5 * 60 * 1000);
    const expiresOn = new Date(Date.now() + expiresInSeconds * 1000);
    const permissions = BlobSASPermissions.parse('cw'); // create + write
    const protocol =
      (process.env.AZURE_STORAGE_ENDPOINT || '').startsWith('http://')
        ? SASProtocol.HttpsAndHttp
        : SASProtocol.Https;

    const sas = generateBlobSASQueryParameters(
      {
        containerName: bucket,
        blobName: key,
        permissions,
        protocol,
        startsOn,
        expiresOn,
        contentType: contentType || undefined,
        version: '2020-10-02',
      },
      credential,
    );

    const uploadUrl = `${blobClient.url}?${sas.toString()}`;
    const headers: Record<string, string> = {};
    if (contentType) headers['content-type'] = contentType;
    headers['x-ms-blob-type'] = 'BlockBlob';

    return { uploadUrl, headers, expiresIn: expiresInSeconds };
  }

  // --- metadata --------------------------------------------------------------

  async headObject(bucket: string, key: string): Promise<{ etag?: string; contentLength?: number } | null> {
    if (this.provider === 'AZURE_BLOB') {
      return this.headObjectAzure(bucket, key);
    }
    return this.headObjectS3(bucket, key);
  }

  private async headObjectS3(bucket: string, key: string): Promise<{ etag?: string; contentLength?: number } | null> {
    try {
      const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
      const client = await this.ensureS3Client();
      const out = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return { etag: out.ETag?.replace(/\"/g, ''), contentLength: out.ContentLength };
    } catch {
      return null;
    }
  }

  private async headObjectAzure(bucket: string, key: string): Promise<{ etag?: string; contentLength?: number } | null> {
    try {
      const { blobServiceClient } = await this.ensureAzureClient();
      const containerClient = blobServiceClient.getContainerClient(bucket);
      const blobClient = containerClient.getBlobClient(key);
      const props = await blobClient.getProperties();
      return {
        etag: props.etag?.replace(/\"/g, ''),
        contentLength: props.contentLength,
      };
    } catch {
      return null;
    }
  }

  // --- get object stream -----------------------------------------------------

  async getObjectStream(bucket: string, key: string): Promise<NodeJS.ReadableStream | null> {
    if (this.provider === 'AZURE_BLOB') {
      return this.getObjectStreamAzure(bucket, key);
    }
    return this.getObjectStreamS3(bucket, key);
  }

  private async getObjectStreamS3(bucket: string, key: string): Promise<NodeJS.ReadableStream | null> {
    try {
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      const client = await this.ensureS3Client();
      const out: any = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return out.Body as NodeJS.ReadableStream;
    } catch {
      return null;
    }
  }

  private async getObjectStreamAzure(bucket: string, key: string): Promise<NodeJS.ReadableStream | null> {
    try {
      const { blobServiceClient } = await this.ensureAzureClient();
      const containerClient = blobServiceClient.getContainerClient(bucket);
      const blobClient = containerClient.getBlobClient(key);
      const res = await blobClient.download();
      return (res.readableStreamBody || null) as NodeJS.ReadableStream | null;
    } catch {
      return null;
    }
  }

  // --- copy object -----------------------------------------------------------

  async copyObject(srcBucket: string, srcKey: string, dstBucket: string, dstKey: string): Promise<{ etag?: string } | null> {
    if (this.provider === 'AZURE_BLOB') {
      return this.copyObjectAzure(srcBucket, srcKey, dstBucket, dstKey);
    }
    return this.copyObjectS3(srcBucket, srcKey, dstBucket, dstKey);
  }

  private async copyObjectS3(srcBucket: string, srcKey: string, dstBucket: string, dstKey: string): Promise<{ etag?: string } | null> {
    try {
      const { CopyObjectCommand } = await import('@aws-sdk/client-s3');
      const client = await this.ensureS3Client();
      const out: any = await client.send(new CopyObjectCommand({
        Bucket: dstBucket,
        Key: dstKey,
        CopySource: `/${encodeURIComponent(srcBucket)}/${encodeURIComponent(srcKey)}`,
      }));
      return { etag: out.CopyObjectResult?.ETag?.replace(/\"/g, '') };
    } catch {
      return null;
    }
  }

  private async copyObjectAzure(srcBucket: string, srcKey: string, dstBucket: string, dstKey: string): Promise<{ etag?: string } | null> {
    try {
      const { blobServiceClient, credential } = await this.ensureAzureClient();
      const { BlobSASPermissions, SASProtocol, generateBlobSASQueryParameters } = await import('@azure/storage-blob');

      const srcContainer = blobServiceClient.getContainerClient(srcBucket);
      const srcBlob = srcContainer.getBlobClient(srcKey);
      const dstContainer = blobServiceClient.getContainerClient(dstBucket);
      const dstBlob = dstContainer.getBlobClient(dstKey);

      const startsOn = new Date(Date.now() - 5 * 60 * 1000);
      const expiresOn = new Date(Date.now() + 30 * 60 * 1000);
      const permissions = BlobSASPermissions.parse('r');
      const protocol =
        (process.env.AZURE_STORAGE_ENDPOINT || '').startsWith('http://')
          ? SASProtocol.HttpsAndHttp
          : SASProtocol.Https;

      const sas = generateBlobSASQueryParameters(
        {
          containerName: srcBucket,
          blobName: srcKey,
          permissions,
          protocol,
          startsOn,
          expiresOn,
          version: '2020-10-02',
        },
        credential,
      );

      const copySourceUrl = `${srcBlob.url}?${sas.toString()}`;
      const poller = await dstBlob.beginCopyFromURL(copySourceUrl);
      await poller.pollUntilDone();
      const props = await dstBlob.getProperties();
      return { etag: props.etag?.replace(/\"/g, '') };
    } catch {
      return null;
    }
  }

  // --- delete object ---------------------------------------------------------

  async deleteObject(bucket: string, key: string): Promise<void> {
    if (this.provider === 'AZURE_BLOB') {
      await this.deleteObjectAzure(bucket, key);
      return;
    }
    await this.deleteObjectS3(bucket, key);
  }

  private async deleteObjectS3(bucket: string, key: string): Promise<void> {
    try {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      const client = await this.ensureS3Client();
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch {
      // ignore
    }
  }

  private async deleteObjectAzure(bucket: string, key: string): Promise<void> {
    try {
      const { blobServiceClient } = await this.ensureAzureClient();
      const containerClient = blobServiceClient.getContainerClient(bucket);
      const blobClient = containerClient.getBlobClient(key);
      await blobClient.deleteIfExists();
    } catch {
      // ignore
    }
  }
}
