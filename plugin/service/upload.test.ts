import { test } from "vitest";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { createServer, request, type IncomingMessage, type Server } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { MAX_UPLOAD_BYTES, parseUploadRequest, receiveUpload, sweepUploads } = require("../../dist/.generated/plugin-service/upload.cjs");

function fakeRequest(contentLength: string | number | undefined, query: string) {
  return {
    req: { headers: contentLength === undefined ? {} : { "content-length": String(contentLength) } } as unknown as IncomingMessage,
    url: new URL(`http://localhost/api/uploads?${query}`),
  };
}

function parse(contentLength: string | number | undefined, query: string) {
  const { req, url } = fakeRequest(contentLength, query);
  return parseUploadRequest(req, url);
}

async function withDirectory(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "upload-test-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return (server.address() as { port: number }).port;
}

test("parseUploadRequest separates the name from its extension", () => {
  assert.deepEqual(parse(5, `name=${encodeURIComponent("旅行 写真.JPG")}&folderId=F1&tag=a&tag=b`), {
    extension: ".jpg",
    folderId: "F1",
    name: "旅行 写真",
    size: 5,
    tags: ["a", "b"],
  });
});

test("parseUploadRequest keeps only the last part of a name that contains a path", () => {
  const parsed = parse(5, `name=${encodeURIComponent("../../etc/passwd.png")}`);
  assert.equal(parsed.name, "passwd");
  assert.equal(parsed.extension, ".png");
  assert.equal(parse(5, `name=${encodeURIComponent("..\\..\\evil.png")}`).name, "evil");
});

test("parseUploadRequest never uses an unusual extension for the file on disk", () => {
  const parsed = parse(5, `name=${encodeURIComponent("a.b/../../c")}`);
  assert.equal(parsed.extension, "");
  assert.equal(parse(5, `name=${encodeURIComponent("clip.mp4 ")}`).extension, ".mp4");
  assert.equal(parse(5, `name=${encodeURIComponent("archive.not valid")}`).extension, "");
  assert.equal(parse(5, `name=${encodeURIComponent(".hidden")}`).name, ".hidden");
});

test("parseUploadRequest refuses a request before its body is read", () => {
  assert.throws(() => parse(undefined, "name=a.png"), (error: { status: number }) => error.status === 411);
  assert.throws(() => parse(0, "name=a.png"), (error: { status: number }) => error.status === 400);
  assert.throws(() => parse(MAX_UPLOAD_BYTES + 1, "name=a.png"), (error: { status: number }) => error.status === 413);
  assert.throws(() => parse(5, "name="), (error: { status: number }) => error.status === 400);
  assert.throws(() => parse(5, `name=${"a".repeat(256)}`), (error: { status: number }) => error.status === 400);
});

test("receiveUpload saves the body under a random name with the extension", async () => {
  await withDirectory(async (directory) => {
    const server = createServer(async (req, res) => {
      const filePath = await receiveUpload(req, { directory, extension: ".png" });
      res.end(filePath);
    });
    const port = await listen(server);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, { method: "POST", body: "hello" });
      const filePath = await response.text();
      assert.match(filePath, /[0-9a-f]{32}\.png$/);
      assert.equal(await readFile(filePath, "utf8"), "hello");
    } finally {
      server.close();
    }
  });
});

test("receiveUpload removes the partial file when the client disconnects", async () => {
  await withDirectory(async (directory) => {
    let failure: { status?: number } | undefined;
    const settled = new Promise<void>((resolve) => {
      const server = createServer(async (req) => {
        try {
          await receiveUpload(req, { directory });
        } catch (error) {
          failure = error as { status?: number };
        }
        server.close();
        resolve();
      });
      void listen(server).then((port) => {
        const client = request({ host: "127.0.0.1", port, method: "POST", headers: { "Content-Length": 1000 } });
        client.on("error", () => {});
        client.write("partial", () => setTimeout(() => client.destroy(), 20));
      });
    });
    await settled;
    assert.equal(failure?.status, 400);
    assert.deepEqual(await readdir(directory), []);
  });
});

test("receiveUpload gives up on a connection that stops sending", async () => {
  await withDirectory(async (directory) => {
    let failure: { status?: number } | undefined;
    let client: ReturnType<typeof request> | undefined;
    await new Promise<void>((resolve) => {
      const server = createServer(async (req) => {
        try {
          await receiveUpload(req, { directory, idleTimeoutMs: 30 });
        } catch (error) {
          failure = error as { status?: number };
        }
        server.close();
        resolve();
      });
      void listen(server).then((port) => {
        client = request({ host: "127.0.0.1", port, method: "POST", headers: { "Content-Length": 1000 } });
        client.on("error", () => {});
        client.write("partial");
      });
    });
    client?.destroy();
    assert.equal(failure?.status, 408);
    assert.deepEqual(await readdir(directory), []);
  });
});

test("sweepUploads removes only files older than the retention time", async () => {
  await withDirectory(async (directory) => {
    const oldFile = join(directory, "old.png");
    const recentFile = join(directory, "recent.png");
    await writeFile(oldFile, "old");
    await writeFile(recentFile, "recent");
    const now = Date.now();
    const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);
    await utimes(oldFile, twoHoursAgo, twoHoursAgo);

    await sweepUploads({ directory, now, retentionMs: 60 * 60 * 1000 });

    assert.deepEqual(await readdir(directory), ["recent.png"]);
  });
});

test("sweepUploads does nothing when no upload has happened yet", async () => {
  await sweepUploads({ directory: join(tmpdir(), "upload-test-does-not-exist") });
});
