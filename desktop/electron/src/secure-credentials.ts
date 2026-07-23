import { app, safeStorage } from "electron";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

type CredentialFile = {
  version: 1;
  values: Record<string, string>;
};

const ENV_CREDENTIALS = new Set([
  "OPENROUTER_API_KEY",
  "REQUESTY_API_KEY",
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "NVIDIA_API_KEY",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "DASHSCOPE_API_KEY",
  "ZHIPU_API_KEY",
  "MOONSHOT_API_KEY",
  "KIMI_CODING_API_KEY",
  "MINIMAX_API_KEY",
  "MIMO_API_KEY",
  "ZAI_API_KEY",
  "TUSHARE_TOKEN",
  "QVERIS_API_KEY",
  "VIBE_TRADING_WEIXIN_TOKEN",
]);

const PLACEHOLDER_VALUES = new Set([
  "",
  "sk-or-v1-your-key-here",
  "sk-or-...here",
  "sk-xxx",
  "xxx",
  "gsk_xxx",
  "your-tushare-token",
]);

export type CredentialStatus = {
  available: boolean;
  configured: string[];
  migrated: string[];
  storagePath: string;
};

export class SecureCredentialStore {
  private readonly filePath = path.join(app.getPath("userData"), "credentials.v1.json");
  private values: Record<string, string> = {};
  private migrated: string[] = [];

  async initialize(): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Windows credential encryption is unavailable for this user session.");
    }
    await this.load();
    await this.migrateDotenv(path.join(os.homedir(), ".vibe-trading", ".env"));
    await this.migrateQVeris(path.join(os.homedir(), ".vibe-trading", "qveris.json"));
    await this.migrateWeixin(path.join(os.homedir(), ".vibe-trading", "weixin", "account.json"));
    await this.migrateChannelConfig(path.join(os.homedir(), ".vibe-trading", "agent.json"));
  }

  status(): CredentialStatus {
    return {
      available: safeStorage.isEncryptionAvailable(),
      configured: Object.keys(this.values).sort(),
      migrated: [...this.migrated],
      storagePath: this.filePath,
    };
  }

  has(name: string): boolean {
    this.assertAllowed(name);
    return Boolean(this.values[name]);
  }

  async set(name: string, value: string | null): Promise<void> {
    this.assertAllowed(name);
    const normalized = value?.trim() ?? "";
    if (!normalized) {
      delete this.values[name];
    } else {
      this.values[name] = safeStorage.encryptString(normalized).toString("base64");
    }
    await this.persist();
  }

  environment(): NodeJS.ProcessEnv {
    const output: NodeJS.ProcessEnv = {};
    const channelSecrets: Record<string, Record<string, string>> = {};
    for (const name of Object.keys(this.values)) {
      const value = this.decrypt(name);
      if (!value) continue;
      const channelMatch = name.match(/^CHANNEL:([a-z0-9_]{1,64}):([A-Za-z0-9_.]{1,128})$/u);
      if (channelMatch) {
        channelSecrets[channelMatch[1]] ??= {};
        channelSecrets[channelMatch[1]][channelMatch[2]] = value;
      } else {
        output[name] = value;
      }
    }
    if (Object.keys(channelSecrets).length) {
      output.VIBE_TRADING_DESKTOP_CHANNEL_SECRETS_JSON = JSON.stringify(channelSecrets);
    }
    return output;
  }

  private decrypt(name: string): string {
    try {
      return safeStorage.decryptString(Buffer.from(this.values[name], "base64"));
    } catch {
      return "";
    }
  }

  private assertAllowed(name: string): void {
    if (!ENV_CREDENTIALS.has(name) && !/^CHANNEL:[a-z0-9_]{1,64}:[A-Za-z0-9_.]{1,128}$/u.test(name)) {
      throw new Error("Unsupported credential key");
    }
  }

  private async load(): Promise<void> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, "utf8")) as CredentialFile;
      if (parsed.version === 1 && parsed.values && typeof parsed.values === "object") {
        this.values = parsed.values;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify({ version: 1, values: this.values }, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await fs.rename(temporary, this.filePath);
  }

  private async migrateDotenv(filePath: string): Promise<void> {
    let text: string;
    try {
      text = await fs.readFile(filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    let changed = false;
    const nextLines: string[] = [];
    for (const line of text.split(/\r?\n/u)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/u);
      const name = match?.[1] ?? "";
      const value = unquote(match?.[2] ?? "");
      if (ENV_CREDENTIALS.has(name) && !PLACEHOLDER_VALUES.has(value.toLowerCase())) {
        if (!this.values[name]) {
          this.values[name] = safeStorage.encryptString(value).toString("base64");
          this.migrated.push(name);
        }
        nextLines.push(`# ${name} is stored by Vibe-Trading Desktop secure storage.`);
        changed = true;
      } else {
        nextLines.push(line);
      }
    }
    if (changed) {
      await this.persist();
      await atomicTextWrite(filePath, nextLines.join("\n"));
    }
  }

  private async migrateQVeris(filePath: string): Promise<void> {
    await this.migrateJsonField(filePath, "api_key", "QVERIS_API_KEY");
  }

  private async migrateWeixin(filePath: string): Promise<void> {
    await this.migrateJsonField(filePath, "token", "VIBE_TRADING_WEIXIN_TOKEN");
  }

  private async migrateJsonField(filePath: string, field: string, credential: string): Promise<void> {
    try {
      const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>;
      const value = typeof parsed[field] === "string" ? parsed[field].trim() : "";
      if (!value) return;
      if (!this.values[credential]) {
        this.values[credential] = safeStorage.encryptString(value).toString("base64");
        this.migrated.push(credential);
        await this.persist();
      }
      delete parsed[field];
      await atomicTextWrite(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    }
  }

  private async migrateChannelConfig(filePath: string): Promise<void> {
    try {
      const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>;
      const channels = parsed.channels;
      if (!channels || typeof channels !== "object" || Array.isArray(channels)) return;
      let changed = false;
      for (const [channel, rawSection] of Object.entries(channels as Record<string, unknown>)) {
        if (!rawSection || typeof rawSection !== "object" || Array.isArray(rawSection)) continue;
        for (const [field, rawValue] of Object.entries(rawSection as Record<string, unknown>)) {
          if (!isSecretField(field) || typeof rawValue !== "string" || !rawValue.trim()) continue;
          const key = `CHANNEL:${channel}:${field}`;
          if (!this.values[key]) {
            this.values[key] = safeStorage.encryptString(rawValue.trim()).toString("base64");
            this.migrated.push(key);
          }
          delete (rawSection as Record<string, unknown>)[field];
          changed = true;
        }
      }
      if (changed) {
        await this.persist();
        await atomicTextWrite(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    }
  }
}

function isSecretField(name: string): boolean {
  return /(token|secret|password|api_key|private_key|signing)/iu.test(name);
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

async function atomicTextWrite(filePath: string, content: string): Promise<void> {
  const temporary = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, filePath);
}
