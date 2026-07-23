export {};

export interface DesktopUpdateState {
  enabled: boolean;
  currentVersion: string;
  phase: "disabled" | "idle" | "checking" | "available" | "downloading" | "downloaded" | "up-to-date" | "error";
  availableVersion?: string;
  percent?: number;
  message: string;
}

export interface DesktopCredentialStatus {
  available: boolean;
  configured: string[];
  migrated: string[];
  storagePath: string;
}

declare global {
  interface Window {
    vibeDesktop?: {
      isDesktop: boolean;
      copyText?: (text: string) => Promise<boolean>;
      restartBackend: () => Promise<boolean>;
      getCredentialStatus: () => Promise<DesktopCredentialStatus>;
      setCredential: (name: string, value: string | null) => Promise<DesktopCredentialStatus>;
      importCredentialsAndRestart: () => Promise<DesktopCredentialStatus>;
      getUpdateState: () => Promise<DesktopUpdateState>;
      checkForUpdates: () => Promise<DesktopUpdateState>;
      downloadUpdate: () => Promise<DesktopUpdateState>;
      installUpdate: () => Promise<boolean>;
      onUpdateState: (callback: (state: DesktopUpdateState) => void) => () => void;
    };
  }
}
