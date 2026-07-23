import { contextBridge, ipcRenderer } from "electron";

const apiKey = ipcRenderer.sendSync("desktop:get-api-auth-key");
if (
  typeof apiKey === "string" &&
  apiKey.length > 0 &&
  location.protocol === "http:" &&
  ["127.0.0.1", "localhost", "::1"].includes(location.hostname)
) {
  localStorage.setItem("vibe_trading_api_auth_key", apiKey);
}

contextBridge.exposeInMainWorld("vibeDesktop", {
  isDesktop: true,
  onStatus: (callback: (message: string) => void) => {
    ipcRenderer.on("desktop:status", (_event, message: string) => callback(message));
  },
  onError: (callback: (message: string) => void) => {
    ipcRenderer.on("desktop:error", (_event, message: string) => callback(message));
  },
  retry: () => ipcRenderer.send("desktop:retry"),
  openLogs: () => ipcRenderer.send("desktop:open-logs"),
  copyText: (text: string) => ipcRenderer.invoke("desktop:copy-text", text) as Promise<boolean>,
  restartBackend: () => ipcRenderer.invoke("desktop:restart-backend") as Promise<boolean>,
  getCredentialStatus: () => ipcRenderer.invoke("desktop:get-credential-status"),
  setCredential: (name: string, value: string | null) => ipcRenderer.invoke("desktop:set-credential", name, value),
  importCredentialsAndRestart: () => ipcRenderer.invoke("desktop:import-credentials-and-restart"),
  getUpdateState: () => ipcRenderer.invoke("desktop:get-update-state"),
  checkForUpdates: () => ipcRenderer.invoke("desktop:check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("desktop:download-update"),
  installUpdate: () => ipcRenderer.invoke("desktop:install-update"),
  onUpdateState: (callback: (state: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
    ipcRenderer.on("desktop:update-state", listener);
    return () => ipcRenderer.removeListener("desktop:update-state", listener);
  },
});
