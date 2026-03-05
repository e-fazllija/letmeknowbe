export type PresignPutParams = {
  bucket: string;
  key: string;
  contentType?: string;
  expiresInSeconds?: number;
  sseMode?: 'NONE' | 'S3' | 'KMS';
  kmsKeyId?: string;
};

export type PresignPutResult = {
  uploadUrl: string;
  headers: Record<string, string>;
  expiresIn: number;
};

export interface StorageService {
  presignPut(params: PresignPutParams): Promise<PresignPutResult>;
  headObject(bucket: string, key: string): Promise<{ etag?: string; contentLength?: number } | null>;
  getObjectStream(bucket: string, key: string): Promise<NodeJS.ReadableStream | null>;
  copyObject(srcBucket: string, srcKey: string, dstBucket: string, dstKey: string): Promise<{ etag?: string } | null>;
  deleteObject(bucket: string, key: string): Promise<void>;
}
