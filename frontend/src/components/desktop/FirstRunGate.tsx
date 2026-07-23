import { useState } from "react";
import { AlertTriangle, ArrowRight, HardDrive, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

const POLICY_VERSION = "desktop-alpha-1";
const STORAGE_KEY = "vibe-desktop-onboarding";

export function FirstRunGate() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(() => (
    window.vibeDesktop?.isDesktop === true && localStorage.getItem(STORAGE_KEY) !== POLICY_VERSION
  ));
  const [riskAccepted, setRiskAccepted] = useState(false);
  const [communityAccepted, setCommunityAccepted] = useState(false);

  if (!open) return null;

  const complete = (goToSettings: boolean) => {
    if (!riskAccepted || !communityAccepted) return;
    localStorage.setItem(STORAGE_KEY, POLICY_VERSION);
    setOpen(false);
    if (goToSettings) navigate("/settings");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="desktop-welcome-title">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border bg-card shadow-2xl">
        <div className="border-b bg-gradient-to-br from-primary/10 via-card to-card p-6">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-primary">
            <ShieldCheck className="h-4 w-4" /> Community Desktop Alpha
          </div>
          <h1 id="desktop-welcome-title" className="text-2xl font-semibold tracking-tight">开始使用 Vibe-Trading Desktop</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">本桌面外壳在本机启动 Vibe-Trading 服务，并把现有网页界面装进独立窗口。</p>
        </div>

        <div className="grid gap-3 p-6 sm:grid-cols-2">
          <div className="rounded-lg border bg-muted/20 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium"><HardDrive className="h-4 w-4 text-primary" />本地数据与凭证</div>
            <p className="text-xs leading-5 text-muted-foreground">聊天、策略和配置保存在当前 Windows 用户目录。桌面版 API 凭证使用系统加密；卸载应用不会自动删除研究数据。</p>
          </div>
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium"><AlertTriangle className="h-4 w-4 text-warning" />金融风险</div>
            <p className="text-xs leading-5 text-muted-foreground">模型输出可能错误、过时或不完整，不构成投资建议。启用交易连接器前，请先验证账户、权限、限额和停机开关。</p>
          </div>
        </div>

        <div className="space-y-3 px-6 pb-6">
          <label className="flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 text-sm">
            <input type="checkbox" checked={communityAccepted} onChange={(event) => setCommunityAccepted(event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
            <span>我知道这是社区桌面 Alpha，并非 HKUDS 官方桌面客户端；项目名称不代表原作者认可。</span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 text-sm">
            <input type="checkbox" checked={riskAccepted} onChange={(event) => setRiskAccepted(event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
            <span>我理解模型与市场数据存在风险，并会在真实交易前自行复核所有结果。</span>
          </label>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t bg-muted/20 p-4 sm:flex-row sm:justify-end">
          <button type="button" disabled={!riskAccepted || !communityAccepted} onClick={() => complete(false)} className="rounded-md border px-4 py-2 text-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40">稍后配置</button>
          <button type="button" disabled={!riskAccepted || !communityAccepted} onClick={() => complete(true)} className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">前往设置 <ArrowRight className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}
