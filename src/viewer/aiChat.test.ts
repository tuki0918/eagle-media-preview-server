// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { configureAiChat, loadAiChats, openSavedAiChat, readAiStream, resetAiChat, sendAiMessage, startNewAiChat, type AiStreamEvent } from "./aiChat";
import { getAiChatState, setAiChatState } from "./aiChatState";

function streamResponse(chunks: string[], init: ResponseInit = {}) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }), { status: 200, ...init });
}

describe("AI chat", () => {
  beforeEach(() => {
    resetAiChat();
    configureAiChat({ onAuthError: () => false, onChatCreated: () => {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  test("reads one event per line, however the bytes are split", async () => {
    const events: AiStreamEvent[] = [];
    await readAiStream(streamResponse(['{"type":"chat","id":"c1","ti', 'tle":"T"}\n{"type":"text","delta":"こん', 'にちは"}\nnot json\n\n{"type":"done","message":{"role":"assistant","text":"x"}}']), (event) => events.push(event));
    expect(events.map((event) => event.type)).toEqual(["chat", "text", "done"]);
    expect(events[1]).toEqual({ type: "text", delta: "こんにちは" });
  });

  test("a question shows at once, the reply fills in as it arrives, and the new chat is listed", async () => {
    const created: string[] = [];
    configureAiChat({ onAuthError: () => false, onChatCreated: (id) => created.push(id) });
    const requests: Array<{ body: unknown; url: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      requests.push({ url, body: JSON.parse(String(init.body)) });
      // The question is on screen before the server answers.
      expect(getAiChatState().messages.map((message) => [message.role, message.text, Boolean(message.pending)])).toEqual([["user", "find cats", false], ["assistant", "", true]]);
      return streamResponse([
        '{"type":"chat","id":"c1","title":"find cats"}\n',
        '{"type":"search","label":"cat"}\n{"type":"items","items":[{"id":"A","name":"cat"}]}\n',
        '{"type":"text","delta":"Two "}\n{"type":"text","delta":"cats."}\n',
        '{"type":"done","message":{"role":"assistant","text":"Two cats.","items":[{"id":"A","name":"cat"}]}}\n',
      ]);
    }));
    setAiChatState({ available: true, attachedItem: { id: "ITEM9", name: "nine" } });
    await sendAiMessage("  find cats ");
    const state = getAiChatState();
    expect(requests).toEqual([{ url: "/api/ai/chats/new/messages", body: { text: "find cats", itemId: "ITEM9" } }]);
    expect(state.sending).toBe(false);
    expect(state.chatId).toBe("c1");
    expect(state.attachedItem).toBeNull();
    expect(state.chats.map((chat) => chat.id)).toEqual(["c1"]);
    expect(created).toEqual(["c1"]);
    expect(state.messages[0]).toEqual({ role: "user", text: "find cats", attachedItem: { id: "ITEM9", name: "nine" } });
    expect(state.messages[1]).toEqual({ role: "assistant", text: "Two cats.", items: [{ id: "A", name: "cat" }] });

    // The next question goes to the same chat.
    await sendAiMessage("more");
    expect(requests[1].url).toBe("/api/ai/chats/c1/messages");
    expect(created).toEqual(["c1"]);
  });

  test("a chat list requested before the chat existed doesn't hide the new chat", async () => {
    let answerList!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url === "/api/ai/chats"
      ? new Promise<Response>((resolve) => { answerList = resolve; })
      : streamResponse(['{"type":"chat","id":"c1","title":"t"}\n{"type":"done","message":{"role":"assistant","text":"ok"}}\n'])));
    const listing = loadAiChats();
    await sendAiMessage("hi");
    answerList(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    await listing;
    expect(getAiChatState().chats.map((chat) => chat.id)).toEqual(["c1"]);
  });

  test("a failed reply is shown in the chat; an expired session is handed to the viewer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse(['{"type":"chat","id":"c1","title":"t"}\n{"type":"text","delta":"Part"}\n{"type":"error","message":"The AI model couldn\'t answer right now."}\n'])));
    await sendAiMessage("hi");
    expect(getAiChatState().messages[1]).toMatchObject({ error: true, text: "Part\n\nThe AI model couldn't answer right now." });

    startNewAiChat();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Wait for the current reply to finish" }), { status: 429 })));
    await sendAiMessage("hi");
    expect(getAiChatState().messages[1]).toMatchObject({ error: true, text: "Wait for the current reply to finish" });

    startNewAiChat();
    const authErrors: unknown[] = [];
    configureAiChat({ onAuthError: (error) => { authErrors.push(error); return true; }, onChatCreated: () => {} });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Authentication required" }), { status: 401 })));
    await sendAiMessage("hi");
    expect(authErrors).toHaveLength(1);
  });

  test("a reply for a chat that is no longer on screen is dropped", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn(async () => {
      await gate;
      return streamResponse(['{"type":"chat","id":"c1","title":"t"}\n{"type":"done","message":{"role":"assistant","text":"late"}}\n']);
    }));
    const sending = sendAiMessage("hi");
    startNewAiChat();
    release();
    await sending;
    expect(getAiChatState()).toMatchObject({ chatId: "", messages: [], sending: false });
  });

  test("a saved chat that is gone reports false so the viewer can start a new one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Chat not found" }), { status: 404 })));
    expect(await openSavedAiChat("gone")).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "c2", title: "Old", messages: [{ role: "user", text: "q" }] }), { status: 200 })));
    expect(await openSavedAiChat("c2")).toBe(true);
    expect(getAiChatState()).toMatchObject({ chatId: "c2", loading: false, title: "Old", messages: [{ role: "user", text: "q" }] });
  });
});
