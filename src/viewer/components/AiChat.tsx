import { ArrowUpIcon, LoaderCircleIcon, PlusIcon, SearchIcon, SparklesIcon, SquareIcon, Trash2Icon, XIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { AI_MESSAGE_MAX_CHARS, clearAiAttachment, deleteAiChat, sendAiMessage, stopAiReply } from "../aiChat";
import { getAiChatState, subscribeAiChatState, type AiChatItem, type AiChatMessage } from "../aiChatState";
import { errorMessage, mediaUrl } from "../api";
import { getLoginConnectState, subscribeLoginConnectState } from "../loginConnectState";
import { askAi, openAiChat, openAiItem } from "../shellActions";
import { showErrorToast } from "../toasts";

const SUGGESTIONS = [
  "What kinds of things are in this library?",
  "Find my 5-star items",
  "Show me videos",
  "Which tags are used the most?",
];
const ITEM_SUGGESTIONS = ["Describe this", "Suggest tags for this", "Find similar items"];
// The page follows the reply only while the reader is already near the end of it.
const FOLLOW_SCROLL_DISTANCE_PX = 240;

interface AiComposerProps {
  attachedItem?: AiChatItem | null;
  autoFocus?: boolean;
  disabled?: boolean;
  onClearAttachment?: () => void;
  onStop?: () => void;
  onSubmit: (text: string) => void;
  placeholder: string;
  /** A reply is being written: the send button becomes Stop. */
  sending?: boolean;
}

/** The message box of the AI chat: grows with its text, sends on Enter, and Shift+Enter adds a line. */
export function AiComposer({ attachedItem = null, autoFocus = false, disabled = false, onClearAttachment, onStop, onSubmit, placeholder, sending = false }: AiComposerProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const canSend = Boolean(text.trim()) && !disabled && !sending;

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 168)}px`;
  }, [text]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus, attachedItem?.id]);

  const submit = () => {
    if (!canSend) return;
    onSubmit(text);
    setText("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter while choosing a conversion (Japanese, Chinese, Korean input) confirms it; it isn't Send.
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    submit();
  };

  return (
    <form
      className="ai-composer grid gap-2 rounded-[22px] border border-border bg-card px-3 py-2.5 shadow-[0_8px_28px_-18px_rgba(15,23,42,0.35)] transition-shadow focus-within:border-[color-mix(in_srgb,var(--foreground)_28%,var(--border))]"
      aria-label="Ask AI"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {attachedItem ? (
        <div className="flex min-w-0 items-center gap-2 rounded-xl bg-muted py-1 pl-1 pr-1.5">
          <AiItemThumb item={attachedItem} className="size-9 rounded-lg" />
          <span className="min-w-0 flex-1 truncate text-[13px] text-foreground" title={attachedItem.name}>{attachedItem.name || "Item"}</span>
          {onClearAttachment ? (
            <button type="button" className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground" aria-label="Remove item" title="Remove item" onClick={onClearAttachment}>
              <XIcon className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <SparklesIcon className="mb-[7px] size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <textarea
          ref={inputRef}
          className="max-h-[168px] min-h-[30px] min-w-0 flex-1 resize-none border-0 bg-transparent py-1 text-[15px] leading-[1.45] text-foreground outline-none placeholder:text-muted-foreground focus-visible:shadow-none"
          rows={1}
          aria-label={placeholder}
          placeholder={placeholder}
          maxLength={AI_MESSAGE_MAX_CHARS}
          disabled={disabled}
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />
        {sending && onStop ? (
          <Button type="button" size="icon" className="size-8 shrink-0 rounded-full" aria-label="Stop" title="Stop" onClick={onStop}>
            <SquareIcon className="size-3 fill-current" aria-hidden="true" />
          </Button>
        ) : (
          <Button type="submit" size="icon" className="size-8 shrink-0 rounded-full" aria-label="Send" title="Send" disabled={!canSend}>
            <ArrowUpIcon className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </form>
  );
}

/** The message box shown above the library on the home view; asking opens the chat. */
export function AiHomePrompt() {
  return (
    <section className="mx-auto w-full max-w-[720px] px-1 pb-1 pt-1" aria-label="AI chat">
      <AiComposer placeholder="Ask AI about this library" onSubmit={askAi} />
    </section>
  );
}

/** The AI section: one chat, with the message box kept at the bottom of the screen. */
export function AiChatView() {
  const chat = useSyncExternalStore(subscribeAiChatState, getAiChatState, getAiChatState);
  const loginState = useSyncExternalStore(subscribeLoginConnectState, getLoginConnectState, getLoginConnectState);
  const username = loginState.user?.username?.trim() || "";
  const isEmpty = !chat.messages.length && !chat.loading && !chat.error;
  const lastMessage = chat.messages.at(-1);
  const endRef = useRef<HTMLDivElement>(null);
  const messageCount = chat.messages.length;
  const lastLength = (lastMessage?.text.length ?? 0) + (lastMessage?.items?.length ?? 0);

  // A new message always comes into view; while a reply grows, only if the reader is near its end.
  useEffect(() => {
    if (messageCount) endRef.current?.scrollIntoView({ block: "end" });
  }, [messageCount, chat.chatId]);
  useEffect(() => {
    const end = endRef.current;
    if (!end || !chat.sending) return;
    if (end.getBoundingClientRect().top - window.innerHeight < FOLLOW_SCROLL_DISTANCE_PX) end.scrollIntoView({ block: "end" });
  }, [lastLength, chat.sending]);

  const removeChat = async () => {
    if (!chat.chatId || !window.confirm("Delete this chat? This can't be undone.")) return;
    try {
      if (await deleteAiChat(chat.chatId)) openAiChat();
    } catch (error) {
      showErrorToast("Unable to delete this chat", { description: errorMessage(error) });
    }
  };

  const composer = (
    <AiComposer
      autoFocus
      attachedItem={chat.attachedItem}
      disabled={chat.loading}
      placeholder={chat.attachedItem ? "Ask about this item" : isEmpty ? "Ask about this library" : "Reply"}
      sending={chat.sending}
      onClearAttachment={clearAiAttachment}
      onStop={stopAiReply}
      onSubmit={(text) => void sendAiMessage(text)}
    />
  );

  if (isEmpty) {
    return (
      <section className="mx-auto grid min-h-[calc(100dvh-180px)] w-full max-w-[720px] content-center gap-5 px-1 pb-10" aria-label="AI chat">
        <h2 className="m-0 text-center text-[clamp(22px,4.4vw,30px)] font-semibold leading-tight tracking-[-0.01em] text-foreground">
          {chat.attachedItem ? "What would you like to know about this?" : username ? `Hi ${username}, what are you looking for?` : "What are you looking for?"}
        </h2>
        {composer}
        <div className="flex flex-wrap justify-center gap-2">
          {(chat.attachedItem ? ITEM_SUGGESTIONS : SUGGESTIONS).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="rounded-full border border-border bg-background px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => void sendAiMessage(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto flex min-h-[calc(100dvh-88px)] w-full max-w-[760px] flex-col px-1" aria-label="AI chat">
      <div className="flex min-w-0 items-center gap-1 pb-2">
        <h2 className="m-0 min-w-0 flex-1 truncate text-[13px] font-medium text-muted-foreground" title={chat.title}>{chat.title}</h2>
        <Button type="button" variant="ghost" size="sm" className="shrink-0 rounded-full text-muted-foreground" onClick={() => openAiChat()}>
          <PlusIcon aria-hidden="true" />
          New chat
        </Button>
        {chat.chatId && !chat.loading ? (
          <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 rounded-full text-muted-foreground hover:text-destructive" aria-label="Delete chat" title="Delete chat" disabled={chat.sending} onClick={() => void removeChat()}>
            <Trash2Icon aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      {chat.loading ? (
        <p className="m-0 flex items-center justify-center gap-2 py-16 text-[13px] text-muted-foreground" role="status">
          <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
          Loading
        </p>
      ) : chat.error ? (
        <p className="m-0 py-16 text-center text-sm text-destructive" role="alert">{chat.error}</p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-5 p-0 pb-6" aria-live="polite">
          {chat.messages.map((message, index) => (
            <li key={index} className={message.role === "user" ? "flex flex-col items-end gap-1.5" : "flex flex-col items-start gap-2.5"}>
              <AiMessage message={message} />
            </li>
          ))}
        </ol>
      )}
      <div ref={endRef} className="mt-auto scroll-mb-28" />
      <div className="sticky bottom-0 -mx-1 bg-[linear-gradient(to_bottom,transparent,var(--background)_28%)] px-1 pb-[calc(14px+env(safe-area-inset-bottom))] pt-6">
        {composer}
      </div>
    </section>
  );
}

function AiMessage({ message }: { message: AiChatMessage }) {
  if (message.role === "user") {
    return (
      <>
        {message.attachedItem ? (
          <button type="button" className="flex max-w-[min(85%,320px)] items-center gap-2 rounded-xl border border-border bg-card py-1 pl-1 pr-2.5 text-left hover:bg-muted" title={message.attachedItem.name} onClick={() => openAiItem(message.attachedItem!.id)}>
            <AiItemThumb item={message.attachedItem} className="size-9 rounded-lg" />
            <span className="min-w-0 truncate text-[13px] text-foreground">{message.attachedItem.name || "Item"}</span>
          </button>
        ) : null}
        <p className="m-0 max-w-[85%] whitespace-pre-wrap break-words rounded-[20px] bg-muted px-3.5 py-2 text-[15px] leading-[1.5] text-foreground">{message.text}</p>
      </>
    );
  }
  const waiting = message.pending && !message.text;
  return (
    <>
      {message.searching || waiting ? (
        <p className="m-0 flex items-center gap-2 text-[13px] text-muted-foreground" role="status">
          {message.searching ? <SearchIcon className="size-3.5 shrink-0" aria-hidden="true" /> : <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />}
          <span className="min-w-0 truncate">{message.searching ? `Searching the library: ${message.searching}` : "Thinking"}</span>
        </p>
      ) : null}
      {message.text ? (
        <p className={`m-0 max-w-full whitespace-pre-wrap break-words text-[15px] leading-[1.6] ${message.error ? "text-destructive" : "text-foreground"}`}>{message.text}</p>
      ) : null}
      {message.items?.length ? (
        <ul className="m-0 grid w-full list-none grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2 p-0" aria-label="Items found">
          {message.items.map((item) => (
            <li key={item.id}>
              <button type="button" className="group grid w-full gap-1 rounded-xl border-0 bg-transparent p-0 text-left" title={item.name} onClick={() => openAiItem(item.id)}>
                <AiItemThumb item={item} className="aspect-square w-full rounded-xl transition-opacity group-hover:opacity-85" />
                <span className="truncate px-0.5 text-[11.5px] text-muted-foreground">{item.name || item.id}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

// Items without a thumbnail (some audio and documents) show their type instead.
function AiItemThumb({ className, item }: { className: string; item: AiChatItem }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.id]);
  if (failed) {
    return (
      <span className={`grid shrink-0 place-items-center bg-muted text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground ${className}`} aria-hidden="true">
        {item.ext || "file"}
      </span>
    );
  }
  return <img className={`block shrink-0 bg-muted object-cover ${className}`} src={mediaUrl(item.id, "thumb")} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}
