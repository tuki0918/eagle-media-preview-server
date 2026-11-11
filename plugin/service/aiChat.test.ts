import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { aiErrorMessage, aiStatus, createAiAssistant, createAiChatStore, parseSearchDirective, publicItem } = require("../../dist/.generated/plugin-service/aiChat.cjs");

type Message = { content: unknown; role: string };

// Eagle's AI SDK as the assistant uses it: each call to streamText plays the next scripted reply.
function fakeAi(replies: Array<string | Error | ((options: { messages: Message[]; model: unknown }) => string | Error)>, { chat = "openai::chat", image = "" } = {}) {
  const calls: Array<{ messages: Message[]; model: unknown }> = [];
  return {
    calls,
    getDefaultModel: (type: string) => (type === "chat" ? chat : image) || undefined,
    getModel: (id: string) => ({ id }),
    streamText(options: { messages: Message[]; model: unknown; onError?: (event: { error: unknown }) => void }) {
      calls.push({ messages: JSON.parse(JSON.stringify(options.messages)), model: options.model });
      const next = replies.shift();
      const reply = typeof next === "function" ? next(options) : next ?? "";
      return {
        textStream: (async function* () {
          if (reply instanceof Error) {
            options.onError?.({ error: reply });
            return;
          }
          // In small pieces, as a provider streams.
          for (let index = 0; index < reply.length; index += 3) yield reply.slice(index, index + 3);
        })(),
        usage: Promise.resolve({ totalTokens: 10 }),
      };
    },
  };
}

function fakeSession(overrides: Record<string, unknown> = {}) {
  const searches: unknown[] = [];
  return {
    searches,
    session: {
      libraryInfo: async () => ({ name: "Photos", path: "/tmp/Photos.library" }),
      client: {
        folders: async () => ({ items: [{ id: "F1", name: "Trips", children: [{ id: "F2", name: "Kyoto" }] }] }),
        listTags: async () => ({ items: [{ name: "sunset", count: 9 }, { name: "cat", count: 20 }] }),
        searchItems: async (options: unknown) => {
          searches.push({ kind: "text", options });
          return { items: [{ id: "A", name: "beach sunset", ext: "jpg", tags: ["sunset"], filePath: "/secret/a.jpg" }, { id: "B", name: "old", ext: "png", isDeleted: true }], total: 2 };
        },
        listItems: async (options: unknown) => {
          searches.push({ kind: "list", options });
          return { items: [{ id: "C", name: "kyoto temple", ext: "mp4", duration: 12 }], total: 1 };
        },
        itemById: async (id: string) => ({ id, name: "portrait", ext: "jpg", tags: ["people"] }),
        ...overrides,
      },
    },
  };
}

// What the model asked for; the quick search run on every question asks for fewer items.
function modelSearches(searches: unknown[]) {
  return searches.filter((search) => (search as { options: { limit?: number } }).options.limit === 30);
}

const LONG_HELLO = "Hello, what can you do for me in this library?";

async function run(ai: unknown, session: unknown, input: Record<string, unknown> = {}) {
  const events: Array<Record<string, unknown>> = [];
  const result = await createAiAssistant().runTurn({ ai, history: [], onEvent: (event: Record<string, unknown>) => events.push(event), session, text: "hello", username: "mika", ...input });
  return { events, result, text: events.filter((event) => event.type === "text").map((event) => event.delta).join("") };
}

test("AI status needs Eagle's AI SDK and a default chat model", () => {
  assert.deepEqual(aiStatus(null), { available: false, chatModel: "", imageModel: "", reason: "not_installed" });
  assert.deepEqual(aiStatus({ getDefaultModel: () => undefined, getModel() {}, streamText() {} }), { available: false, chatModel: "", imageModel: "", reason: "no_model" });
  assert.deepEqual(aiStatus(fakeAi([], { image: "openai::vision" })), { available: true, chatModel: "openai::chat", imageModel: "openai::vision", reason: "" });
  // An SDK that throws is unavailable, not a crash.
  assert.equal(aiStatus({ getDefaultModel() { throw new Error("boom"); }, getModel() {}, streamText() {} }).available, false);
});

test("search requests are read from a SEARCH line, as JSON or plain words", () => {
  assert.equal(parseSearchDirective("Here are some ideas"), null);
  assert.deepEqual(parseSearchDirective('SEARCH: {"query":"sunset","tags":["travel"],"ext":".MP4","rating":5,"folder":"Trips"}'), { query: "sunset", tags: ["travel"], ext: "mp4", folder: "Trips", rating: 5 });
  assert.deepEqual(parseSearchDirective("search: red car\nand more"), { query: "red car" });
  assert.deepEqual(parseSearchDirective('`SEARCH: {"query": "cat", "rating": 9}`'), { query: "cat", tags: [], ext: "", folder: "" });
  assert.deepEqual(parseSearchDirective("SEARCH: {not json"), { query: "{not json" });
});

test("a plain reply streams through without searching", async () => {
  const ai = fakeAi(["Hello! Ask me about your library."]);
  const { searches, session } = fakeSession();
  // Too long to be a keyword, and it names no tag or folder: the quick search finds nothing.
  const { events, result, text } = await run(ai, session, { text: LONG_HELLO });
  assert.equal(text, "Hello! Ask me about your library.");
  assert.equal(result.text, text);
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.features, []);
  assert.equal(result.model, "openai::chat");
  assert.equal(result.tokens, 10);
  assert.equal(searches.length, 0);
  assert.equal(events.some((event) => event.type === "search"), false);
  // The model is told about the library, and who is asking.
  const system = String(ai.calls[0].messages[0].content);
  assert.match(system, /"Photos"/);
  assert.match(system, /mika/);
  assert.match(system, /Most used tags: cat, sunset/);
  assert.match(system, /Folders: Trips, Kyoto/);
  assert.match(String(ai.calls[0].messages.at(-1)?.content), /quick search of the library for this message found nothing/);
});

test("a search request is run and its results are handed back, never shown as text", async () => {
  const ai = fakeAi(['SEARCH: {"query":"sunset"}', "I found a beach sunset."]);
  const { searches, session } = fakeSession();
  const { events, result, text } = await run(ai, session, { text: "夕焼けの写真ある?" });
  assert.equal(text, "I found a beach sunset.");
  assert.deepEqual(modelSearches(searches), [{ kind: "text", options: { query: "sunset", limit: 30, offset: 0 } }]);
  // Trashed items are left out, and host paths never reach the viewer.
  assert.deepEqual(result.items, [{ id: "A", name: "beach sunset", ext: "jpg" }]);
  assert.deepEqual(result.features, ["search"]);
  assert.deepEqual(events.map((event) => event.type).slice(0, 2), ["search", "items"]);
  assert.equal(events[0].label, "sunset");
  assert.equal(result.tokens, 20);
  const followUp = ai.calls[1].messages;
  assert.equal(followUp.at(-2)?.role, "assistant");
  assert.match(String(followUp.at(-1)?.content), /Search results \(1 of 2 matching items/);
  assert.doesNotMatch(JSON.stringify(followUp), /secret/);
});

test("filters go to the item list, and the model may search at most twice", async () => {
  const ai = fakeAi(['SEARCH: {"folder":"kyoto","ext":"mp4"}', "SEARCH: temple", "SEARCH: again", "unused"]);
  const { searches, session } = fakeSession();
  const { result, text } = await run(ai, session);
  assert.equal(modelSearches(searches).length, 2);
  assert.deepEqual(modelSearches(searches)[0], { kind: "list", options: { keywords: "", tags: [], ext: "mp4", rating: "", folderId: "F2", limit: 30, offset: 0 } });
  // The third request is not run; it is what the model said, so it is shown as its reply.
  assert.equal(ai.calls.length, 3);
  assert.equal(text, "SEARCH: again");
  assert.match(String(ai.calls[2].messages.at(-1)?.content), /Do not search again/);
  assert.equal(result.items.length, 1);
});

test("AI Search results are added when Eagle's AI Search plugin answers", async () => {
  const ai = fakeAi(["SEARCH: dog", "Found one."]);
  const { session } = fakeSession({ aiSearchByText: async () => [{ id: "S", name: "puppy", ext: "jpg" }] });
  const { result } = await run(ai, session);
  assert.deepEqual(result.items.map((item: { id: string }) => item.id), ["A", "S"]);
  assert.deepEqual(result.features, ["smart_search"]);
});

test("a question about an item sends its picture, and falls back when the model can't take it", async () => {
  const libraryPath = await mkdtemp(join(tmpdir(), "ai-chat-library-"));
  await mkdir(join(libraryPath, "images", "ITEM1.info"), { recursive: true });
  await writeFile(join(libraryPath, "images", "ITEM1.info", "portrait_thumbnail.png"), Buffer.from("png-bytes"));
  const { session } = fakeSession();
  (session as { libraryInfo: unknown }).libraryInfo = async () => ({ name: "Photos", path: libraryPath });

  const ai = fakeAi(["A portrait of a person."], { image: "openai::vision" });
  const { result } = await run(ai, session, { attachedItemId: "ITEM1", text: "what is this?" });
  assert.deepEqual(ai.calls[0].model, { id: "openai::vision" });
  const content = ai.calls[0].messages.at(-1)?.content as Array<{ image?: string; text?: string; type: string }>;
  assert.equal(content[1].image, `data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}`);
  assert.match(String(content[0].text), /portrait/);
  assert.deepEqual(result.features, ["image"]);
  assert.deepEqual(result.attachedItem, { id: "ITEM1", name: "portrait", ext: "jpg" });

  // The vision model fails, the chat model fails with the picture, then words alone work.
  const fallback = fakeAi([new Error("no images"), new Error("no images"), "It is a file named portrait."], { image: "openai::vision" });
  const second = await run(fallback, session, { attachedItemId: "ITEM1", text: "what is this?" });
  assert.equal(second.text, "It is a file named portrait.");
  assert.equal(fallback.calls.length, 3);
  assert.equal(typeof fallback.calls[2].messages.at(-1)?.content, "string");
  assert.deepEqual(second.result.features, []);
});

test("provider errors are reported without their details", async () => {
  const { session } = fakeSession();
  const error = Object.assign(new Error("401 key sk-secret rejected at https://api.example.com"), { status: 401 });
  await assert.rejects(run(fakeAi([error]), session), (thrown) => {
    assert.doesNotMatch(aiErrorMessage(thrown), /sk-secret|example\.com/);
    assert.match(aiErrorMessage(thrown), /check the AI settings in Eagle/);
    return true;
  });
  await assert.rejects(run(null, session), /isn't set up/);
});

test("failures say what an admin can fix, and only an admin sees what the provider said", () => {
  const noChat = Object.assign(new Error('"qwen3-embedding:0.6b" does not support chat'), { status: 400 });
  assert.match(aiErrorMessage(noChat), /can't chat/);
  assert.doesNotMatch(aiErrorMessage(noChat), /provider said/);
  assert.match(aiErrorMessage(noChat, { detail: true }), /The provider said: "qwen3-embedding:0\.6b" does not support chat/);
  assert.match(aiErrorMessage(new Error("[ollama] Network error: fetch failed")), /can't be reached/);
  assert.match(aiErrorMessage(Object.assign(new Error("model 'x' not found"), { status: 404 })), /wasn't found/);
  assert.match(aiErrorMessage(new Error("something odd")), /couldn't answer right now/);
  const leaky = aiErrorMessage(Object.assign(new Error("bad key sk-abcdef1234567890 at https://api.example.com/v1?api_key=topsecret99"), { status: 401 }), { detail: true });
  assert.doesNotMatch(leaky, /abcdef1234567890|topsecret99/);
});

test("a model's <think> reasoning is never shown or mistaken for the reply", async () => {
  const { searches, session } = fakeSession();
  const plain = await run(fakeAi(["<think>\nThe user greets me. SEARCH: nothing\n</think>\n\nHello there."]), session);
  assert.equal(plain.text, "Hello there.");
  assert.equal(modelSearches(searches).length, 0);

  const searching = await run(fakeAi(['<think>I should look.</think>\nSEARCH: {"query":"sunset"}', "<think>ok</think>Found it."]), session);
  assert.equal(searching.text, "Found it.");
  assert.equal(modelSearches(searches).length, 1);

  // Reasoning that never ends leaves nothing to say, so the fallback line is used.
  const endless = await run(fakeAi(["<think>still thinking"]), session, { text: LONG_HELLO });
  assert.equal(endless.text, "I couldn't come up with an answer. Try asking in another way.");
});

test("tags and folders the model guesses are read as the closest real ones, or as words", async () => {
  const ai = fakeAi(['SEARCH: {"tags":["Sunsets","dog"],"folder":"kyoto"}', "Done."]);
  const { searches, session } = fakeSession();
  await run(ai, session, { text: LONG_HELLO });
  // "Sunsets" is the tag "sunset", "kyoto" the folder "Kyoto"; "dog" isn't a tag, so it is a word.
  assert.deepEqual(modelSearches(searches)[0], { kind: "list", options: { keywords: "dog", tags: ["sunset"], ext: "", rating: "", folderId: "F2", limit: 30, offset: 0 } });
  const told = String(ai.calls[1].messages.at(-1)?.content);
  assert.match(told, /The tag "Sunsets" was read as "sunset"/);
  assert.match(told, /There is no tag "dog", so it was searched as a word/);
  assert.match(told, /The folder "kyoto" was read as "Kyoto"/);
});

test("when nothing matches every condition, conditions are dropped one at a time", async () => {
  const ai = fakeAi(['SEARCH: {"query":"beach","tags":["sunset"],"ext":"gif","rating":5}', "Close matches."]);
  const { searches, session } = fakeSession({
    listItems: async (options: Record<string, unknown>) => {
      searches.push({ kind: "list", options });
      // Only a search without a file type or rating finds anything.
      return options.ext || options.rating ? { items: [], total: 0 } : { items: [{ id: "C", name: "beach", ext: "jpg" }], total: 1 };
    },
  });
  const { result } = await run(ai, session, { text: LONG_HELLO });
  const lists = modelSearches(searches).map((search) => (search as { options: Record<string, unknown> }).options);
  assert.deepEqual(lists.map((options) => [options.ext, options.rating, options.keywords, options.tags]), [
    ["gif", "5", "beach", ["sunset"]],
    ["", "5", "beach", ["sunset"]],
    ["", "", "beach", ["sunset"]],
  ]);
  assert.deepEqual(result.items.map((item: { id: string }) => item.id), ["C"]);
  assert.match(String(ai.calls[1].messages.at(-1)?.content), /No item matched everything, so these results leave out the file type, the rating/);

  // Nothing at all with filters: the words (and tag names) are searched on their own.
  const none = fakeAi(['SEARCH: {"tags":["sunset"],"ext":"gif"}', "Nothing."]);
  const empty = fakeSession({ listItems: async () => ({ items: [], total: 0 }) });
  const second = await run(none, empty.session, { text: LONG_HELLO });
  assert.deepEqual(modelSearches(empty.searches), [{ kind: "text", options: { query: "sunset", limit: 30, offset: 0 } }]);
  assert.deepEqual(second.result.items.map((item: { id: string }) => item.id), ["A"]);
  assert.match(String(none.calls[1].messages.at(-1)?.content), /leave out the file type, the tags/);
});

test("every question gets a quick search, so items turn up even when the model doesn't search", async () => {
  const ai = fakeAi(["Here are your cat pictures."]);
  const { searches, session } = fakeSession({ aiSearchByText: async () => [{ id: "M1", name: "kitten nap", ext: "jpg" }, { id: "M2", name: "random", ext: "jpg" }] });
  const { events, result } = await run(ai, session, { text: "Show me cat pictures from my party please, thanks a lot" });
  // "cat" is a tag named in the question; "party" holds "art" but isn't that word.
  assert.deepEqual(searches, [{ kind: "list", options: { tags: ["cat"], limit: 12, offset: 0 } }]);
  const question = String(ai.calls[0].messages.at(-1)?.content);
  assert.match(question, /including tags "cat" named in it/);
  assert.match(question, /kyoto temple/);
  assert.match(question, /kitten nap/);
  // Certain matches are shown; items found only by meaning are shown when the reply names them.
  assert.deepEqual(result.items.map((item: { id: string }) => item.id), ["C"]);
  assert.equal(events.at(-1)?.type, "items");
  assert.deepEqual(result.features, ["smart_search"]);

  const named = await run(fakeAi(["The best one is kitten nap."]), session, { text: "Which is the cutest sleeping animal here?" });
  assert.deepEqual(named.result.items.map((item: { id: string }) => item.id), ["M1"]);

  // A question about one item skips it.
  const about = fakeSession();
  await run(fakeAi(["A portrait."]), about.session, { attachedItemId: "ITEM1", text: "what is this?" });
  assert.equal(about.searches.length, 0);
});

test("the owner's notes about the library are passed to the model", async () => {
  const ai = fakeAi(["ok"]);
  const { session } = fakeSession({ listTags: async () => ({ items: [{ name: "art", count: 1 }] }) });
  await run(ai, session, { instructions: "  Tags are in English.\nArtists are folders.  ", text: LONG_HELLO });
  assert.match(String(ai.calls[0].messages[0].content), /Notes from the owner of this library[^\n]*\nTags are in English\.\nArtists are folders\.$/);
});

test("an embedding model set as the chat model is skipped for the vision model", async () => {
  const { session } = fakeSession();
  const ai = fakeAi(["Hi from the vision model."], { chat: "ollama::qwen3-embedding:0.6b", image: "ollama::qwen3-vl:8b" });
  const { result, text } = await run(ai, session);
  assert.equal(text, "Hi from the vision model.");
  assert.equal(result.model, "ollama::qwen3-vl:8b");
  assert.deepEqual(ai.calls.map((call) => call.model), [{ id: "ollama::qwen3-vl:8b" }]);

  // A chat model that fails before saying anything falls back to the vision model too.
  const failing = fakeAi([new Error("down"), "Second model answers."], { image: "openai::vision" });
  const second = await run(failing, session);
  assert.equal(second.text, "Second model answers.");
  assert.equal(second.result.model, "openai::vision");
});

test("chats are kept per user and per library, and survive a restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ai-chats-"));
  const store = createAiChatStore({ dir });
  const chat = store.create("LIB1", "  Find   my sunset photos from the trip to Kyoto last autumn please  ");
  assert.equal(chat.title, "Find my sunset photos from the trip to Kyoto la…");
  chat.messages.push({ role: "user", text: "Find sunsets", at: 1 }, { role: "assistant", text: "Here.", at: 2, items: [{ id: "A", name: "a", ext: "jpg", filePath: "/x" }] });
  await store.save("mika", chat);
  await store.save("ken", { ...store.create("LIB1", "Ken's question"), messages: [{ role: "user", text: "hi", at: 1 }] });

  assert.deepEqual((await store.list("mika", "LIB1")).map((entry: { title: string }) => entry.title), [chat.title]);
  assert.deepEqual(await store.list("mika", "LIB2"), []);
  assert.equal(await store.get("ken", "LIB1", chat.id), null);
  assert.equal(await store.get("mika", "LIB2", chat.id), null);

  // One file per user; a new store reads them back.
  assert.equal((await readdir(dir)).length, 2);
  const restored = createAiChatStore({ dir });
  const saved = await restored.get("mika", "LIB1", chat.id);
  assert.equal(saved.messages.length, 2);
  assert.deepEqual(saved.messages[1].items, [{ id: "A", name: "a", ext: "jpg" }]);
  for (const file of await readdir(dir)) assert.doesNotMatch(await readFile(join(dir, file), "utf8"), /Ken's question.*Find sunsets|Find sunsets.*Ken's question/s);

  assert.equal(await restored.remove("ken", "LIB1", chat.id), false);
  assert.equal(await restored.remove("mika", "LIB1", chat.id), true);
  assert.deepEqual(await createAiChatStore({ dir }).list("mika", "LIB1"), []);
});

test("the chat store keeps only the newest chats and messages", async () => {
  let at = 0;
  const store = createAiChatStore({ maxChatsPerUser: 2, maxMessagesPerChat: 3, now: () => ++at });
  for (const title of ["one", "two", "three"]) await store.save("mika", store.create("LIB", title));
  assert.deepEqual((await store.list("mika", "LIB")).map((entry: { title: string }) => entry.title), ["three", "two"]);
  const chat = store.create("LIB", "long");
  chat.messages = [1, 2, 3, 4, 5].map((n) => ({ role: "user", text: String(n), at: n }));
  assert.deepEqual((await store.save("mika", chat)).messages.map((message: { text: string }) => message.text), ["3", "4", "5"]);
});

test("items sent to a viewer never carry host paths", () => {
  assert.deepEqual(publicItem({ id: "A", name: "a", filePath: "/x", thumbnailPath: "/y", fileURL: "file:///x", thumbnailURL: "file:///y", tags: ["t"] }), { id: "A", name: "a", tags: ["t"] });
  assert.equal(publicItem({ name: "no id" }), null);
  assert.equal(publicItem(undefined), null);
});
