import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, KeyRound, Loader2, MessageSquareMore, Play, RefreshCw, Save, Square } from "lucide-react";
import { toast } from "sonner";
import { api, type ChannelCatalogItem, type ChannelRuntimeStatus, type WeixinLoginState } from "@/lib/api";

const fieldClass = "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60";

export function ChannelCenter() {
  const [status, setStatus] = useState<ChannelRuntimeStatus | null>(null);
  const [catalog, setCatalog] = useState<ChannelCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [nextStatus, nextCatalog] = await Promise.all([api.getChannelStatus(), api.getChannelCatalog()]);
      setStatus(nextStatus);
      setCatalog(nextCatalog.channels);
    } catch (error) {
      toast.error(`无法读取通道状态：${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const startStop = async (next: "start" | "stop") => {
    setAction(next);
    try {
      setStatus(next === "start" ? await api.startChannels() : await api.stopChannels());
      toast.success(next === "start" ? "已启动已启用的通道" : "通道运行时已停止");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "通道操作失败");
    } finally {
      setAction(null);
    }
  };

  const rows = useMemo(() => catalog.map((item) => ({
    ...item,
    runtime: status?.channels?.[item.name],
  })), [catalog, status]);
  const enabled = rows.filter((item) => item.runtime?.enabled ?? item.enabled).length;
  const running = rows.filter((item) => item.runtime?.running).length;
  const unavailable = rows.filter((item) => item.available === false).length;

  return (
    <section className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2"><MessageSquareMore className="h-4 w-4 text-primary" /><h2 className="text-base font-semibold">IM 通道中心</h2></div>
          <p className="max-w-3xl text-sm text-muted-foreground">统一管理项目中注册的全部消息通道。电脑上不必安装对应聊天客户端；多数平台需要创建 Bot，并填写平台提供的凭证。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} disabled={loading || action !== null} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition hover:bg-muted disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />刷新</button>
          <button type="button" onClick={() => void startStop("start")} disabled={loading || action !== null} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50">{action === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}启动已启用通道</button>
          <button type="button" onClick={() => void startStop("stop")} disabled={loading || action !== null} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition hover:bg-muted disabled:opacity-50">{action === "stop" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}停止</button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Metric label="运行时" value={status?.running ? "运行中" : "已停止"} />
        <Metric label="已启用" value={String(enabled)} />
        <Metric label="正在连接" value={String(running)} />
        <Metric label="缺少依赖" value={String(unavailable)} />
      </div>

      <div className="overflow-hidden rounded-md border">
        {rows.map((item) => {
          const open = expanded === item.name;
          const runtime = item.runtime;
          return (
            <div key={item.name} className="border-t first:border-t-0">
              <button type="button" onClick={() => setExpanded(open ? null : item.name)} className="grid w-full gap-3 px-3 py-3 text-left transition hover:bg-muted/30 md:grid-cols-[minmax(180px,0.7fr)_minmax(220px,1fr)_auto] md:items-center">
                <div><div className="text-sm font-medium">{item.display_name || item.name}</div><div className="font-mono text-[11px] text-muted-foreground">{item.name}</div></div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge active={runtime?.enabled ?? item.enabled} label={(runtime?.enabled ?? item.enabled) ? "已启用" : "未启用"} />
                  <Badge active={item.available} label={item.available ? "适配器可用" : "缺少依赖"} />
                  <Badge active={runtime?.running ?? false} label={runtime?.running ? "运行中" : "未运行"} />
                </div>
                <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">配置 {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</div>
              </button>
              {open ? <ChannelEditor item={item} onSaved={load} /> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border bg-muted/20 px-3 py-2"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-0.5 text-sm font-medium">{value}</div></div>;
}

function Badge({ active, label }: { active: boolean; label: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{label}</span>;
}

function ChannelEditor({ item, onSaved }: { item: ChannelCatalogItem; onSaved: () => Promise<void> }) {
  const [enabled, setEnabled] = useState(item.enabled);
  const [config, setConfig] = useState<Record<string, unknown>>(item.config ?? {});
  const [saving, setSaving] = useState(false);
  const [login, setLogin] = useState<WeixinLoginState | null>(null);
  const properties = item.schema?.properties ?? {};

  useEffect(() => {
    if (login?.phase !== "waiting" && login?.phase !== "starting") return;
    const timer = window.setInterval(() => {
      void api.getWeixinLogin().then(async (next) => {
        setLogin(next);
        if (next.phase === "confirmed" && window.vibeDesktop) {
          window.clearInterval(timer);
          await window.vibeDesktop.importCredentialsAndRestart();
        }
      });
    }, 1200);
    return () => window.clearInterval(timer);
  }, [login?.phase]);

  const save = async () => {
    setSaving(true);
    try {
      const persistedConfig = { ...config };
      let secureValuesChanged = false;
      if (window.vibeDesktop) {
        for (const [name, value] of Object.entries(config)) {
          if (!isSecretName(name) || typeof value !== "string" || !value.trim() || value === "••••••••") continue;
          await window.vibeDesktop.setCredential(`CHANNEL:${item.name}:${name}`, value.trim());
          delete persistedConfig[name];
          secureValuesChanged = true;
        }
      }
      await api.updateChannelConfig({ channel: item.name, enabled, config: persistedConfig });
      toast.success(`${item.display_name} 配置已保存`);
      if (secureValuesChanged && window.vibeDesktop) {
        toast.info("通道凭证已安全保存，正在重启本地服务…");
        await window.vibeDesktop.restartBackend();
        return;
      }
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const beginWeixin = async () => {
    setLogin({ phase: "starting", message: "正在获取二维码…", qr_data_url: "" });
    try { setLogin(await api.startWeixinLogin(true)); }
    catch (error) { setLogin({ phase: "error", message: error instanceof Error ? error.message : "登录失败", qr_data_url: "" }); }
  };

  return (
    <div className="border-t bg-muted/10 p-4">
      {!item.available ? <div className="mb-4 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">依赖尚未就绪：</span> {item.install_hint || item.error}</div> : null}
      <div className="mb-4 flex items-center justify-between rounded-md border bg-background px-3 py-2">
        <div><div className="text-sm font-medium">启用此通道</div><div className="text-xs text-muted-foreground">保存后再点击“启动已启用通道”。</div></div>
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="h-4 w-4 accent-primary" />
      </div>

      {item.setup_mode === "weixin_qr" ? (
        <div className="mb-4 rounded-md border bg-background p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><div className="text-sm font-medium">个人微信扫码登录</div><p className="mt-1 text-xs text-muted-foreground">不依赖本机微信客户端。扫码后令牌会转入桌面安全存储；网页模式仍保存在本地状态文件。</p></div>
            <button type="button" onClick={() => void beginWeixin()} disabled={login?.phase === "starting" || login?.phase === "waiting"} className="inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm transition hover:bg-muted disabled:opacity-50"><KeyRound className="h-4 w-4" />扫码登录</button>
          </div>
          {login ? <div className="mt-4 flex flex-col items-center gap-3 rounded-md bg-muted/20 p-4"><p className="text-sm text-muted-foreground">{login.message}</p>{login.qr_data_url ? <img src={login.qr_data_url} alt="微信登录二维码" className="h-56 w-56 rounded-md bg-white p-2" /> : null}</div> : null}
        </div>
      ) : null}

      {Object.keys(properties).length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(properties).filter(([name]) => name !== "enabled").map(([name, schema]) => (
            <DynamicField key={name} name={name} schema={schema} value={config[name] ?? schema.default ?? ""} onChange={(value) => setConfig((current) => ({ ...current, [name]: value }))} />
          ))}
        </div>
      ) : <p className="mb-4 text-xs text-muted-foreground">此适配器没有公开可编辑字段；可以直接启用后启动。</p>}

      <button type="button" onClick={() => void save()} disabled={saving || !item.available} className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}保存通道配置</button>
    </div>
  );
}

function DynamicField({ name, schema, value, onChange }: { name: string; schema: { type?: string; title?: string; description?: string; default?: unknown; format?: string }; value: unknown; onChange: (value: unknown) => void }) {
  const secret = isSecretName(name);
  const label = schema.title || name.replace(/_/gu, " ");
  if (schema.type === "boolean") {
    return <label className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm"><span>{label}</span><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-primary" /></label>;
  }
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <input type={secret ? "password" : schema.type === "number" || schema.type === "integer" ? "number" : "text"} value={formatValue(value)} onChange={(event) => onChange(parseValue(event.target.value, schema.type))} className={fieldClass} placeholder={secret ? "留空或保持掩码以保留现有凭证" : undefined} autoComplete="off" />
      {schema.description ? <span className="text-xs text-muted-foreground">{schema.description}</span> : null}
    </label>
  );
}

function isSecretName(name: string): boolean {
  return /(token|secret|password|api_key|private_key|signing)/iu.test(name);
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return value === null || value === undefined ? "" : String(value);
}

function parseValue(value: string, type?: string): unknown {
  if (type === "integer") return Number.parseInt(value || "0", 10);
  if (type === "number") return Number(value || "0");
  if (type === "array") return value.split(",").map((item) => item.trim()).filter(Boolean);
  if (type === "object") { try { return JSON.parse(value || "{}"); } catch { return value; } }
  return value;
}
