import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PreferencesManager } from "../core/preferences-manager.ts";
import { UniversalMediaManager } from "../core/media/universal-media-manager.ts";
import { SessionFileRegistry } from "../lib/session-files/session-file-registry.ts";

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hana-universal-media-"));
}

function writeLegacyImageConfig(root, global) {
  const dir = path.join(root, "plugin-data", "image-gen");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({
    schemaVersion: 1,
    global,
    agents: {},
    sessions: {},
  }, null, 2));
}

function makePreferences(root, initial: any = null) {
  const userDir = path.join(root, "user");
  const agentsDir = path.join(root, "agents");
  fs.mkdirSync(userDir, { recursive: true });
  if (initial) {
    fs.writeFileSync(path.join(userDir, "preferences.json"), JSON.stringify(initial, null, 2));
  }
  return new PreferencesManager({ userDir, agentsDir });
}

function makeManager(root, preferences, extra: any = {}) {
  return new UniversalMediaManager({
    hanakoHome: root,
    preferences,
    sessionFiles: extra.sessionFiles,
    providerRegistry: {
      getMediaProviders: () => [],
      resolveMediaModel: () => {
        throw new Error("not configured");
      },
    },
    registerSessionFile: () => {},
  });
}

function makeSessionPath(root, name = "session.jsonl") {
  const dir = path.join(root, "agents", "hana", "sessions");
  fs.mkdirSync(dir, { recursive: true });
  const sessionPath = path.join(dir, name);
  fs.writeFileSync(sessionPath, "{}\n");
  return sessionPath;
}

function makeTempFile(root, name, content = "bytes") {
  const filePath = path.join(root, name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe("UniversalMediaManager image config migration", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("merges legacy image-gen config into native preferences before native config shadows it", () => {
    const root = makeRoot();
    roots.push(root);
    writeLegacyImageConfig(root, {
      defaultImageModel: { provider: "legacy-provider", id: "legacy-model" },
      providerDefaults: {
        openai: { quality: "high" },
        dashscope: { watermark: false },
      },
    });
    const preferences = makePreferences(root, {
      imageGeneration: {
        defaultImageModel: { provider: "native-provider", id: "native-model" },
        providerDefaults: {
          openai: { size: "1024x1024" },
        },
      },
    });

    const manager = makeManager(root, preferences);

    expect(manager.getImageConfig()).toEqual({
      defaultImageModel: { provider: "native-provider", id: "native-model" },
      providerDefaults: {
        openai: { quality: "high", size: "1024x1024" },
        dashscope: { watermark: false },
      },
    });
    expect(preferences.getPreferences()).toMatchObject({
      _imageGenerationLegacyConfigMigrated: true,
      imageGeneration: {
        defaultImageModel: { provider: "native-provider", id: "native-model" },
        providerDefaults: {
          openai: { quality: "high", size: "1024x1024" },
          dashscope: { watermark: false },
        },
      },
    });
  });

  it("does not resurrect legacy defaults after migration has been marked", () => {
    const root = makeRoot();
    roots.push(root);
    writeLegacyImageConfig(root, {
      defaultImageModel: { provider: "legacy-provider", id: "legacy-model" },
      providerDefaults: { openai: { quality: "high" } },
    });
    const preferences = makePreferences(root);
    const manager = makeManager(root, preferences);

    manager.setImageConfig({ defaultImageModel: undefined });

    expect(manager.getImageConfig()).toEqual({
      providerDefaults: { openai: { quality: "high" } },
    });
    expect(preferences.getPreferences()).toMatchObject({
      _imageGenerationLegacyConfigMigrated: true,
      imageGeneration: {
        providerDefaults: { openai: { quality: "high" } },
      },
    });
  });
});

describe("UniversalMediaManager plugin image input boundary", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("resolves plugin referenceImages through session-owned SessionFile records", async () => {
    const root = makeRoot();
    roots.push(root);
    const preferences = makePreferences(root);
    const sessionFiles = new SessionFileRegistry();
    const sessionPath = makeSessionPath(root, "image-session.jsonl");
    const imagePath = makeTempFile(root, "refs/cover.png", "png");
    const image = sessionFiles.registerFile({
      sessionPath,
      filePath: imagePath,
      origin: "user_upload",
      storageKind: "managed_cache",
    });
    const manager = makeManager(root, preferences, { sessionFiles });
    (manager as any).submitImage = async (payload) => ({
      ok: true,
      input: payload.input,
      sessionPath: payload.sessionPath,
    });

    const result = await manager.generateImageFromBus({
      sessionPath,
      prompt: "draw",
      referenceImages: [{ kind: "session_file", fileId: image.id }],
    });

    expect(result).toMatchObject({
      ok: true,
      sessionPath,
      input: {
        prompt: "draw",
        referenceImages: [imagePath],
        image: [imagePath],
      },
    });
  });

  it("rejects plugin referenceImages that are raw strings instead of SessionFile references", async () => {
    const root = makeRoot();
    roots.push(root);
    const manager = makeManager(root, makePreferences(root), {
      sessionFiles: new SessionFileRegistry(),
    });
    (manager as any).submitImage = async () => {
      throw new Error("submitImage should not run for invalid references");
    };

    await expect(manager.generateImageFromBus({
      sessionPath: makeSessionPath(root, "unsafe-image-session.jsonl"),
      prompt: "draw",
      referenceImages: ["/tmp/private.png"],
    })).rejects.toThrow(/session_file/);
  });
});
