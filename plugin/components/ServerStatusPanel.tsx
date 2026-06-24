import type { ReactNode } from "react";
import type { ServerState } from "../types";
import { CopyIcon, EmptyQrIcon, GlobeIcon, PowerIcon, ServerIcon, ShieldIcon } from "./Icons";

interface ServerStatusPanelProps {
  authEnabled: boolean;
  formDisabled: boolean;
  httpsEnabled: boolean;
  publicNetwork: boolean;
  qrSrc: string;
  serverState: ServerState;
  settings: {
    autoStart?: boolean;
  };
  statusLabel: string;
  url: string;
  onAutoStartChange: (checked: boolean) => void;
  onCopyAccessUrl: () => void;
  onHttpsDocsOpen: () => void;
  onHttpsEnabledChange: (checked: boolean) => void;
  onOpenEndpointUrl: () => void;
  onPasswordProtectionChange: (checked: boolean) => void;
  onPublicNetworkChange: (checked: boolean) => void;
  onServerPowerChange: (checked: boolean) => void;
}

export function ServerStatusPanel({
  authEnabled,
  formDisabled,
  httpsEnabled,
  publicNetwork,
  qrSrc,
  serverState,
  settings,
  statusLabel,
  url,
  onAutoStartChange,
  onCopyAccessUrl,
  onHttpsDocsOpen,
  onHttpsEnabledChange,
  onOpenEndpointUrl,
  onPasswordProtectionChange,
  onPublicNetworkChange,
  onServerPowerChange,
}: ServerStatusPanelProps) {
  return (
    <section className="m-[9px] rounded-[10px] border border-[#d7d9de] bg-white px-3.5 pb-3 pt-3.5">
      <div className="flex items-center justify-between gap-3">
        <SectionHeading icon={<ServerIcon />}>Server Status</SectionHeading>
        <div className="inline-flex items-center gap-2.5">
          <StatusBadge state={serverState} label={statusLabel} />
          <PowerSwitch checked={serverState === "running"} disabled={formDisabled} onChange={onServerPowerChange} />
        </div>
      </div>

      <div className="my-3.5 h-px bg-[#e1e3e7]" />

      <div className="grid grid-cols-[minmax(0,1fr)_148px] items-stretch gap-3.5 max-[520px]:grid-cols-1">
        <div className="grid min-w-0 border-r border-[#e1e3e7] pr-3.5 max-[520px]:border-r-0 max-[520px]:pr-0">
          <label className="block text-[11px] font-medium leading-tight text-[#676c75]" htmlFor="accessUrl">Endpoint URL</label>
          <div className="my-2 grid grid-cols-[minmax(0,1fr)_38px] items-center gap-2 max-[520px]:grid-cols-[20px_minmax(0,1fr)]">
            <input id="accessUrl" className="h-8 min-w-0 cursor-pointer rounded-lg border border-[#d7d9de] bg-[#f8f9fb] px-2.5 text-xs text-[#111] outline-0" type="text" readOnly value={url} onClick={onOpenEndpointUrl} />
            <button className="inline-flex h-8 w-[38px] items-center justify-center rounded-lg border border-[#d7d9de] bg-white p-0 text-[#363b44] hover:bg-[#f8f9fb] max-[520px]:col-start-2 max-[520px]:w-[84px]" type="button" aria-label="Copy endpoint URL" title="Copy endpoint URL" disabled={formDisabled} onClick={onCopyAccessUrl}>
              <CopyIcon className="h-6 w-6" />
            </button>
          </div>

          <div className="grid h-full content-center gap-3 py-1.5">
            <OptionRow
              checked={Boolean(settings.autoStart)}
              disabled={formDisabled}
              icon={<PowerIcon />}
              title="Auto start"
              description="Start server automatically when app launches."
              onChange={onAutoStartChange}
            />
            <OptionRow
              checked={authEnabled}
              disabled={formDisabled}
              icon={<ShieldIcon />}
              title="Password protection"
              description="Require username & password to access."
              onChange={onPasswordProtectionChange}
            />
            <OptionRow
              checked={publicNetwork}
              disabled={formDisabled}
              icon={<GlobeIcon />}
              title="Public Network"
              description="Allow access from other devices on the network."
              onChange={onPublicNetworkChange}
            />
            <OptionRow
              checked={httpsEnabled}
              disabled={formDisabled}
              icon={<ShieldIcon />}
              title="HTTPS"
              description="Use TLS when certificate paths are set."
              actionLabel="Read docs"
              onAction={onHttpsDocsOpen}
              onChange={onHttpsEnabledChange}
            />
          </div>
        </div>

        <aside className="grid min-h-full content-stretch justify-items-center gap-2.5 pt-0.5">
          <span className="block text-center text-[11px] font-medium leading-tight text-[#676c75]">Quick Access (QR)</span>
          <div className="grid h-[124px] w-[124px] place-items-center overflow-hidden rounded-[10px] border border-[#e1e3e7] bg-white text-[#c8ccd4]" aria-label="QR code">
            {qrSrc ? <img className="h-[106px] w-[106px]" src={qrSrc} alt={url || "QR code"} /> : <EmptyQrIcon className="h-9 w-9" />}
          </div>
        </aside>
      </div>
    </section>
  );
}

function SectionHeading({ children, icon }: { children: ReactNode; icon: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center text-[#5f6670] [&_svg]:h-4 [&_svg]:w-4" aria-hidden="true">{icon}</span>
      <h2 className="m-0 text-base font-[420] leading-none">{children}</h2>
    </div>
  );
}

function StatusBadge({ label, state }: { label: string; state: ServerState }) {
  const palette = {
    error: "border-[#fecaca] bg-[#fef2f2] text-[#b42318] [&>span]:bg-[#d92d20]",
    running: "border-[#b5ebc1] bg-[#e7f8eb] text-[#178c35] [&>span]:bg-[#34c759]",
    stopped: "border-[#d5d9df] bg-[#f3f4f6] text-[#626975] [&>span]:bg-[#9aa2ae]",
  }[state];
  return (
    <span className={`inline-flex min-h-6 items-center gap-1.5 rounded-[7px] border px-[9px] text-[13px] font-medium ${palette}`}>
      <span className="h-2 w-2 rounded-full" />
      <strong>{label}</strong>
    </span>
  );
}

function PowerSwitch({ checked, disabled, onChange }: { checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="[-webkit-app-region:no-drag] relative block h-7 w-12 cursor-pointer has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60" aria-label="Start or stop server">
      <input className="absolute opacity-0" type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} />
      <span className={`absolute inset-0 rounded-full transition-colors after:absolute after:left-[3px] after:top-[3px] after:h-[22px] after:w-[22px] after:rounded-full after:bg-white after:transition-transform ${checked ? "bg-[#1f74ff] after:translate-x-5" : "bg-[#d7dbe1]"}`} />
    </label>
  );
}

function OptionRow({ actionLabel, checked, description, disabled, icon, onAction, onChange, title }: {
  actionLabel?: string;
  checked: boolean;
  description: string;
  disabled: boolean;
  icon: ReactNode;
  onAction?: () => void;
  onChange: (checked: boolean) => void;
  title: string;
}) {
  return (
    <div className="grid grid-cols-[14px_24px_minmax(0,1fr)] items-center gap-x-[11px] gap-y-2 has-[:disabled]:opacity-60">
      <input className="h-3.5 w-3.5 cursor-pointer accent-[#1463e8] disabled:cursor-not-allowed" type="checkbox" aria-label={title} checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} />
      <span className="grid h-6 w-6 place-items-center rounded-md border border-[#e1e3e7] bg-white text-[#565c66] [&_svg]:h-3 [&_svg]:w-3" aria-hidden="true">{icon}</span>
      <span>
        <strong className="block text-[11px] font-[620] text-[#111]">{title}</strong>
        <small className="mt-0.5 block text-[10px] leading-tight text-[#8a8f99]">
          {description}
          {actionLabel && onAction ? (
            <>
              {" "}
              <button className="border-0 bg-transparent p-0 text-[10px] font-medium text-[#1463e8] underline underline-offset-2 disabled:cursor-not-allowed disabled:text-[#8a8f99]" type="button" disabled={disabled} onClick={onAction}>
                {actionLabel}
              </button>
            </>
          ) : null}
        </small>
      </span>
    </div>
  );
}
