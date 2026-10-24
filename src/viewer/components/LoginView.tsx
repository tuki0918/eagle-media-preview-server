import { useState, useSyncExternalStore } from "react";
import { CircleAlertIcon, ClockIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import appIconUrl from "../../assets/app_icon.svg";
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
    <section id="loginView" className="login-view grid min-h-dvh place-items-center bg-[radial-gradient(ellipse_at_top,var(--muted),var(--background)_70%)] px-4 py-9 text-foreground" hidden={hidden}>
      <form
        id="connectForm"
        className="login-panel grid w-full max-w-[400px] gap-7 rounded-[28px] border border-border bg-card px-6 pb-7 pt-8 text-card-foreground shadow-[0_30px_80px_-32px_rgba(15,23,42,0.35)] min-[720px]:px-8 min-[720px]:pb-8 min-[720px]:pt-10"
        onSubmit={submitConnection}
      >
        <LoginIdentity />

        <div className="login-primary grid content-center gap-7">
          {showCredentials ? (
            <div className="grid gap-1 text-center">
              <h2 className="m-0 text-base font-semibold leading-tight">Sign in</h2>
              <p className="m-0 text-[13px] leading-[1.45] text-muted-foreground">Use an account configured in the Eagle plugin panel.</p>
            </div>
          ) : null}
          <div className="form-actions grid grid-cols-1 gap-4">
            {showCredentials ? <LoginCredentials disabled={state.disabled} /> : null}
            {showInlineError ? <ConnectMessage /> : null}
            <ConnectButton />
            {showCredentials ? <SessionDuration seconds={state.sessionMaxAgeSeconds} /> : null}
          </div>
          {showInlineError ? null : <ConnectMessage />}
        </div>
      </form>
    </section>
  );
}

function LoginIdentity() {
  return (
    <div className="login-head grid justify-items-center gap-4 text-center">
      <img
        className="app-logo block h-16 w-16 rounded-[18px] object-cover shadow-[0_12px_28px_-12px_rgba(20,99,243,0.55)]"
        src={appIconUrl}
        alt=""
        aria-hidden="true"
      />
      <div className="grid gap-1.5">
        <h1 className="m-0 whitespace-nowrap text-xl font-semibold leading-tight">Media Preview Server</h1>
        <p className="m-0 text-[13px] leading-[1.45] text-muted-foreground">A local media server for your Eagle library.</p>
      </div>
    </div>
  );
}

function LoginCredentials({ disabled }: { disabled: boolean }) {
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <div className="grid gap-3">
      <Input
        id="authUsernameInput"
        name="username"
        className="min-h-11 rounded-xl bg-background px-3.5 text-base text-foreground min-[720px]:text-sm"
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
          className="min-h-11 rounded-xl bg-background px-3.5 pr-11 text-base text-foreground min-[720px]:text-sm"
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
          className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
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

function SessionDuration({ seconds }: { seconds?: number }) {
  return (
    <p className="m-0 inline-flex items-center justify-center gap-1.5 text-center text-[11px] leading-[1.45] text-muted-foreground">
      <ClockIcon className="size-3.5" aria-hidden="true" />
      <span>{sessionDurationLabel(seconds)}</span>
    </p>
  );
}

function sessionDurationLabel(seconds: unknown) {
  const days = Math.max(1, Math.round(Number(seconds || 0) / 86400) || 7);
  return `Session expires after ${days} ${days === 1 ? "day" : "days"}.`;
}

export function ConnectButton({ disabled }: ConnectButtonProps) {
  const state = useSyncExternalStore(subscribeLoginConnectState, getLoginConnectState, getLoginConnectState);

  return (
    <Button
      id="connectButton"
      className="min-h-12 rounded-full text-sm font-semibold shadow-sm"
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
