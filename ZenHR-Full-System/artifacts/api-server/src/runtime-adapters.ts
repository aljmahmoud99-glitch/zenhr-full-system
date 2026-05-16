import net from "net";

type Logger = (details: Record<string, unknown>) => void;
type Metric = { count: number; totalMs: number; maxMs: number; errors: number };
type RateLimitDecision = { allowed: boolean; count: number; remaining: number; resetAt: number };

export interface RuntimeStore {
  mode: "memory" | "redis";
  ready(): Promise<{ ok: boolean; message: string }>;
  rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitDecision>;
  recordMetric(route: string, durationMs: number, isError: boolean): Promise<void>;
  metrics(): Promise<Record<string, Metric>>;
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  keys(pattern: string): Promise<string[]>;
}

class MemoryRuntimeStore implements RuntimeStore {
  mode = "memory" as const;
  private buckets = new Map<string, { count: number; resetAt: number }>();
  private metricsByRoute: Record<string, Metric> = {};
  private values = new Map<string, { value: unknown; expiresAt?: number }>();

  async ready() {
    return { ok: true, message: "memory adapter" };
  }

  async rateLimit(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    const current = this.buckets.get(key);
    const entry = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };
    entry.count += 1;
    this.buckets.set(key, entry);
    return { allowed: entry.count <= limit, count: entry.count, remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt };
  }

  async recordMetric(route: string, durationMs: number, isError: boolean) {
    const metric = this.metricsByRoute[route] || { count: 0, totalMs: 0, maxMs: 0, errors: 0 };
    metric.count += 1;
    metric.totalMs += durationMs;
    metric.maxMs = Math.max(metric.maxMs, durationMs);
    if (isError) metric.errors += 1;
    this.metricsByRoute[route] = metric;
  }

  async metrics() {
    return this.metricsByRoute;
  }

  async getJson<T>(key: string) {
    const entry = this.values.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number) {
    this.values.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined });
  }

  async delete(key: string) {
    this.values.delete(key);
  }

  async keys(pattern: string) {
    const prefix = pattern.replace(/\*$/, "");
    return [...this.values.keys()].filter((key) => key.startsWith(prefix));
  }
}

class RedisRespClient {
  private host: string;
  private port: number;
  private password?: string;
  private db?: string;

  constructor(redisUrl: string) {
    const parsed = new URL(redisUrl || "redis://127.0.0.1:6379/0");
    this.host = parsed.hostname || "127.0.0.1";
    this.port = Number(parsed.port || 6379);
    this.password = parsed.password || undefined;
    this.db = parsed.pathname?.replace("/", "") || undefined;
  }

  async command<T = unknown>(...parts: Array<string | number>) {
    const socket = net.createConnection({ host: this.host, port: this.port });
    socket.setTimeout(5000);
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
      socket.once("timeout", () => reject(new Error("Redis command timed out")));
    });
    const commands: Array<Array<string | number>> = [];
    if (this.password) commands.push(["AUTH", this.password]);
    if (this.db) commands.push(["SELECT", this.db]);
    commands.push(parts);
    const payload = commands.map(encodeResp).join("");
    socket.write(payload);
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      socket.on("data", (chunk) => chunks.push(chunk));
      socket.once("error", reject);
      socket.once("end", resolve);
      socket.end();
    });
    const text = Buffer.concat(chunks).toString("utf8");
    const parsed = parseLastResp(text);
    if (parsed instanceof Error) throw parsed;
    return parsed as T;
  }
}

function encodeResp(parts: Array<string | number>) {
  return `*${parts.length}\r\n` + parts.map((part) => {
    const text = String(part);
    return `$${Buffer.byteLength(text)}\r\n${text}\r\n`;
  }).join("");
}

function parseLastResp(text: string): unknown {
  const values: unknown[] = [];
  let index = 0;
  const parseOne = (): unknown => {
    const type = text[index++];
    const end = text.indexOf("\r\n", index);
    const line = text.slice(index, end);
    index = end + 2;
    if (type === "+") return line;
    if (type === "-") return new Error(line);
    if (type === ":") return Number(line);
    if (type === "$") {
      const len = Number(line);
      if (len < 0) return null;
      const value = text.slice(index, index + len);
      index += len + 2;
      return value;
    }
    if (type === "*") {
      const count = Number(line);
      const arr = [];
      for (let i = 0; i < count; i += 1) arr.push(parseOne());
      return arr;
    }
    return null;
  };
  while (index < text.length) values.push(parseOne());
  return values.at(-1);
}

class RedisRuntimeStore implements RuntimeStore {
  mode = "redis" as const;
  private client: RedisRespClient;
  private log: Logger;

  constructor(redisUrl: string, log: Logger) {
    this.client = new RedisRespClient(redisUrl);
    this.log = log;
  }

  async ready() {
    try {
      const pong = await this.client.command<string>("PING");
      return { ok: pong === "PONG", message: "redis adapter" };
    } catch (error) {
      return { ok: false, message: `redis unavailable: ${(error as Error).message}` };
    }
  }

  async rateLimit(key: string, limit: number, windowMs: number) {
    const redisKey = `zenjo:rate:${key}`;
    const count = Number(await this.client.command<number>("INCR", redisKey));
    if (count === 1) await this.client.command("PEXPIRE", redisKey, windowMs);
    const ttl = Number(await this.client.command<number>("PTTL", redisKey));
    return { allowed: count <= limit, count, remaining: Math.max(0, limit - count), resetAt: Date.now() + Math.max(ttl, 0) };
  }

  async recordMetric(route: string, durationMs: number, isError: boolean) {
    const key = `zenjo:metric:${Buffer.from(route).toString("base64url")}`;
    await this.client.command("HINCRBY", key, "count", 1);
    await this.client.command("HINCRBY", key, "totalMs", Math.round(durationMs));
    await this.client.command("HINCRBY", key, "errors", isError ? 1 : 0);
    const currentMax = Number(await this.client.command<string>("HGET", key, "maxMs") || 0);
    if (durationMs > currentMax) await this.client.command("HSET", key, "maxMs", Math.round(durationMs));
    await this.client.command("HSET", key, "route", route);
  }

  async metrics() {
    const keys = await this.keys("zenjo:metric:*");
    const out: Record<string, Metric> = {};
    for (const key of keys) {
      const rows = await this.client.command<string[]>("HGETALL", key);
      const map: Record<string, string> = {};
      for (let i = 0; i < rows.length; i += 2) map[rows[i]] = rows[i + 1];
      const route = map.route || key;
      out[route] = {
        count: Number(map.count || 0),
        totalMs: Number(map.totalMs || 0),
        maxMs: Number(map.maxMs || 0),
        errors: Number(map.errors || 0),
      };
    }
    return out;
  }

  async getJson<T>(key: string) {
    const raw = await this.client.command<string | null>("GET", `zenjo:json:${key}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      this.log({ level: "error", event: "redis_json_parse_failed", key, error: (error as Error).message });
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number) {
    const redisKey = `zenjo:json:${key}`;
    const payload = JSON.stringify(value);
    if (ttlSeconds) await this.client.command("SET", redisKey, payload, "EX", ttlSeconds);
    else await this.client.command("SET", redisKey, payload);
  }

  async delete(key: string) {
    await this.client.command("DEL", `zenjo:json:${key}`);
  }

  async keys(pattern: string) {
    const redisPattern = pattern.startsWith("zenjo:") ? pattern : `zenjo:json:${pattern}`;
    return await this.client.command<string[]>("KEYS", redisPattern);
  }
}

export function createRuntimeStore(mode: "memory" | "redis", redisUrl: string | undefined, log: Logger): RuntimeStore {
  if (mode === "redis" && redisUrl) return new RedisRuntimeStore(redisUrl, log);
  return new MemoryRuntimeStore();
}
