interface LoginConnectState {
  authenticated: boolean;
  authRequired: boolean;
  disabled: boolean;
  isError: boolean;
  message: string;
  serverStatus?: "error" | "online";
  sessionMaxAgeSeconds?: number;
  user: {
    role?: string;
    username?: string;
  } | null;
}

const listeners = new Set<() => void>();
let currentLoginConnect: LoginConnectState = {
  authenticated: false,
  authRequired: false,
  disabled: false,
  isError: false,
  message: "",
  serverStatus: "online",
  sessionMaxAgeSeconds: 7 * 24 * 60 * 60,
  user: null,
};

export function getLoginConnectState() {
  return currentLoginConnect;
}

export function setLoginConnectState(nextState: LoginConnectState) {
  if (
    currentLoginConnect.authenticated === nextState.authenticated
    && currentLoginConnect.authRequired === nextState.authRequired
    && currentLoginConnect.disabled === nextState.disabled
    && currentLoginConnect.isError === nextState.isError
    && currentLoginConnect.message === nextState.message
    && currentLoginConnect.serverStatus === nextState.serverStatus
    && currentLoginConnect.sessionMaxAgeSeconds === nextState.sessionMaxAgeSeconds
    && currentLoginConnect.user?.role === nextState.user?.role
    && currentLoginConnect.user?.username === nextState.user?.username
  ) {
    return;
  }
  currentLoginConnect = nextState;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeLoginConnectState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
