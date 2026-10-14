import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

@Injectable()
export class PrivateObjectStorageService {
  private readonly logger = new Logger(PrivateObjectStorageService.name);
  private client: S3Client | null = null;
  private readonly bucket: string | null;
  private readonly localRoot: string;
  private readonly endpoint: string | null;
  private readonly region: string;
  private readonly forcePathStyle: boolean;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('storage.bucket')?.trim() || null;
    this.localRoot = resolve(
      process.cwd(),
      this.config.get<string>('storage.localPath')?.trim() || 'var/private-storage',
    );
    this.endpoint = this.validEndpoint(this.config.get<string>('storage.endpoint')?.trim() || '');
    this.region = this.config.get<string>('storage.region') ?? 'auto';
    this.forcePathStyle = this.config.get<boolean>('storage.forcePathStyle') ?? false;
    this.accessKeyId = this.config.get<string>('storage.accessKeyId')?.trim() ?? '';
    this.secretAccessKey = this.config.get<string>('storage.secretAccessKey')?.trim() ?? '';

    if (!this.hasS3Configuration()) {
      this.logger.warn(
        'S3 storage is not fully configured; private files will use local storage. Configure STORAGE_ENDPOINT, STORAGE_BUCKET, and S3 credentials for durable shared storage.',
      );
    }
  }

  private validEndpoint(value: string): string | null {
    if (!value || /<[^>]+>/.test(value)) {
      return null;
    }

    try {
      const endpoint = new URL(value);
      if (
        !['http:', 'https:'].includes(endpoint.protocol) ||
        endpoint.username ||
        endpoint.password
      ) {
        return null;
      }
      return endpoint.toString();
    } catch {
      return null;
    }
  }

  private hasS3Configuration(): boolean {
    return Boolean(
      this.endpoint &&
      this.bucket &&
      this.accessKeyId &&
      this.secretAccessKey &&
      !/<[^>]+>/.test(this.accessKeyId) &&
      !/<[^>]+>/.test(this.secretAccessKey),
    );
  }

  private getClient(): S3Client | null {
    if (!this.hasS3Configuration()) {
      return null;
    }

    if (this.client) {
      return this.client;
    }

    this.client = new S3Client({
      region: this.region,
      forcePathStyle: this.forcePathStyle,
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      },
      endpoint: this.endpoint!,
    });

    return this.client;
  }

  private localPath(key: string): string {
    const segments = key.split('/');
    if (
      segments.length === 0 ||
      segments.some(
        (segment) =>
          !segment || segment === '.' || segment === '..' || !/^[A-Za-z0-9._-]+$/.test(segment),
      )
    ) {
      throw new Error('Invalid private storage key');
    }

    const filePath = resolve(this.localRoot, ...segments);
    if (!filePath.startsWith(`${this.localRoot}${sep}`)) {
      throw new Error('Private storage key escapes its configured directory');
    }
    return filePath;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const client = this.getClient();
    if (client) {
      await client.send(
        new PutObjectCommand({
          Bucket: this.bucket!,
          Key: key,
          Body: body,
          ContentType: contentType,
          ServerSideEncryption: 'AES256',
        }),
      );
      return;
    }

    const filePath = this.localPath(key);
    await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
    await writeFile(filePath, body, { flag: 'wx', mode: 0o600 });
  }

  async get(key: string): Promise<Buffer> {
    const client = this.getClient();
    if (!client) {
      return readFile(this.localPath(key));
    }

    const result = await client.send(
      new GetObjectCommand({
        Bucket: this.bucket!,
        Key: key,
      }),
    );
    if (!result.Body) {
      throw new Error('Stored object has no body');
    }

    const bytes = await result.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    const client = this.getClient();
    if (!client) {
      await unlink(this.localPath(key));
      return;
    }

    await client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket!,
        Key: key,
      }),
    );
  }
}
