import { createRoot, type Root } from "react-dom/client";
import iconOnUrl from "../../assets/icon_on.svg";
import { submitConnection } from "../shellActions";

interface ConnectButtonProps {
  disabled?: boolean;
}

interface ConnectMessageProps {
  isError?: boolean;
  message?: string;
}

const connectButtonRoots = new WeakMap<HTMLElement, Root>();
const connectMessageRoots = new WeakMap<HTMLElement, Root>();

export function LoginView() {
  return (
    <section id="loginView" className="login-view grid min-h-dvh place-items-center px-4 py-9">
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
          <h1>Media Preview Server</h1>
          <p className="m-0 whitespace-nowrap text-xs leading-[1.35] text-app-muted">A local media server for your Eagle library.</p>
        </div>

        <div className="login-primary">
          <div className="form-actions grid grid-cols-1 gap-2.5">
            <div id="connectButtonHost">
              <ConnectButton />
            </div>
          </div>
        </div>
        <div id="connectMessageHost">
          <ConnectMessage />
        </div>
      </form>
    </section>
  );
}

export function ConnectButton({ disabled = false }: ConnectButtonProps) {
  return (
    <button
      id="connectButton"
      className="inline-flex min-h-[46px] items-center justify-center gap-[9px] rounded-app border border-app-accent bg-app-accent text-sm font-[720] text-white shadow-[0_10px_22px_rgba(37,99,235,0.18)]"
      type="submit"
      disabled={disabled}
    >
      <span>Connect</span>
    </button>
  );
}

export function ConnectMessage({ isError = false, message = "" }: ConnectMessageProps) {
  return (
    <p
      id="connectMessage"
      className={`connect-message fixed bottom-[max(24px,env(safe-area-inset-bottom))] left-1/2 z-10 w-[min(320px,calc(100vw-32px))] -translate-x-1/2 px-2 text-center text-app-muted${isError ? " error-text" : ""}`}
      aria-live="polite"
    >
      {message}
    </p>
  );
}

export function renderLoginConnectView(
  buttonContainer: HTMLElement,
  messageContainer: HTMLElement,
  props: Required<ConnectButtonProps & ConnectMessageProps>,
) {
  let buttonRoot = connectButtonRoots.get(buttonContainer);
  if (!buttonRoot) {
    buttonContainer.replaceChildren();
    buttonRoot = createRoot(buttonContainer);
    connectButtonRoots.set(buttonContainer, buttonRoot);
  }
  buttonRoot.render(<ConnectButton disabled={props.disabled} />);

  let messageRoot = connectMessageRoots.get(messageContainer);
  if (!messageRoot) {
    messageContainer.replaceChildren();
    messageRoot = createRoot(messageContainer);
    connectMessageRoots.set(messageContainer, messageRoot);
  }
  messageRoot.render(<ConnectMessage isError={props.isError} message={props.message} />);
}
