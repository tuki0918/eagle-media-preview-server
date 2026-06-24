import { useState, useSyncExternalStore } from "react";
import { CircleAlertIcon, ClockIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import iconOnUrl from "../../assets/icon_on.svg";
import { getLoginConnectState, subscribeLoginConnectState } from "../loginConnectState";
import { submitConnection } from "../shellActions";

interface ConnectButtonProps {
  disabled?: boolean;
}

interface ConnectMessageProps {
  isError?: boolean;
  message?: string;
}

interface LoginViewProps {
  hidden?: boolean;
}

export function LoginView({ hidden = false }: LoginViewProps) {
  const state = useSyncExternalStore(subscribeLoginConnectState, getLoginConnectState, getLoginConnectState);
  const showCredentials = state.authRequired && !state.authenticated;
  const showInlineError = showCredentials && state.isError && Boolean(state.message);

  return (
    <section id="loginView" className="login-view grid min-h-dvh place-items-center bg-background px-4 py-9 text-foreground" hidden={hidden}>
      <form
        id="connectForm"
        className="login-panel grid w-full max-w-[760px] gap-8 rounded-lg border border-border bg-card px-6 py-7 text-card-foreground shadow-sm min-[720px]:grid-cols-[minmax(0,0.84fr)_minmax(320px,1fr)] min-[720px]:gap-10 min-[720px]:px-9 min-[720px]:py-9"
        onSubmit={submitConnection}
      >
        <LoginIdentity state={state} />

        <div className="login-primary grid content-center gap-7 min-[720px]:border-l min-[720px]:border-border min-[720px]:pl-10">
          <div className="grid gap-2.5">
            <h2 className="m-0 text-[19px] font-[760] leading-[1.15] tracking-[0]">Sign in</h2>
            <p className="m-0 text-xs leading-[1.45] text-muted-foreground">
              {showCredentials ? "Use an account configured in the Eagle plugin panel." : "Connect this browser to the media server."}
            </p>
          </div>
          <div className="form-actions grid grid-cols-1 gap-4">
            {showCredentials ? <LoginCredentials disabled={state.disabled} /> : null}
            {showInlineError ? <ConnectMessage /> : null}
            <ConnectButton />
            {showCredentials ? <SessionDuration /> : null}
          </div>
          {showInlineError ? null : <ConnectMessage />}
        </div>
      </form>
    </section>
  );
}

function LoginIdentity({ state }: { state: ReturnType<typeof getLoginConnectState> }) {
  return (
    <div className="login-head grid content-center gap-5">
      <div className="grid gap-3">
        <img
          className="app-logo block h-[54px] w-[54px] rounded-xl object-cover shadow-sm"
          src={iconOnUrl}
          alt=""
          aria-hidden="true"
        />
        <div className="grid gap-2">
          <h1 className="m-0 whitespace-nowrap text-[19px] font-[760] leading-[1.15] tracking-[0]">Media Preview Server</h1>
          <p className="m-0 max-w-[260px] text-xs leading-[1.45] text-muted-foreground">A local media server for your Eagle library.</p>
        </div>
      </div>
      <div className="grid gap-3">
        <div id="serverStatusDivider" className="h-px w-full bg-border" aria-hidden="true" />
        <p className="m-0 text-[11px] font-semibold uppercase leading-none tracking-[0.08em] text-muted-foreground">Server status</p>
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium leading-none text-foreground">
          <ServerStatusDot state={state} />
          <span className="truncate">{viewerEndpoint()}</span>
        </div>
      </div>
    </div>
  );
}

function ServerStatusDot({ state }: { state: ReturnType<typeof getLoginConnectState> }) {
  const status = serverStatusLabel(state.serverStatus);
  const colorClassName = state.serverStatus === "error" ? "bg-destructive" : "bg-emerald-500";

  return (
    <span className="group relative inline-flex size-5 shrink-0 items-center justify-center">
      <button
        id="serverStatusDot"
        type="button"
        className="grid size-5 place-items-center rounded-full border border-transparent bg-transparent p-0 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={`Server status: ${status}`}
        title={status}
      >
        <span className={`block size-2.5 rounded-full ${colorClassName}`} aria-hidden="true" />
      </button>
      <span className="pointer-events-none absolute left-1/2 top-7 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-medium leading-none text-background opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {status}
      </span>
    </span>
  );
}

function serverStatusLabel(status: ReturnType<typeof getLoginConnectState>["serverStatus"]) {
  return status === "error" ? "Error" : "Online";
}

function viewerEndpoint() {
  if (typeof window !== "undefined" && window.location.host) return window.location.host;
  return "127.0.0.1:5173";
}

function LoginCredentials({ disabled }: { disabled: boolean }) {
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <div className="grid gap-3">
      <Input
        id="authUsernameInput"
        name="username"
        className="min-h-[42px] rounded-lg bg-background px-3 text-base text-foreground min-[720px]:text-sm"
        aria-label="Username"
        autoComplete="username"
        disabled={disabled}
        placeholder="Username"
        required
        type="text"
      />
      <div className="relative">
        <Input
          id="authPasswordInput"
          name="password"
          className="min-h-[42px] rounded-lg bg-background px-3 pr-10 text-base text-foreground min-[720px]:text-sm"
          aria-label="Password"
          autoComplete="current-password"
          disabled={disabled}
          placeholder="Password"
          required
          type={passwordVisible ? "text" : "password"}
        />
        <button
          id="authPasswordToggle"
          type="button"
          className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
          aria-label={passwordVisible ? "Hide password" : "Show password"}
          disabled={disabled}
          onClick={() => setPasswordVisible((value) => !value)}
        >
          {passwordVisible ? <EyeOffIcon className="size-4" aria-hidden="true" /> : <EyeIcon className="size-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

function SessionDuration() {
  return (
    <p className="m-0 inline-flex items-center justify-center gap-1.5 text-center text-[11px] leading-[1.45] text-muted-foreground">
      <ClockIcon className="size-3.5" aria-hidden="true" />
      <span>Session expires after 7 days.</span>
    </p>
  );
}

export function ConnectButton({ disabled }: ConnectButtonProps) {
  const state = useSyncExternalStore(subscribeLoginConnectState, getLoginConnectState, getLoginConnectState);

  return (
    <Button
      id="connectButton"
      className="min-h-[46px] rounded-lg text-sm font-[720] shadow-sm"
      type="submit"
      disabled={disabled ?? state.disabled}
    >
      <span>{state.authRequired && !state.authenticated ? "Sign in" : "Connect"}</span>
    </Button>
  );
}

export function ConnectMessage({ isError, message }: ConnectMessageProps) {
  const state = useSyncExternalStore(subscribeLoginConnectState, getLoginConnectState, getLoginConnectState);
  const displayIsError = isError ?? state.isError;
  const displayMessage = message ?? state.message;
  const className = displayIsError
    ? "connect-message m-0 grid min-h-[38px] grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-left text-xs font-medium leading-[1.45] text-destructive empty:hidden"
    : "connect-message m-0 min-h-[18px] rounded-md px-3 py-2 text-center text-xs leading-[1.35] text-muted-foreground empty:hidden";

  return (
    <p
      id="connectMessage"
      className={className}
      aria-live="polite"
      role={displayIsError ? "alert" : undefined}
    >
      {displayIsError && displayMessage ? <CircleAlertIcon className="mt-px size-4 flex-none" aria-hidden="true" /> : null}
      {displayMessage ? <span>{displayMessage}</span> : null}
    </p>
  );
}
