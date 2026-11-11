import { ApiError, deleteJson, errorMessage, getJson, postStream } from "./api";
import { emptyAiChat, getAiChatState, setAiChatState, type AiChatItem, type AiChatMessage, type AiChatSummary } from "./aiChatState";
import type { EagleItem } from "./types";

interface AiChatHooks {
  /** Returns true when the error ended the session (the viewer went back to sign-in). */
  onAuthError: (error: unknown) => boolean;
  /** A new chat got its id from the server. */
  onChatCreated: (chatId: string) => void;
}

/** One line of the reply stream. */
export type AiStreamEvent =
  | { id: string; title: string; type: "chat" }
  | { label: string; type: "search" }
  | { items: AiChatItem[]; type: "items" }
  | { delta: string; type: "text" }
  | { message: AiChatMessage; type: "done" }
  | { code?: string; message: string; type: "error" };

export const AI_MESSAGE_MAX_CHARS = 4000;
const STOPPED_TEXT = "Stopped.";

let hooks: AiChatHooks = { onAuthError: () => false, onChatCreated: () => {} };
// Bumped whenever the chat on screen changes, so a reply or a load for the previous one is dropped.
let chatRun = 0;
let chatsRequestId = 0;
let replyAbort: AbortController | null = null;

export function configureAiChat(nextHooks: AiChatHooks) {
  hooks = nextHooks;
}

export function setAiAvailable(available: boolean) {
  if (getAiChatState().available !== available) setAiChatState({ available });
}

/** Forgets everything: the session ended or the library changed. */
export function resetAiChat() {
  leaveChat();
  chatsRequestId += 1;
  setAiChatState({ ...emptyAiChat(), available: false, chats: [] });
}

function leaveChat() {
  chatRun += 1;
  replyAbort?.abort();
  replyAbort = null;
}

export async function loadAiChats() {
  const requestId = ++chatsRequestId;
  try {
    const data = await getJson<{ items?: AiChatSummary[] }>("/api/ai/chats");
    if (requestId !== chatsRequestId) return;
    setAiChatState({ chats: Array.isArray(data.items) ? data.items : [] });
  } catch (error) {
    if (requestId === chatsRequestId) hooks.onAuthError(error);
  }
}

export function startNewAiChat() {
  leaveChat();
  setAiChatState(emptyAiChat());
}

/** Shows a saved chat. Returns false when it can't be opened (deleted, or another user's). */
export async function openSavedAiChat(chatId: string) {
  leaveChat();
  const run = chatRun;
  setAiChatState({ ...emptyAiChat(), chatId, loading: true });
  try {
    const data = await getJson<{ id?: string; messages?: AiChatMessage[]; title?: string }>(`/api/ai/chats/${encodeURIComponent(chatId)}`);
    if (run !== chatRun) return true;
    setAiChatState({ loading: false, messages: Array.isArray(data.messages) ? data.messages : [], title: data.title || "" });
    return true;
  } catch (error) {
    if (run !== chatRun) return true;
    if (hooks.onAuthError(error)) return true;
    if (error instanceof ApiError && error.status === 404) return false;
    setAiChatState({ loading: false, error: errorMessage(error) });
    return true;
  }
}

export function attachAiItem(item: EagleItem) {
  const id = String(item.id || "");
  if (!id) return;
  setAiChatState({
    attachedItem: { id, name: String(item.name || ""), ext: String(item.ext || ""), width: Number(item.width) || undefined, height: Number(item.height) || undefined },
  });
}

export function clearAiAttachment() {
  setAiChatState({ attachedItem: null });
}

export function stopAiReply() {
  replyAbort?.abort();
}

export async function deleteAiChat(chatId: string) {
  try {
    await deleteJson(`/api/ai/chats/${encodeURIComponent(chatId)}`);
  } catch (error) {
    if (hooks.onAuthError(error)) return false;
    throw error;
  }
  setAiChatState({ chats: getAiChatState().chats.filter((chat) => chat.id !== chatId) });
  return true;
}

function updateReply(run: number, change: (reply: AiChatMessage) => AiChatMessage) {
  if (run !== chatRun) return;
  const messages = [...getAiChatState().messages];
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return;
  messages[messages.length - 1] = change(last);
  setAiChatState({ messages });
}

export async function sendAiMessage(rawText: string) {
  const text = rawText.trim().slice(0, AI_MESSAGE_MAX_CHARS);
  const before = getAiChatState();
  if (!text || before.sending || before.loading) return;
  const run = chatRun;
  const attachedItem = before.attachedItem;
  const controller = new AbortController();
  replyAbort = controller;
  setAiChatState({
    attachedItem: null,
    error: "",
    messages: [...before.messages, { role: "user", text, ...(attachedItem ? { attachedItem } : {}) }, { role: "assistant", text: "", pending: true }],
    sending: true,
  });
  try {
    const response = await postStream(
      `/api/ai/chats/${encodeURIComponent(before.chatId || "new")}/messages`,
      { text, ...(attachedItem ? { itemId: attachedItem.id } : {}) },
      controller.signal,
    );
    let finished = false;
    await readAiStream(response, (event) => {
      if (run !== chatRun) return;
      if (event.type === "chat") {
        const isNew = !getAiChatState().chatId;
        // A list requested before this chat existed would arrive without it.
        chatsRequestId += 1;
        setAiChatState({
          chatId: event.id,
          title: event.title,
          chats: [{ id: event.id, title: event.title, updatedAt: Date.now() }, ...getAiChatState().chats.filter((chat) => chat.id !== event.id)],
        });
        if (isNew) hooks.onChatCreated(event.id);
      } else if (event.type === "search") {
        updateReply(run, (reply) => ({ ...reply, searching: event.label }));
      } else if (event.type === "items") {
        updateReply(run, (reply) => ({ ...reply, items: event.items }));
      } else if (event.type === "text") {
        updateReply(run, (reply) => ({ ...reply, searching: undefined, text: reply.text + event.delta }));
      } else if (event.type === "done") {
        finished = true;
        updateReply(run, () => ({ ...event.message, role: "assistant" }));
      } else if (event.type === "error") {
        finished = true;
        updateReply(run, (reply) => ({ role: "assistant", text: reply.text.trim() ? `${reply.text}\n\n${event.message}` : event.message, error: true, items: reply.items }));
      }
    });
    // The connection ended before the server said how the reply went.
    if (!finished) updateReply(run, (reply) => ({ ...reply, pending: false, searching: undefined, error: !reply.text.trim(), text: reply.text.trim() ? reply.text : "The reply was cut off. Try again." }));
  } catch (error) {
    if (controller.signal.aborted) {
      updateReply(run, (reply) => ({ ...reply, pending: false, searching: undefined, text: reply.text.trim() ? reply.text : STOPPED_TEXT }));
    } else if (!hooks.onAuthError(error)) {
      updateReply(run, (reply) => ({ ...reply, pending: false, searching: undefined, error: true, text: replyErrorMessage(error) }));
    }
  } finally {
    if (replyAbort === controller) replyAbort = null;
    if (run === chatRun) setAiChatState({ sending: false });
  }
}

function replyErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.code === "AI_UNAVAILABLE") return "AI chat isn't available right now.";
  if (error instanceof ApiError) return error.message;
  return "Couldn't reach the media server. Try again in a bit.";
}

/** Reads the reply stream: one JSON object per line. Lines that aren't JSON are skipped. */
export async function readAiStream(response: Response, onEvent: (event: AiStreamEvent) => void) {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  const flush = (line: string) => {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line) as AiStreamEvent | null;
      if (event && typeof event === "object" && typeof event.type === "string") onEvent(event);
    } catch {
      // Not an event.
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      flush(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  flush(buffer + decoder.decode());
}
