import "server-only";

import { getDeploymentMode } from "../security/deployment";

export interface ServerJsonStore<T> {
  get(): Promise<T>;
  set(value: T): Promise<void>;
  clear?(): void;
}

interface MemoryStore<T> {
  read: () => T;
  write: (value: T) => void;
  clear: () => void;
}

interface ServerJsonStoreOptions<T> {
  key: string;
  normalize: (value: unknown) => T;
  memory: MemoryStore<T>;
}

const SHARED_STORE_ERROR =
  "MODEL_PROVIDER_STORE=upstash with Upstash credentials is required for server configuration in hosted mode";

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

function isSharedStoreName(store: string): boolean {
  return store === "upstash" || store === "redis" || store === "kv";
}

class UpstashJsonStore<T> implements ServerJsonStore<T> {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly key: string,
    private readonly normalize: (value: unknown) => T,
  ) {}

  private endpoint(path: string): string {
    return `${this.url.replace(/\/+$/, "")}/${path}`;
  }

  async get(): Promise<T> {
    const response = await fetch(
      this.endpoint(`get/${encodeURIComponent(this.key)}`),
      { headers: { Authorization: `Bearer ${this.token}` }, cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(
        `Server config store failed with status ${response.status}`,
      );
    }
    const data = (await response.json()) as { result?: string | null };
    return this.normalize(data.result ? JSON.parse(data.result) : null);
  }

  async set(value: T): Promise<void> {
    const response = await fetch(this.endpoint("set"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([this.key, JSON.stringify(value)]),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(
        `Server config store failed with status ${response.status}`,
      );
    }
  }
}

function createMemoryStore<T>(memory: MemoryStore<T>): ServerJsonStore<T> {
  return {
    async get() {
      return memory.read();
    },
    async set(value) {
      memory.write(value);
    },
    clear() {
      memory.clear();
    },
  };
}

export function createServerJsonStore<T>(
  options: ServerJsonStoreOptions<T>,
): ServerJsonStore<T> {
  const store = env("MODEL_PROVIDER_STORE").toLowerCase();
  const url = env("UPSTASH_REDIS_REST_URL");
  const token = env("UPSTASH_REDIS_REST_TOKEN");
  if (isSharedStoreName(store) && url && token) {
    return new UpstashJsonStore(url, token, options.key, options.normalize);
  }
  if (isSharedStoreName(store) || getDeploymentMode() !== "local") {
    throw new Error(SHARED_STORE_ERROR);
  }
  return createMemoryStore(options.memory);
}
