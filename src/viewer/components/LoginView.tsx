import { useSyncExternalStore } from "react";
import { CircleAlertIcon } from "lucide-react";
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
  const showInlineError = showCredentials && state.isError && Boolean(state.message);

  return (
    <section id="loginView" className="login-view grid min-h-dvh place-items-center px-4 py-9" hidden={hidden}>
      <Card
        className="login-panel w-[min(320px,100%)] rounded-lg border border-border bg-card px-[30px] pb-[30px] pt-[42px] text-card-foreground shadow-sm ring-0"
      >
      <form
        id="connectForm"
        className="grid gap-[18px]"
        onSubmit={submitConnection}
      >
        <div className="login-head grid justify-items-center gap-3 text-center">
          <img
            className="app-logo block h-[54px] w-[54px] rounded-xl object-cover shadow-sm"
            src={iconOnUrl}
            alt=""
            aria-hidden="true"
          />
          <h1 className="m-0 whitespace-nowrap text-[19px] font-[760] leading-[1.15] tracking-[0]">Media Preview Server</h1>
          <p className="m-0 whitespace-nowrap text-xs leading-[1.35] text-muted-foreground">A local media server for your Eagle library.</p>
        </div>

        <div className="login-primary">
          <div className="form-actions grid grid-cols-1 gap-2.5">
            {showCredentials ? <LoginCredentials disabled={state.disabled} /> : null}
            {showInlineError ? <ConnectMessage /> : null}
            <ConnectButton />
          </div>
        </div>
        {showInlineError ? null : <ConnectMessage />}
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
        className="min-h-[42px] rounded-lg bg-background px-3 text-base text-foreground min-[720px]:text-sm"
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
        className="min-h-[42px] rounded-lg bg-background px-3 text-base text-foreground min-[720px]:text-sm"
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
