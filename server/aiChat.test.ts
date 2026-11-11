import { test } from "vitest";
import assert from "node:assert/strict";
import { createViewerServer, sha256 } from "./viewerServer.js";

type Entry = Record<string, unknown>;

function fakeAi(replies: string[], { chat = "openai::chat" } = {}) {
  return {
    getDefaultModel: (type: string) => (type === "chat" ? chat || undefined : undefined),
    getModel: (id: string) => ({ id }),
    streamText() {
      const reply = replies.shift() ?? "ok";
      return { textStream: (async function* () { yield reply; })(), usage: Promise.resolve({ totalTokens: 7 }) };
    },
  };
}

function eagleClient() {
  return {
    async appInfo() { return { version: "4.0.0" }; },
    async libraryInfo() { return { path: "/tmp/Test.library", name: "Test Library" }; },
    async folders() { return { items: [] }; },
    async listTags() { return { items: [] }; },
    async searchItems() { return { items: [{ id: "ITEM1", name: "sunset", ext: "jpg", filePath: "/host/secret.jpg" }], total: 1 }; },
    async listItems() { return { items: [], total: 0 }; },
    async itemById(id: string) { return id === "ITEM1" ? { id, name: "sunset", ext: "jpg", tags: ["sky"], filePath: "/host/secret.jpg", thumbnailPath: "/host/thumb.png" } : {}; },
  };
}

const users = [
  { username: "mika", passwordHash: sha256("one"), role: "viewer" },
  { username: "ken", passwordHash: sha256("two"), role: "viewer" },
];

async function withServer(options: Record<string, unknown>, run: (context: { as: (cookie?: string) => (path: string, init?: RequestInit) => Promise<Response>; login: (username: string, password: string) => Promise<string>; origin: string }) => Promise<void>) {
  const viewer = createViewerServer({ host: "127.0.0.1", port: 0, eagleClient: eagleClient(), ...options });
  await viewer.start();
  const origin = `http://127.0.0.1:${viewer.status().port}`;
  const login = async (username: string, password: string) => {
    const response = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ username, password }) });
    assert.equal(response.status, 200);
    return String(response.headers.get("set-cookie")).split(";")[0];
  };
  // Requests as a viewer sends them: with the session cookie and the connected library's id.
  const as = (cookie = "") => async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (cookie) headers.set("Cookie", cookie);
    if (init.method && init.method !== "GET") headers.set("Origin", origin);
    if (init.body) headers.set("Content-Type", "application/json");
    const health = await fetch(`${origin}/api/health`, { headers: cookie ? { Cookie: cookie } : {} });
    const libraryId = health.ok ? (await health.json())?.library?.id : "";
    if (libraryId) headers.set("X-Library-Id", libraryId);
    return fetch(`${origin}${path}`, { ...init, headers });
  };
  try {
    await run({ as, login, origin });
  } finally {
    await viewer.stop();
  }
}

async function events(response: Response) {
  return (await response.text()).split("\n").filter(Boolean).map((line) => JSON.parse(line) as Entry);
}

test("AI chat is offered only to signed-in users, only when it is on and Eagle has a chat model", async () => {
  const connect = async (request: (path: string, init?: RequestInit) => Promise<Response>) => (await (await request("/api/connect", { method: "POST", body: "{}" })).json()).features;

  await withServer({ authUsers: users, aiChat: { enabled: true, getAi: () => fakeAi([]) } }, async ({ as, login }) => {
    const mika = as(await login("mika", "one"));
    assert.deepEqual(await connect(mika), { ai: true });
    assert.equal((await mika("/api/ai/chats")).status, 200);
    assert.equal((await as()("/api/ai/chats")).status, 401);
  });
  // Off, no model set, or no sign-in at all: the routes don't exist.
  for (const options of [
    { authUsers: users },
    { authUsers: users, aiChat: { enabled: false, getAi: () => fakeAi([]) } },
    { authUsers: users, aiChat: { enabled: true, getAi: () => fakeAi([], { chat: "" }) } },
    { authUsers: users, aiChat: { enabled: true, getAi: () => null } },
  ]) {
    await withServer(options, async ({ as, login }) => {
      const mika = as(await login("mika", "one"));
      assert.equal(await connect(mika), undefined);
      const response = await mika("/api/ai/chats");
      assert.equal(response.status, 404);
      assert.equal((await response.json()).code, "AI_UNAVAILABLE");
    });
  }
  await withServer({ aiChat: { enabled: true, getAi: () => fakeAi([]) } }, async ({ as }) => {
    assert.equal(await connect(as()), undefined);
    assert.equal((await as()("/api/ai/chats/new/messages", { method: "POST", body: JSON.stringify({ text: "hi" }) })).status, 404);
  });
});

test("a reply is streamed, saved to the asking user's chats, and logged without what was said", async () => {
  const log: Entry[] = [];
  const ai = fakeAi(['SEARCH: {"query":"sunset"}', "Found a sunset.", "Second answer."]);
  await withServer({ authUsers: users, aiChat: { enabled: true, getAi: () => ai }, accessLog: { record: (entry: Entry) => log.push(entry), touch() {} } }, async ({ as, login }) => {
    const mika = as(await login("mika", "one"));
    const ken = as(await login("ken", "two"));

    const response = await mika("/api/ai/chats/new/messages", { method: "POST", body: JSON.stringify({ text: "夕焼けの写真は?" }) });
    assert.equal(response.status, 200);
    assert.match(String(response.headers.get("content-type")), /application\/x-ndjson/);
    const stream = await events(response);
    assert.deepEqual(stream.map((event) => event.type), ["chat", "search", "items", "text", "done"]);
    const chatId = String(stream[0].id);
    assert.equal(stream[0].title, "夕焼けの写真は?");
    assert.deepEqual(stream[2].items, [{ id: "ITEM1", name: "sunset", ext: "jpg" }]);
    assert.doesNotMatch(JSON.stringify(stream), /secret/);

    // The chat continues under its id, and only for the user who started it.
    const next = await events(await mika(`/api/ai/chats/${chatId}/messages`, { method: "POST", body: JSON.stringify({ text: "more" }) }));
    assert.equal(next.at(-1)?.type, "done");
    const saved = await (await mika(`/api/ai/chats/${chatId}`)).json();
    assert.deepEqual(saved.messages.map((message: Entry) => [message.role, message.text]), [["user", "夕焼けの写真は?"], ["assistant", "Found a sunset."], ["user", "more"], ["assistant", "Second answer."]]);
    assert.deepEqual((await (await mika("/api/ai/chats")).json()).items.map((chat: Entry) => chat.id), [chatId]);

    assert.deepEqual((await (await ken("/api/ai/chats")).json()).items, []);
    assert.equal((await ken(`/api/ai/chats/${chatId}`)).status, 404);
    assert.equal((await ken(`/api/ai/chats/${chatId}/messages`, { method: "POST", body: JSON.stringify({ text: "peek" }) })).status, 404);
    assert.equal((await ken(`/api/ai/chats/${chatId}`, { method: "DELETE" })).status, 200);
    assert.equal((await mika(`/api/ai/chats/${chatId}`)).status, 200, "another user's delete removes nothing");

    assert.equal((await mika(`/api/ai/chats/${chatId}`, { method: "DELETE" })).status, 200);
    assert.equal((await mika(`/api/ai/chats/${chatId}`)).status, 404);

    const aiEntries = log.filter((entry) => entry.type === "ai");
    assert.equal(aiEntries.length, 2);
    assert.deepEqual(
      { event: aiEntries[0].event, fields: aiEntries[0].fields, model: aiEntries[0].model, status: aiEntries[0].status, tokens: aiEntries[0].tokens, user: aiEntries[0].user },
      { event: "ai_chat", fields: ["search"], model: "openai::chat", status: 200, tokens: 14, user: "mika" },
    );
    assert.doesNotMatch(JSON.stringify(log), /夕焼け|Found a sunset|Second answer|sunset"/);
  });
});

test("AI chat refuses empty or oversized questions and reports a failed reply", async () => {
  const log: Entry[] = [];
  const failing = {
    getDefaultModel: () => "openai::chat",
    getModel: () => ({}),
    streamText({ onError }: { onError?: (event: { error: unknown }) => void }) {
      return { textStream: (async function* () { onError?.({ error: Object.assign(new Error("sk-secret"), { status: 429 }) }); })() };
    },
  };
  await withServer({ authUsers: users, aiChat: { enabled: true, getAi: () => failing }, accessLog: { record: (entry: Entry) => log.push(entry), touch() {} } }, async ({ as, login }) => {
    const mika = as(await login("mika", "one"));
    assert.equal((await mika("/api/ai/chats/new/messages", { method: "POST", body: JSON.stringify({ text: "  " }) })).status, 400);
    assert.equal((await mika("/api/ai/chats/new/messages", { method: "POST", body: JSON.stringify({ text: "x".repeat(4001) }) })).status, 400);
    assert.equal((await mika("/api/ai/chats", { method: "POST", body: "{}" })).status, 405);

    const stream = await events(await mika("/api/ai/chats/new/messages", { method: "POST", body: JSON.stringify({ text: "hi" }) }));
    assert.equal(stream.at(-1)?.type, "error");
    assert.match(String(stream.at(-1)?.message), /busy or out of quota/);
    assert.doesNotMatch(JSON.stringify(stream), /sk-secret/);
    // The question stays in the chat, with the failure marked.
    const saved = await (await mika(`/api/ai/chats/${stream[0].id}`)).json();
    assert.deepEqual(saved.messages.map((message: Entry) => [message.role, Boolean(message.error)]), [["user", false], ["assistant", true]]);
    assert.deepEqual(log.filter((entry) => entry.type === "ai").map((entry) => entry.status), [502]);
  });
});

test("one item can be read by id, without the host's paths", async () => {
  await withServer({}, async ({ as }) => {
    const response = await as()("/api/items/ITEM1");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { item: { id: "ITEM1", name: "sunset", ext: "jpg", tags: ["sky"] } });
    assert.equal((await as()("/api/items/NOPE")).status, 404);
    assert.equal((await as()("/api/items/ITEM1", { method: "POST", body: "{}" })).status, 405);
  });
});
