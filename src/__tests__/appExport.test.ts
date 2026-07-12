import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { appDbMock, storedItems } = vi.hoisted(() => {
  const storedItems = new Map<string, unknown>();
  const appDbMock = {
    getItem: vi.fn(async (key: string) => storedItems.get(key)),
    keys: vi.fn(async () => [...storedItems.keys()]),
  };

  return { appDbMock, storedItems };
});

vi.mock("../store/storage/storageConfig", () => ({
  appDb: appDbMock,
  STORAGE_KEYS: {
    CORE_SETTINGS: "neo-chat-core-settings",
    SETTINGS: "neo-chat-settings",
    CHAT: "neo-chat-storage",
    KNOWLEDGE: "knowledge-storage",
    MEMORY: "neo-chat-memory",
  },
  STORAGE_VERSION: 4,
}));

import {
  APP_EXPORT_VERSION,
  collectOrphanOpfsUrls,
  collectReferencedOpfsUrls,
  createAppExportPayload,
  createBrowserAppExportPayload,
} from "../lib/data/appExport";
import { enqueueSessionMessageWrite } from "../store/sessionMessagePersistence";
import { STORAGE_VERSION } from "../store/storage/storageConfig";

describe("app export helpers", () => {
  beforeEach(() => {
    storedItems.clear();
    vi.clearAllMocks();
    appDbMock.getItem.mockImplementation(async (key: string) =>
      storedItems.get(key),
    );
    appDbMock.keys.mockImplementation(async () => [...storedItems.keys()]);
    vi.stubGlobal("window", {
      localStorage: { getItem: vi.fn(() => null) },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a versioned references-only export payload", () => {
    const sessionMessages = { s1: { nodesById: {}, rootMessageIds: [] } };
    const payload = createAppExportPayload({
      exportedAt: "2026-07-01T00:00:00.000Z",
      coreSettings: { theme: "dark" },
      settings: { activePlugins: ["weather"] },
      chat: { sessions: [{ id: "s1", title: "Chat" }] },
      sessionMessages,
      knowledge: { collections: [] },
      memory: { memories: [{ id: "mem-1" }] },
    });

    expect(APP_EXPORT_VERSION).toBe(2);
    expect(payload).toEqual({
      exportVersion: 2,
      storageVersion: STORAGE_VERSION,
      exportedAt: "2026-07-01T00:00:00.000Z",
      metadata: {
        opfs: { mode: "references-only", includesBlobs: false },
      },
      data: {
        coreSettings: { theme: "dark" },
        settings: { activePlugins: ["weather"] },
        chat: { sessions: [{ id: "s1", title: "Chat" }] },
        sessionMessages,
        knowledge: { collections: [] },
        memory: { memories: [{ id: "mem-1" }] },
      },
    });
  });

  it("exports every stored session tree, including orphan records", async () => {
    const storedTree = { nodesById: { message1: { id: "message1" } } };
    const orphanTree = { nodesById: {}, rootMessageIds: [] };
    storedItems.set("neo-chat-storage", JSON.stringify({ sessions: ["s1"] }));
    storedItems.set("session_messages_s1", storedTree);
    storedItems.set("session_messages_orphan", orphanTree);
    storedItems.set("unrelated-record", { ignored: true });

    const payload = await createBrowserAppExportPayload();

    expect(payload.data.chat).toEqual({ sessions: ["s1"] });
    expect(payload.data.sessionMessages).toEqual({
      s1: storedTree,
      orphan: orphanTree,
    });
    expect(appDbMock.getItem).not.toHaveBeenCalledWith("unrelated-record");
  });

  it("waits for pending writes before enumerating export data", async () => {
    const latestTree = { nodesById: {}, rootMessageIds: [] };
    let resolveWrite: (() => void) | undefined;
    const write = enqueueSessionMessageWrite(
      "pending-session",
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = () => {
            storedItems.set("session_messages_pending-session", latestTree);
            resolve();
          };
        }),
    );

    const exportPromise = createBrowserAppExportPayload();
    await Promise.resolve();
    expect(appDbMock.keys).not.toHaveBeenCalled();

    resolveWrite?.();
    await write;
    const payload = await exportPromise;

    expect(payload.data.sessionMessages).toEqual({
      "pending-session": latestTree,
    });
  });

  it("rejects when any session tree cannot be read", async () => {
    storedItems.set("session_messages_broken", {});
    appDbMock.getItem.mockRejectedValueOnce(new Error("IndexedDB read failed"));

    await expect(createBrowserAppExportPayload()).rejects.toThrow(
      "IndexedDB read failed",
    );
  });

  it("collects exported session-tree OPFS references and orphans", () => {
    const referenced = collectReferencedOpfsUrls({
      chat: {
        workspaces: [{ files: [{ url: "opfs://workspaces/w1/preset.txt" }] }],
      },
      sessionMessages: {
        s1: {
          attachments: [
            { url: "opfs://chat/s1/attachment.txt" },
            { displayCache: { opfsUrl: "opfs://images/generated/a.png" } },
          ],
        },
      },
      knowledge: {
        collections: [
          { files: [{ path: "opfs://knowledge-base/c1/local.md" }] },
        ],
      },
    });

    expect([...referenced].sort()).toEqual([
      "opfs://chat/s1/attachment.txt",
      "opfs://images/generated/a.png",
      "opfs://knowledge-base/c1/local.md",
      "opfs://workspaces/w1/preset.txt",
    ]);
    expect(
      collectOrphanOpfsUrls({
        existingUrls: [
          "opfs://chat/s1/attachment.txt",
          "opfs://chat/s1/orphan.txt",
          "opfs://external/outside.txt",
        ],
        referencedUrls: referenced,
      }),
    ).toEqual(["opfs://chat/s1/orphan.txt"]);
  });
});
