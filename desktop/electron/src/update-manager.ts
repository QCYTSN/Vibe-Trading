import { app, BrowserWindow } from "electron";
import * as electronUpdater from "electron-updater";
import type { AppUpdater, ProgressInfo, UpdateInfo } from "electron-updater";
import { readFileSync } from "node:fs";
import path from "node:path";

export type UpdateState = {
  enabled: boolean;
  currentVersion: string;
  phase: "disabled" | "idle" | "checking" | "available" | "downloading" | "downloaded" | "up-to-date" | "error";
  availableVersion?: string;
  percent?: number;
  message: string;
};

export class DesktopUpdateManager {
  private readonly updater: AppUpdater;
  private state: UpdateState;

  constructor(private readonly window: () => BrowserWindow | undefined) {
    const { autoUpdater } = electronUpdater;
    this.updater = autoUpdater;
    const enabled = app.isPackaged && process.platform === "win32" && releaseConfigured();
    this.state = {
      enabled,
      currentVersion: app.getVersion(),
      phase: enabled ? "idle" : "disabled",
      message: enabled ? "可手动检查 GitHub Releases 更新。" : "自动更新仅在已安装的 Windows 版本中启用。",
    };
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = true;
    this.bindEvents();
  }

  snapshot(): UpdateState {
    return { ...this.state };
  }

  async check(): Promise<UpdateState> {
    this.assertEnabled();
    this.setState({ phase: "checking", message: "正在检查更新…", percent: undefined });
    await this.updater.checkForUpdates();
    return this.snapshot();
  }

  async download(): Promise<UpdateState> {
    this.assertEnabled();
    if (this.state.phase !== "available" && this.state.phase !== "error") {
      throw new Error("当前没有可下载的更新。");
    }
    this.setState({ phase: "downloading", message: "正在下载更新…", percent: 0 });
    await this.updater.downloadUpdate();
    return this.snapshot();
  }

  install(): void {
    this.assertEnabled();
    if (this.state.phase !== "downloaded") throw new Error("更新尚未下载完成。");
    this.updater.quitAndInstall(false, true);
  }

  private bindEvents(): void {
    this.updater.on("checking-for-update", () => this.setState({ phase: "checking", message: "正在检查更新…" }));
    this.updater.on("update-available", (info: UpdateInfo) => this.setState({
      phase: "available",
      availableVersion: info.version,
      message: `发现版本 ${info.version}，等待下载。`,
    }));
    this.updater.on("update-not-available", () => this.setState({
      phase: "up-to-date",
      availableVersion: undefined,
      message: "当前已经是最新版本。",
    }));
    this.updater.on("download-progress", (progress: ProgressInfo) => this.setState({
      phase: "downloading",
      percent: Math.max(0, Math.min(100, progress.percent)),
      message: `正在下载更新 · ${progress.percent.toFixed(1)}%`,
    }));
    this.updater.on("update-downloaded", (info: UpdateInfo) => this.setState({
      phase: "downloaded",
      availableVersion: info.version,
      percent: 100,
      message: `版本 ${info.version} 已下载，重启后完成安装。`,
    }));
    this.updater.on("error", (error: Error) => this.setState({
      phase: "error",
      message: `更新失败：${error.message}`,
    }));
  }

  private setState(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch };
    this.window()?.webContents.send("desktop:update-state", this.snapshot());
  }

  private assertEnabled(): void {
    if (!this.state.enabled) throw new Error(this.state.message);
  }
}

function releaseConfigured(): boolean {
  try {
    const config = JSON.parse(readFileSync(path.join(__dirname, "release-config.json"), "utf8")) as { enabled?: boolean };
    return config.enabled === true;
  } catch {
    return false;
  }
}
