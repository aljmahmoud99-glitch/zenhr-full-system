import fs from "fs";
import path from "path";
import crypto from "crypto";

export type StorageAdapterMode = "local" | "s3";

export type StorageObjectInput = {
  companyId: number;
  key: string;
  body: Buffer;
  contentType?: string;
};

export interface StorageAdapter {
  mode: StorageAdapterMode;
  put(input: StorageObjectInput): Promise<{ key: string; size: number }>;
  get(companyId: number, key: string): Promise<Buffer>;
  signedUrl(companyId: number, key: string, ttlSeconds?: number): Promise<string>;
}

function companyKey(companyId: number, key: string) {
  const safe = key.replace(/\\/g, "/").split("/").filter(Boolean).map((part) => part.replace(/[^a-zA-Z0-9._-]/g, "_")).join("/");
  return `company-${companyId}/${safe}`;
}

export class LocalStorageAdapter implements StorageAdapter {
  mode = "local" as const;
  constructor(private root: string) {}

  async put(input: StorageObjectInput) {
    const key = companyKey(input.companyId, input.key);
    const target = path.resolve(this.root, key);
    if (!target.startsWith(path.resolve(this.root))) throw new Error("Unsafe storage key");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, input.body);
    return { key, size: input.body.length };
  }

  async get(_companyId: number, key: string) {
    const target = path.resolve(this.root, key);
    if (!target.startsWith(path.resolve(this.root))) throw new Error("Unsafe storage key");
    return fs.readFileSync(target);
  }

  async signedUrl(companyId: number, key: string, ttlSeconds = 300) {
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const token = crypto.createHash("sha256").update(`${companyId}:${key}:${expires}`).digest("hex").slice(0, 24);
    return `/uploads/${encodeURIComponent(path.basename(key))}?expires=${expires}&sig=${token}`;
  }
}

export class S3StorageAdapter implements StorageAdapter {
  mode = "s3" as const;
  constructor(private bucket: string, private region: string, private endpoint?: string) {}

  async put(_input: StorageObjectInput) {
    throw new Error("S3 adapter is configured but no S3 client credentials/library are wired in this local build");
  }

  async get(_companyId: number, _key: string) {
    throw new Error("S3 adapter is configured but no S3 client credentials/library are wired in this local build");
  }

  async signedUrl(companyId: number, key: string, ttlSeconds = 300) {
    const objectKey = companyKey(companyId, key);
    const base = this.endpoint || `https://${this.bucket}.s3.${this.region}.amazonaws.com`;
    return `${base}/${encodeURIComponent(objectKey)}?expires=${ttlSeconds}&signed=external-required`;
  }
}

export function createStorageAdapter(env: NodeJS.ProcessEnv, localRoot: string): StorageAdapter {
  const mode = (env["STORAGE_ADAPTER"] || "local").toLowerCase();
  if (mode === "s3") return new S3StorageAdapter(env["S3_BUCKET"] || "", env["S3_REGION"] || "us-east-1", env["S3_ENDPOINT"]);
  return new LocalStorageAdapter(localRoot);
}
