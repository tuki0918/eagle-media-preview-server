/** An item as the AI chat lists it; the full item is fetched when it is opened. */
export interface AiChatItem {
  duration?: number;
  ext?: string;
  height?: number;
  id: string;
  name?: string;
  star?: number;
  width?: number;
}

export interface AiChatMessage {
  /** The item the question was asked about. */
  attachedItem?: AiChatItem;
  /** The reply failed; `text` says why. */
  error?: boolean;
  /** Items the assistant found for this reply. */
  items?: AiChatItem[];
  /** The reply is still being written. */
  pending?: boolean;
  role: "assistant" | "user";
  /** What the assistant is looking for in the library right now. */
  searching?: string;
  text: string;
}

export interface AiChatSummary {
  id: string;
  title: string;
  updatedAt?: number;
}

export interface AiChatState {
  /** The item the next question is about. */
  attachedItem: AiChatItem | null;
  /** The server offers AI chat to this user. */
  available: boolean;
  /** "" while the chat on screen hasn't been sent yet. */
  chatId: string;
  /** This user's chats in the connected library, newest first. */
  chats: readonly AiChatSummary[];
  /** Why the chat couldn't be loaded. */
  error: string;
  loading: boolean;
  messages: readonly AiChatMessage[];
  sending: boolean;
  title: string;
}

const listeners = new Set<() => void>();
const emptyChat = { attachedItem: null, chatId: "", error: "", loading: false, messages: [], sending: false, title: "" } as const;
let currentAiChat: AiChatState = { ...emptyChat, available: false, chats: [] };

export function getAiChatState() {
  return currentAiChat;
}

export function setAiChatState(patch: Partial<AiChatState>) {
  currentAiChat = { ...currentAiChat, ...patch };
  for (const listener of listeners) {
    listener();
  }
}

/** A chat with nothing in it; the chat list and availability are kept. */
export function emptyAiChat(): Pick<AiChatState, "attachedItem" | "chatId" | "error" | "loading" | "messages" | "sending" | "title"> {
  return { ...emptyChat };
}

export function subscribeAiChatState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
