import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

  return (
    <section id="loginView" className="login-view grid min-h-dvh place-items-center px-4 py-9" hidden={hidden}>
      <Card
        className="login-panel w-[min(320px,100%)] rounded-[14px] border-app-border bg-[rgba(255,255,255,0.95)] px-[30px] pb-[30px] pt-[42px] shadow-app backdrop-blur-xl"
      >
      <form
        id="connectForm"
        className="grid gap-[18px]"
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
      </Card>
    </section>
  );
}

function LoginCredentials({ disabled }: { disabled: boolean }) {
  return (
    <div className="grid gap-2">
      <Input
        id="authUsernameInput"
        name="username"
        className="min-h-[42px] rounded-lg bg-white px-3 text-sm text-app-text"
        aria-label="Username"
        autoComplete="username"
        disabled={disabled}
        placeholder="Username"
        required
        type="text"
      />
      <Input
        id="authPasswordInput"
        name="password"
        className="min-h-[42px] rounded-lg bg-white px-3 text-sm text-app-text"
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
    <Button
      id="connectButton"
      className="min-h-[46px] rounded-lg text-sm font-[720] shadow-[0_10px_22px_rgba(37,99,235,0.18)]"
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

  return (
    <p
      id="connectMessage"
      className={`connect-message m-0 min-h-[18px] rounded-app px-3 py-2 text-center text-xs leading-[1.35] text-app-muted empty:hidden${displayIsError ? " border border-red-200 bg-red-50 text-app-danger" : ""}`}
      aria-live="polite"
      role={displayIsError ? "alert" : undefined}
    >
      {displayMessage}
    </p>
  );
}
