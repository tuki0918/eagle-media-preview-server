import { useSyncExternalStore } from "react";
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

  return (
    <section id="loginView" className="login-view grid min-h-dvh place-items-center px-4 py-9" hidden={hidden}>
      <form
        id="connectForm"
        className="login-panel grid w-[min(320px,100%)] gap-[18px] rounded-[14px] border border-app-border bg-[rgba(255,255,255,0.95)] px-[30px] pb-[30px] pt-[42px] shadow-app backdrop-blur-xl"
        onSubmit={submitConnection}
      >
        <div className="login-head grid justify-items-center gap-3 text-center">
          <img
            className="app-logo block h-[54px] w-[54px] rounded-xl object-cover shadow-[0_12px_28px_rgba(20,99,243,0.28)]"
            src={iconOnUrl}
            alt=""
            aria-hidden="true"
          />
          <h1 className="m-0 whitespace-nowrap text-[19px] font-[760] leading-[1.15] tracking-[0]">Media Preview Server</h1>
          <p className="m-0 whitespace-nowrap text-xs leading-[1.35] text-app-muted">A local media server for your Eagle library.</p>
        </div>

        <div className="login-primary">
          <div className="form-actions grid grid-cols-1 gap-2.5">
            {showCredentials ? <LoginCredentials disabled={state.disabled} /> : null}
            <ConnectButton />
          </div>
        </div>
        <ConnectMessage />
      </form>
    </section>
  );
}

function LoginCredentials({ disabled }: { disabled: boolean }) {
  return (
    <div className="grid gap-2">
      <input
        id="authUsernameInput"
        name="username"
        className="min-h-[42px] rounded-app border border-app-border bg-white px-3 text-sm text-app-text outline-none focus:border-app-accent focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]"
        aria-label="Username"
        autoComplete="username"
        disabled={disabled}
        placeholder="Username"
        required
        type="text"
      />
      <input
        id="authPasswordInput"
        name="password"
        className="min-h-[42px] rounded-app border border-app-border bg-white px-3 text-sm text-app-text outline-none focus:border-app-accent focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]"
        aria-label="Password"
        autoComplete="current-password"
        disabled={disabled}
        placeholder="Password"
        required
        type="password"
      />
    </div>
  );
}

export function ConnectButton({ disabled }: ConnectButtonProps) {
  const state = useSyncExternalStore(subscribeLoginConnectState, getLoginConnectState, getLoginConnectState);

  return (
    <button
      id="connectButton"
      className="inline-flex min-h-[46px] items-center justify-center gap-[9px] rounded-app border border-app-accent bg-app-accent text-sm font-[720] text-white shadow-[0_10px_22px_rgba(37,99,235,0.18)] hover:border-app-accent-strong hover:bg-app-accent-strong disabled:border-app-border disabled:bg-app-surface-strong disabled:text-app-muted"
      type="submit"
      disabled={disabled ?? state.disabled}
    >
      <span>{state.authRequired && !state.authenticated ? "Sign in" : "Connect"}</span>
    </button>
  );
}

export function ConnectMessage({ isError, message }: ConnectMessageProps) {
  const state = useSyncExternalStore(subscribeLoginConnectState, getLoginConnectState, getLoginConnectState);
  const displayIsError = isError ?? state.isError;
  const displayMessage = message ?? state.message;

  return (
    <p
      id="connectMessage"
      className={`connect-message fixed bottom-[max(24px,env(safe-area-inset-bottom))] left-1/2 z-10 w-[min(320px,calc(100vw-32px))] -translate-x-1/2 px-2 text-center text-app-muted empty:hidden${displayIsError ? " text-app-danger" : ""}`}
      aria-live="polite"
    >
      {displayMessage}
    </p>
  );
}
