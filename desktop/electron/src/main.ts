import { randomBytes } from "node:crypto";
import path from "node:path";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  session,
  shell,
} from "electron";
import { BackendManager } from "./backend-manager";
import { SecureCredentialStore } from "./secure-credentials";
import { DesktopUpdateManager } from "./update-manager";

let mainWindow: BrowserWindow | undefined;
let backend: BackendManager | undefined;
let bootPromise: Promise<void> | undefined;
let quitting = false;
const credentialStore = new SecureCredentialStore();
let updateManager: DesktopUpdateManager | undefined;
const apiAuthKey = randomBytes(32).toString("base64url");

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  void app.whenReady().then(ready).catch((error) => {
    dialog.showErrorBox("Vibe-Trading Desktop 启动失败", errorText(error));
  });
}

async function ready(): Promise<void> {
  nativeTheme.themeSource = "dark";
  app.setAppLogsPath();
  try {
    await credentialStore.initialize();
  } catch (error) {
    dialog.showErrorBox("安全存储不可用", errorText(error));
  }
  createWindow();
  updateManager = new DesktopUpdateManager(() => mainWindow);
  registerIpc();
  createMenu();
  await showLoadingPage();
  void boot();
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: "#0b0f14",
    title: "Vibe-Trading Desktop Community",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    void shutdownAndQuit();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const currentOrigin = backend?.url ? new URL(backend.url).origin : undefined;
    if (currentOrigin && new URL(url).origin === currentOrigin) return;
    event.preventDefault();
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
}

function registerIpc(): void {
  ipcMain.on("desktop:get-api-auth-key", (event) => { event.returnValue = apiAuthKey; });
  ipcMain.on("desktop:retry", () => void boot());
  ipcMain.on("desktop:open-logs", () => void shell.openPath(app.getPath("logs")));
  ipcMain.handle("desktop:restart-backend", async (event) => {
    assertMainWindowSender(event.sender);
    await boot();
    return true;
  });
  ipcMain.handle("desktop:get-credential-status", (event) => {
    assertMainWindowSender(event.sender);
    return credentialStore.status();
  });
  ipcMain.handle("desktop:set-credential", async (event, name: unknown, value: unknown) => {
    assertMainWindowSender(event.sender);
    if (typeof name !== "string" || (typeof value !== "string" && value !== null)) {
      throw new Error("Invalid credential request");
    }
    await credentialStore.set(name, value);
    return credentialStore.status();
  });
  ipcMain.handle("desktop:import-credentials-and-restart", async (event) => {
    assertMainWindowSender(event.sender);
    await credentialStore.initialize();
    await boot();
    return credentialStore.status();
  });
  ipcMain.handle("desktop:get-update-state", (event) => {
    assertMainWindowSender(event.sender);
    return updateManager?.snapshot();
  });
  ipcMain.handle("desktop:check-for-updates", async (event) => {
    assertMainWindowSender(event.sender);
    return updateManager?.check();
  });
  ipcMain.handle("desktop:download-update", async (event) => {
    assertMainWindowSender(event.sender);
    return updateManager?.download();
  });
  ipcMain.handle("desktop:install-update", (event) => {
    assertMainWindowSender(event.sender);
    updateManager?.install();
    return true;
  });
  ipcMain.handle("desktop:copy-text", (event, value: unknown) => {
    assertMainWindowSender(event.sender);
    if (typeof value !== "string" || value.length > 10_000_000) {
      throw new Error("Clipboard text is invalid or too large");
    }
    clipboard.writeText(value);
    return true;
  });
}

async function showLoadingPage(): Promise<void> {
  if (!mainWindow) return;
  await mainWindow.loadFile(path.join(__dirname, "loading.html"));
}

function boot(): Promise<void> {
  if (bootPromise) return bootPromise;
  bootPromise = bootInternal().finally(() => { bootPromise = undefined; });
  return bootPromise;
}

async function bootInternal(): Promise<void> {
  if (!mainWindow) return;
  await backend?.stop();
  if (!mainWindow.webContents.getURL().startsWith("file:")) await showLoadingPage();

  backend = new BackendManager({
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    logDirectory: app.getPath("logs"),
    apiAuthKey,
    credentialEnvironment: credentialStore.environment(),
    onStatus: (message) => mainWindow?.webContents.send("desktop:status", message),
    onUnexpectedExit: (message) => {
      if (!quitting) void reportBootError(message);
    },
  });

  try {
    const url = await backend.start();
    await mainWindow.loadURL(url);
  } catch (error) {
    await backend.stop();
    await reportBootError(errorText(error));
  }
}

async function reportBootError(message: string): Promise<void> {
  if (!mainWindow) return;
  if (!mainWindow.webContents.getURL().startsWith("file:")) await showLoadingPage();
  mainWindow.webContents.send("desktop:error", message);
}

function createMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "应用",
      submenu: [
        { label: "重启本地服务", click: () => void boot() },
        { label: "打开日志文件夹", click: () => void shell.openPath(app.getPath("logs")) },
        { label: "检查更新", click: () => void updateManager?.check() },
        { type: "separator" },
        { role: "quit", label: "退出" },
      ],
    },
    {
      label: "视图",
      submenu: [
        { role: "reload", label: "刷新" },
        { role: "toggleDevTools", label: "开发者工具" },
        { type: "separator" },
        { role: "resetZoom", label: "实际大小" },
        { role: "zoomIn", label: "放大" },
        { role: "zoomOut", label: "缩小" },
        { role: "togglefullscreen", label: "全屏" },
      ],
    },
  ]));
}

function assertMainWindowSender(sender: Electron.WebContents): void {
  if (sender !== mainWindow?.webContents) throw new Error("Desktop request rejected");
}

async function shutdownAndQuit(): Promise<void> {
  if (quitting) return;
  quitting = true;
  mainWindow?.webContents.send("desktop:status", "正在关闭本地服务…");
  await backend?.stop();
  app.quit();
}

function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const protocol = new URL(rawUrl).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") void shutdownAndQuit();
});

process.on("uncaughtException", (error) => {
  dialog.showErrorBox("Vibe-Trading Desktop", error.stack ?? error.message);
});
