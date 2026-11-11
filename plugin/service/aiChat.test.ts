import { test } from "vitest";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
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

// Every search but the one-item read of the library's size.
function realSearches(searches: unknown[]) {
  return searches.filter((search) => (search as { options: { limit?: number } }).options.limit !== 1);
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
  assert.deepEqual(parseSearchDirective('SEARCH: {"query":"sunset","tags":["travel"],"ext":".MP4","rating":5,"folder":"Trips"}'), { queries: ["sunset"], tags: ["travel"], ext: "mp4", folder: "Trips", rating: 5 });
  // Alternatives, as a list.
  assert.deepEqual(parseSearchDirective('SEARCH: {"query":["shoe","boot","shoe","靴"]}'), { queries: ["shoe", "boot", "靴"], tags: [], ext: "", folder: "" });
  assert.deepEqual(parseSearchDirective("search: red car, crimson car\nand more"), { queries: ["red car", "crimson car"] });
  assert.deepEqual(parseSearchDirective('`SEARCH: {"query": "cat", "rating": 9}`'), { queries: ["cat"], tags: [], ext: "", folder: "" });
  assert.deepEqual(parseSearchDirective("SEARCH: {not json"), { queries: ["{not json"] });
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
  assert.equal(realSearches(searches).length, 0);
  assert.equal(events.some((event) => event.type === "search"), false);
  // The model is told about the library, with counts, and who is asking.
  const system = String(ai.calls[0].messages[0].content);
  assert.match(system, /"Photos"/);
  assert.match(system, /mika/);
  assert.match(system, /Items in the library: 1\./);
  assert.match(system, /Tags: 2\. Most used, with how many items have each: cat 20, sunset 9/);
  assert.match(system, /Folders, with how many items each has \(subfolders included\): Trips 0, Trips\/Kyoto 0/);
  assert.match(system, /Never count the lines/);
  assert.match(String(ai.calls[0].messages.at(-1)?.content), /quick search of the library for this message found nothing/);
});

test("a search request is run and its results are handed back, never shown as text", async () => {
  const ai = fakeAi(['SEARCH: {"query":"sunset"}', "I found a beach sunset."]);
  const { searches, session } = fakeSession();
  const { events, result, text } = await run(ai, session, { text: "夕焼けの写真ある?" });
  assert.equal(text, "I found a beach sunset.");
  // The word is matched against names and notes, and tried as the tag of that name.
  assert.deepEqual(modelSearches(searches), [
    { kind: "text", options: { query: "sunset", limit: 30, offset: 0 } },
    { kind: "list", options: { ext: "", folderId: "", rating: "", tags: ["sunset"], limit: 30, offset: 0, extraFields: ["palettes"] } },
  ]);
  // Trashed items are left out, and host paths never reach the viewer.
  assert.deepEqual(result.items, [{ id: "A", name: "beach sunset", ext: "jpg" }, { id: "C", name: "kyoto temple", ext: "mp4", duration: 12 }]);
  assert.deepEqual(result.features, ["search"]);
  // The thumbnails come with the answer, once the model has said which fit.
  assert.deepEqual(events.map((event) => event.type).filter((type, index, types) => type !== types[index - 1]), ["search", "text", "items"]);
  assert.equal(events[0].label, "sunset");
  assert.equal(result.tokens, 20);
  const followUp = ai.calls[1].messages;
  assert.equal(followUp.at(-2)?.role, "assistant");
  assert.match(String(followUp.at(-1)?.content), /Search results: 2 items match in all \("sunset" in names or notes: 2; the tag "sunset": 1; an item matching several is counted once\)\. 2 are listed/);
  assert.match(String(followUp.at(-1)?.content), /Tags in this library like your words: sunset \(9\)\./);
  assert.doesNotMatch(JSON.stringify(followUp), /secret/);
});

test("filters go to the item list, and the model may search at most twice", async () => {
  const ai = fakeAi(['SEARCH: {"folder":"kyoto","ext":"mp4"}', "SEARCH: temple", "SEARCH: again", "unused"]);
  const { searches, session } = fakeSession();
  const { result, text } = await run(ai, session);
  assert.equal(modelSearches(searches).length, 2);
  assert.deepEqual(modelSearches(searches)[0], { kind: "list", options: { tags: [], ext: "mp4", rating: "", folderId: "F2", limit: 30, offset: 0, extraFields: ["palettes"] } });
  // The third request is not run, and as a search line it is never shown.
  assert.equal(ai.calls.length, 3);
  assert.equal(text, "Here's what I found.");
  assert.match(String(ai.calls[2].messages.at(-1)?.content), /Do not search again/);
  // With no SHOW line, what both searches found is shown.
  assert.deepEqual(result.items.map((item: { id: string }) => item.id), ["A", "C"]);
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
  for (const said of [
    '{"error":{"message":"bad","api_key":"dummy-credential-123"}}',
    "Authorization: Bearer abc.def.ghi-123 rejected",
    "x-goog-api-key: plainsecret apiKey=plainsecret2 client_secret: \"plainsecret3\"",
    'https://user:plainsecret@host/v1 "password": "plain secret"',
    "AIzaSyA1234567890abcdefghijklmnop and token 9f8e7d6c5b4a39281706f5e4d3c2b1a0aa",
  ]) {
    const shown = aiErrorMessage(Object.assign(new Error(said), { status: 401 }), { detail: true });
    assert.doesNotMatch(shown, /dummy-credential|abc\.def|plainsecret|plain secret|AIzaSy|9f8e7d6c/, said);
  }
  // Model names and plain words stay readable.
  assert.match(aiErrorMessage(Object.assign(new Error('"qwen3-embedding:0.6b" does not support chat'), { status: 400 }), { detail: true }), /qwen3-embedding:0\.6b/);
});

test("a model's <think> reasoning is never shown or mistaken for the reply", async () => {
  const { searches, session } = fakeSession();
  const plain = await run(fakeAi(["<think>\nThe user greets me. SEARCH: nothing\n</think>\n\nHello there."]), session);
  assert.equal(plain.text, "Hello there.");
  assert.equal(modelSearches(searches).length, 0);

  const searching = await run(fakeAi(['<think>I should look.</think>\nSEARCH: {"query":"sunset"}', "<think>ok</think>Found it."]), session);
  assert.equal(searching.text, "Found it.");
  assert.equal(modelSearches(searches).length, 2, "the word, and the tag of that name");

  // Reasoning that never ends leaves nothing to say, so the fallback line is used.
  const endless = await run(fakeAi(["<think>still thinking"]), session, { text: LONG_HELLO });
  assert.equal(endless.text, "I couldn't come up with an answer. Try asking in another way.");
});

test("tags and folders the model guesses are read as the closest real ones, or as words", async () => {
  const ai = fakeAi(['SEARCH: {"tags":["Sunsets","dog"],"folder":"kyoto"}', "Done."]);
  const { searches, session } = fakeSession();
  await run(ai, session, { text: LONG_HELLO });
  // "Sunsets" is the tag "sunset", "kyoto" the folder "Kyoto"; "dog" isn't a tag, so it is a word.
  assert.deepEqual(modelSearches(searches)[0], { kind: "list", options: { keywords: "dog", tags: ["sunset"], ext: "", rating: "", folderId: "F2", limit: 30, offset: 0, extraFields: ["palettes"] } });
  const told = String(ai.calls[1].messages.at(-1)?.content);
  assert.match(told, /The tag "Sunsets" was read as "sunset"/);
  assert.match(told, /There is no tag "dog", so it was searched as a word/);
  assert.match(told, /The folder "kyoto" was read as "Trips\/Kyoto"/);
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
  assert.deepEqual(realSearches(searches), [{ kind: "list", options: { tags: ["cat"], limit: 12, offset: 0, extraFields: ["palettes"] } }]);
  const question = String(ai.calls[0].messages.at(-1)?.content);
  // The model learns these are a sample, with how many the tag has in all.
  assert.match(question, /found these 3 items, one per line; a sample, not everything\. In all, the tag "cat": 1 item\./);
  assert.match(question, /2 of them were found by AI Search as similar in meaning/);
  assert.match(question, /"name":"kitten nap".*"match":"similar in meaning"/);
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
  assert.equal(realSearches(about.searches).length, 0);
});

test("the model reads items as a person would see them, and never password-protected folders", async () => {
  const ai = fakeAi(['SEARCH: {"tags":["cat"]}', "ok"]);
  const { session } = fakeSession({
    folders: async () => ({ items: [
      { id: "F1", name: "Trips", imageCount: 2, descendantImageCount: 5, description: "Holidays\nabroad", children: [{ id: "F2", name: "Kyoto", imageCount: 3 }] },
      { id: "P1", name: "Private", password: "1234", imageCount: 9, children: [{ id: "P2", name: "Diary" }] },
    ] }),
    tagOverview: async () => ({
      tags: [{ name: "cat", imageCount: 20 }, { name: "dog", imageCount: 4 }],
      groups: [{ name: "Animals", tags: ["cat", "dog"] }],
      starred: [{ name: "cat" }],
    }),
    listItems: async (options: Record<string, unknown>) => ({
      items: options.limit === 1 ? [] : [{
        id: "C", name: "tabby", ext: "jpg", size: 1_250_000, folders: ["F2", "P2"], btime: Date.UTC(2026, 0, 2),
        url: "https://www.example.com/cats/1", palettes: [{ color: [230, 40, 40], ratio: 60 }, { color: [20, 40, 200], ratio: 30 }, { color: [250, 250, 250], ratio: 5 }],
      }],
      total: options.limit === 1 ? 340 : 25,
    }),
  });
  await run(ai, session, { text: LONG_HELLO });
  const system = String(ai.calls[0].messages[0].content);
  assert.match(system, /Items in the library: 340\./);
  assert.match(system, /Starred tags: cat/);
  assert.match(system, /Tag groups: Animals: cat, dog/);
  assert.match(system, /Trips 5 \(Holidays abroad\), Trips\/Kyoto 3/);
  assert.doesNotMatch(system, /Private|Diary/);
  const results = String(ai.calls[1].messages.at(-1)?.content);
  assert.match(results, /Search results: at least 25 items match in all\. 1 are listed/);
  assert.match(results, /"fileSize":"1.3 MB","colors":"red 60%, blue 30%","folders":\["Trips\/Kyoto"\],"added":"2026-01-02","from":"example.com"/);
  assert.doesNotMatch(results, /Diary|https?:/);
});

test("a search takes alternative words, each also tried as the tags it names", async () => {
  const ai = fakeAi(['SEARCH: {"query":["shoe","boot","靴"]}', "Shoes and boots.\nSHOW: running, hiking"]);
  const lists: unknown[] = [];
  const texts: string[] = [];
  const { session } = fakeSession({
    listTags: async () => ({ items: [{ name: "shoe", count: 2 }, { name: "ski-boot", count: 1 }, { name: "boot", count: 1 }, { name: "fashion", count: 5 }] }),
    searchItems: async ({ query }: { query: string }) => {
      texts.push(query);
      return query === "shoe" ? { items: [{ id: "R", name: "running", ext: "png" }], total: 1 } : { items: [], total: 0 };
    },
    listItems: async (options: Record<string, unknown>) => {
      lists.push(options.tags);
      const tags = options.tags as string[] | undefined;
      if (tags?.includes("boot")) return { items: [{ id: "H", name: "hiking", ext: "png" }], total: 1 };
      if (tags?.includes("ski-boot")) return { items: [{ id: "K", name: "skiing", ext: "png" }], total: 1 };
      if (tags?.includes("shoe")) return { items: [{ id: "R", name: "running", ext: "png" }, { id: "D", name: "dance", ext: "png" }], total: 2 };
      return { items: [], total: 0 };
    },
  });
  const { events, result, text } = await run(ai, session, { text: "靴をモチーフにしたアイコン" });
  assert.deepEqual(texts.slice(-3), ["shoe", "boot", "靴"]);
  assert.deepEqual(lists.filter(Boolean).slice(-3), [["shoe"], ["boot"], ["ski-boot"]]);
  const told = String(ai.calls[1].messages.at(-1)?.content);
  assert.match(told, /Search results: 4 items match in all/);
  assert.match(told, /Tags in this library like your words: shoe \(2\), boot \(1\), ski-boot \(1\)\./);
  // Only what the SHOW line names is shown, in its order; the line itself never is.
  assert.equal(result.text, "Shoes and boots.");
  assert.doesNotMatch(text, /SHOW/);
  assert.deepEqual(result.items.map((item: { id: string }) => item.id), ["R", "H"]);
  assert.equal(events.filter((event) => event.type === "items").length, 1);
});

test("SHOW: none shows nothing, and protocol lines inside an answer are hidden or run", async () => {
  const { session } = fakeSession();
  const none = await run(fakeAi(['SEARCH: {"query":"fashion"}', "These don't look like shoes.\n**SHOW:** none"]), session, { text: LONG_HELLO });
  assert.equal(none.result.text, "These don't look like shoes.");
  assert.deepEqual(none.result.items, []);
  assert.equal(none.events.some((event) => event.type === "items"), false);

  // A search written after some words is run, and the model goes on below them.
  const midway = fakeAi(['Let me look.\nSEARCH: {"query":"sunset"}', "Found a sunset.\nSHOW: beach sunset"]);
  const second = await run(midway, session, { text: LONG_HELLO });
  assert.equal(midway.calls.length, 2);
  assert.equal(second.result.text, "Let me look.\n\nFound a sunset.");
  assert.deepEqual(second.result.items.map((item: { id: string }) => item.id), ["A"]);
  assert.doesNotMatch(second.events.filter((event) => event.type === "text").map((event) => event.delta).join(""), /SEARCH|SHOW/);

  // Lines that only start like one pass through.
  const plain = await run(fakeAi(["Sure!\nShowing cats is easy.\nSEA turtles too."]), session, { text: LONG_HELLO });
  assert.equal(plain.text, "Sure!\nShowing cats is easy.\nSEA turtles too.");
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

test("chat changes count only once written, and a deleted chat or user stays deleted", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ai-chats-"));
  const store = createAiChatStore({ dir });
  const chat = store.create("LIB", "keep me");
  await store.save("mika", chat);

  // A reply that ends after its chat was deleted doesn't bring it back.
  assert.equal(await store.remove("mika", "LIB", chat.id), true);
  assert.equal(await store.save("mika", chat, { onlyIfKept: true }), null);
  assert.deepEqual(await createAiChatStore({ dir }).list("mika", "LIB"), []);

  // When the file can't be written, a delete fails and the chat is still there.
  await store.save("mika", chat);
  await store.save("mika", store.create("LIB", "another"));
  if (process.getuid?.() !== 0) {
    const [file] = await readdir(dir);
    await chmod(join(dir, file), 0o400);
    await assert.rejects(store.remove("mika", "LIB", chat.id));
    assert.equal((await store.list("mika", "LIB")).length, 2);
    await chmod(join(dir, file), 0o600);
  }

  // A deleted account's chats go with it.
  await store.save("ken", store.create("LIB", "ken's"));
  await store.removeUser("mika");
  assert.deepEqual(await store.list("mika", "LIB"), []);
  assert.equal((await readdir(dir)).length, 1, "only ken's file is left");
  assert.deepEqual(await createAiChatStore({ dir }).list("mika", "LIB"), []);

  // Where nothing can be written at all, saving fails rather than seeming to work.
  await writeFile(join(dir, "a-file"), "");
  const blocked = createAiChatStore({ dir: join(dir, "a-file", "not-a-folder") });
  await assert.rejects(blocked.save("mika", blocked.create("LIB", "x")));
});

test("tags and folders read while Eagle switches libraries are never kept", async () => {
  let open = true;
  let tagReads = 0;
  const { session } = fakeSession({
    listTags: async () => {
      tagReads += 1;
      // Eagle switches to another library while the tags are read.
      if (tagReads === 1) open = false;
      return { items: [{ name: tagReads === 1 ? "private-tag" : "sunset", count: 1 }] };
    },
  });
  const assistant = createAiAssistant();
  const turn = (ai: ReturnType<typeof fakeAi>) => assistant.runTurn({ ai, history: [], onEvent() {}, session, stillOpen: () => open, text: LONG_HELLO, username: "mika" });
  await assert.rejects(turn(fakeAi(["unused"])), /library open in Eagle has changed/);
  open = true;
  const ai = fakeAi(["ok"]);
  await turn(ai);
  assert.equal(tagReads, 2);
  assert.doesNotMatch(JSON.stringify(ai.calls), /private-tag/);
});

test("items sent to a viewer never carry host paths", () => {
  assert.deepEqual(publicItem({ id: "A", name: "a", filePath: "/x", thumbnailPath: "/y", fileURL: "file:///x", thumbnailURL: "file:///y", tags: ["t"] }), { id: "A", name: "a", tags: ["t"] });
  assert.equal(publicItem({ name: "no id" }), null);
  assert.equal(publicItem(undefined), null);
});
