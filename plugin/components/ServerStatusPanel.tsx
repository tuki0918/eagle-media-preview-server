import type { ReactNode } from "react";
import type { ServerState } from "../types";
import { CheckIcon, CopyIcon, EmptyQrIcon, GlobeIcon, KeyIcon, LockIcon, PowerIcon, ServerIcon, ShieldIcon } from "./Icons";

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
  urlCopied?: boolean;
  settingsLocked?: boolean;
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
  urlCopied = false,
  settingsLocked = false,
  onAutoStartChange,
  onCopyAccessUrl,
  onHttpsDocsOpen,
  onHttpsEnabledChange,
  onOpenEndpointUrl,
  onPasswordProtectionChange,
  onPublicNetworkChange,
  onServerPowerChange,
}: ServerStatusPanelProps) {
  const running = serverState === "running";
  return (
    <section className="rounded-2xl border border-[#e6e6e9] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-2">
          <SectionHeading icon={<ServerIcon />}>Server Status</SectionHeading>
          <p className="m-0 text-[11.5px] leading-snug text-[#7a7f88]">
            {running ? "The viewer is available at the endpoint below." : "Start the server to open the viewer from your devices."}
          </p>
        </div>
        <div className="inline-flex shrink-0 items-center gap-2.5">
          <StatusBadge state={serverState} label={statusLabel} />
          <PowerSwitch checked={running} disabled={formDisabled} onChange={onServerPowerChange} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_136px] items-start gap-4 max-[520px]:grid-cols-1">
        <div className="grid min-w-0 gap-3">
          <div className="grid gap-1.5">
            <label className={fieldLabelClassName} htmlFor="accessUrl">Endpoint URL</label>
            <div className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-2">
              <input id="accessUrl" className="h-10 min-w-0 cursor-pointer rounded-xl border border-transparent bg-[#f4f4f6] px-3 text-[13px] font-medium text-[#171717] outline-0 transition-colors placeholder:font-normal placeholder:text-[#9a9ea6] hover:bg-[#ececef]" type="text" readOnly value={url} placeholder="Start the server to get a URL" title={url ? "Open in browser" : undefined} onClick={onOpenEndpointUrl} />
              <button className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#e6e6e9] bg-white p-0 text-[#3a3f47] transition-colors hover:bg-[#f4f4f6] disabled:cursor-not-allowed disabled:opacity-45" type="button" aria-label="Copy endpoint URL" title={urlCopied ? "Copied" : "Copy endpoint URL"} disabled={formDisabled || !url} onClick={onCopyAccessUrl}>
                {urlCopied ? <CheckIcon className="h-[18px] w-[18px] text-[#178c35]" /> : <CopyIcon className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div className="grid overflow-hidden rounded-xl border border-[#e6e6e9]">
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
              icon={<KeyIcon />}
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

        <aside className="grid justify-items-center gap-1.5 max-[520px]:justify-items-start">
          <span className={`${fieldLabelClassName} block text-center`}>Quick Access (QR)</span>
          <div className="grid h-[124px] w-[124px] place-items-center overflow-hidden rounded-xl border border-[#e6e6e9] bg-white text-[#c8ccd4]" aria-label="QR code">
            {qrSrc ? <img className="h-[112px] w-[112px]" src={qrSrc} alt={url || "QR code"} /> : <EmptyQrIcon className="h-9 w-9" />}
          </div>
          <span className="max-w-[124px] text-center text-[10.5px] leading-snug text-[#9a9ea6]">
            {qrSrc ? "Scan to open on your phone." : "Available while running."}
          </span>
        </aside>
      </div>
      {settingsLocked ? (
        <p className="m-0 mt-4 flex items-center gap-2 rounded-xl border border-[#f5dfa8] bg-[#fffaeb] px-3 py-2 text-[11.5px] leading-snug text-[#8a5a00]" role="note">
          <LockIcon className="h-3.5 w-3.5 shrink-0" />
          <span>Settings are locked while the server is running. Stop the server to edit them.</span>
        </p>
      ) : null}
    </section>
  );
}

const fieldLabelClassName = "text-[10.5px] font-semibold uppercase leading-tight tracking-[0.06em] text-[#7a7f88]";

function SectionHeading({ children, icon }: { children: ReactNode; icon: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="inline-flex items-center text-[#5f6670] [&_svg]:h-4 [&_svg]:w-4" aria-hidden="true">{icon}</span>
      <h2 className="m-0 text-[15px] font-semibold leading-none text-[#171717]">{children}</h2>
    </div>
  );
}

function StatusBadge({ label, state }: { label: string; state: ServerState }) {
  const palette = {
    error: "bg-[#fef2f2] text-[#b42318] [&>span]:bg-[#d92d20]",
    running: "bg-[#e9f9ee] text-[#16803a] [&>span]:bg-[#34c759] [&>span]:shadow-[0_0_0_3px_rgba(52,199,89,0.2)]",
    stopped: "bg-[#f1f2f4] text-[#626975] [&>span]:bg-[#9aa2ae]",
  }[state];
  return (
    <span className={`inline-flex min-h-7 min-w-[86px] items-center justify-center gap-1.5 rounded-full px-3 text-[12px] font-semibold ${palette}`}>
      <span className="h-2 w-2 rounded-full" />
      <strong className="font-semibold">{label}</strong>
    </span>
  );
}

function PowerSwitch({ checked, disabled, onChange }: { checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="[-webkit-app-region:no-drag] relative block h-7 w-12 cursor-pointer has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60" aria-label="Start or stop server">
      <input className="peer absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} />
      <span className={`pointer-events-none absolute inset-0 rounded-full transition-colors peer-focus-visible:shadow-[0_0_0_3px_rgba(23,23,23,0.18)] after:absolute after:left-[3px] after:top-[3px] after:h-[22px] after:w-[22px] after:rounded-full after:bg-white after:shadow-[0_1px_3px_rgba(0,0,0,0.2)] after:transition-transform ${checked ? "bg-[#34c759] after:translate-x-5" : "bg-[#d9dadd]"}`} />
    </label>
  );
}

function ToggleSwitch({ checked, disabled, label, onChange }: { checked: boolean; disabled: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <span className="relative inline-flex h-[22px] w-[38px] shrink-0">
      <input className="peer absolute inset-0 z-[1] m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} />
      <span className={`pointer-events-none absolute inset-0 rounded-full transition-colors peer-focus-visible:shadow-[0_0_0_3px_rgba(23,23,23,0.18)] after:absolute after:left-[2px] after:top-[2px] after:h-[18px] after:w-[18px] after:rounded-full after:bg-white after:shadow-[0_1px_2px_rgba(0,0,0,0.25)] after:transition-transform ${checked ? "bg-[#2563eb] after:translate-x-4" : "bg-[#d9dadd]"}`} aria-hidden="true" />
    </span>
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
    <div className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-[#efeff1] px-3 py-2.5 last:border-b-0 has-[:disabled]:opacity-60">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#f4f4f6] text-[#565c66] [&_svg]:h-3.5 [&_svg]:w-3.5" aria-hidden="true">{icon}</span>
      <span className="min-w-0">
        <strong className="block text-[12.5px] font-semibold text-[#171717]">{title}</strong>
        <small className="mt-0.5 block text-[11px] leading-tight text-[#7a808a]">
          {description}
          {actionLabel && onAction ? (
            <>
              {" "}
              <button className="border-0 bg-transparent p-0 text-[11px] font-medium text-[#1463e8] underline underline-offset-2 disabled:cursor-not-allowed disabled:text-[#8a8f99]" type="button" disabled={disabled} onClick={onAction}>
                {actionLabel}
              </button>
            </>
          ) : null}
        </small>
      </span>
      <ToggleSwitch checked={checked} disabled={disabled} label={title} onChange={onChange} />
    </div>
  );
}
