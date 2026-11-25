import { AlertIcon } from "./Icons";

export function ServerAlert({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[#f3cdca] bg-[#fff5f4] px-4 py-3 text-[#8f231c]" role="alert">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#fbe4e1]">
        <AlertIcon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="m-0 text-[13px] font-semibold leading-snug">{title}</p>
        <p className="mb-0 mt-1 break-words text-[12px] leading-relaxed">{message}</p>
      </div>
    </div>
  );
}

export function ServerStartAlert({ message, port }: { message?: string; port?: number | string }) {
  if (message && /\bEADDRINUSE\b|^port in use\b/i.test(message)) {
    const boundPort = message.match(/:(\d+)\s*$/)?.[1] || port;
    return (
      <ServerAlert
        title={boundPort ? `Port ${boundPort} is already in use` : "The port is already in use"}
        message="Stop the other server or choose a different port in Settings → General."
      />
    );
  }
  return <ServerAlert title="Could not start the server" message={message || "Try starting the server again."} />;
}
