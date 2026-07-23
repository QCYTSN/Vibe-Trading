import { useEffect, useState } from "react";
import { Download, Loader2, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { DesktopUpdateState } from "@/desktop";

export function DesktopUpdateSettings() {
  const desktop = window.vibeDesktop;
  const [state, setState] = useState<DesktopUpdateState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!desktop || typeof desktop.getUpdateState !== "function" || typeof desktop.onUpdateState !== "function") return;
    let alive = true;
    void desktop.getUpdateState().then((next) => { if (alive) setState(next); });
    const unsubscribe = desktop.onUpdateState((next) => { if (alive) setState(next); });
    return () => { alive = false; unsubscribe(); };
  }, [desktop]);

  if (!desktop || !state || typeof desktop.checkForUpdates !== "function") return null;

  const run = async (action: "check" | "download" | "install") => {
    setBusy(true);
    try {
      if (action === "check") setState(await desktop.checkForUpdates());
      if (action === "download") setState(await desktop.downloadUpdate());
      if (action === "install") await desktop.installUpdate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新操作失败");
    } finally {
      setBusy(false);
    }
  };

  const checking = busy || state.phase === "checking" || state.phase === "downloading";

  return (
    <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">桌面应用更新</h2>
            <span className="rounded-full border bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
              v{state.currentVersion}
            </span>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">{state.message}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!state.enabled || checking}
            onClick={() => void run("check")}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state.phase === "checking" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            检查更新
          </button>
          {state.phase === "available" ? (
            <button type="button" disabled={busy} onClick={() => void run("download")} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
              <Download className="h-4 w-4" />下载 {state.availableVersion}
            </button>
          ) : null}
          {state.phase === "downloaded" ? (
            <button type="button" disabled={busy} onClick={() => void run("install")} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
              <RotateCcw className="h-4 w-4" />重启并安装
            </button>
          ) : null}
        </div>
      </div>
      {state.phase === "downloading" ? (
        <div className="h-1 bg-muted">
          <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${state.percent ?? 0}%` }} />
        </div>
      ) : null}
    </section>
  );
}
