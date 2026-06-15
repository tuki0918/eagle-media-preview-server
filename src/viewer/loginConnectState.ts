interface LoginConnectState {
  disabled: boolean;
  isError: boolean;
  message: string;
}

const listeners = new Set<() => void>();
let currentLoginConnect: LoginConnectState = {
  disabled: false,
  isError: false,
  message: "",
};

export function getLoginConnectState() {
  return currentLoginConnect;
}

export function setLoginConnectState(nextState: LoginConnectState) {
  if (
    currentLoginConnect.disabled === nextState.disabled
    && currentLoginConnect.isError === nextState.isError
    && currentLoginConnect.message === nextState.message
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
