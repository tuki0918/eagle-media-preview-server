const { fileURLToPath } = require("url");
const { readdir } = require("fs").promises;
const { extname, join } = require("path");

import type { Dirent } from "fs";

type SearchParams = Record<string, unknown>;

interface RequestOptions {
  body?: unknown;
  method?: string;
  searchParams?: SearchParams;
}

interface EagleClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  token?: string;
}

interface PageOptions {
  limit?: unknown;
  offset?: unknown;
}

interface ListItemsOptions extends PageOptions {
  ext?: unknown;
  folderId?: unknown;
  isUnfiled?: boolean;
  keywords?: unknown;
  rating?: unknown;
  tags?: unknown;
}

interface UpdateMetadataInput {
  folders?: unknown;
  tags?: unknown;
}

interface SearchItemsOptions extends PageOptions {
  query: string;
}

interface ListTagsOptions extends PageOptions {
  query?: unknown;
}

interface EagleApiEnvelope {
  data?: unknown;
  message?: unknown;
  status?: unknown;
}

interface EagleItemFileInput {
  ext?: unknown;
  id?: unknown;
}

interface ResolveLibraryItemFileInput {
  item?: EagleItemFileInput | null;
  kind: "file" | "thumb";
  libraryPath?: string;
}

const ITEM_FIELDS = [
  "id",
  "name",
  "ext",
  "width",
  "height",
  "size",
  "duration",
  "star",
  "tags",
  "folders",
  "annotation",
  "url",
  "importedAt",
  "importTime",
  "importedTime",
  "createdAt",
  "createdTime",
  "creationTime",
  "birthTime",
  "btime",
  "modifiedAt",
  "modificationTime",
  "mtime",
  "lastModified",
  "noThumbnail",
  "noPreview",
  "fileURL",
  "thumbnailURL",
  "filePath",
  "thumbnailPath",
];

const MAX_ERROR_BODY_LENGTH = 240;

function clampLimit(value: unknown, fallback = 60) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(parsed, 30), 1000);
}

function normalizeOffset(value: unknown) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function clampTagLimit(value: unknown) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 20;
  return Math.min(parsed, 100);
}

function parseJsonResponseText(text: string) {
  try {
    return { ok: true, payload: JSON.parse(text) };
  } catch {
    return { ok: false, payload: null };
  }
}

function formatResponseBodySnippet(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const snippet = normalized.length > MAX_ERROR_BODY_LENGTH
    ? `${normalized.slice(0, MAX_ERROR_BODY_LENGTH)}...`
    : normalized;
  return `: ${snippet}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function createEagleClient({
  baseUrl = process.env.EAGLE_BASE_URL || "http://localhost:41595",
  token = process.env.EAGLE_TOKEN || "",
  fetchImpl = globalThis.fetch,
}: EagleClientOptions = {}) {
  const root = baseUrl.replace(/\/+$/, "");

  async function request(pathname: string, { method = "GET", body, searchParams }: RequestOptions = {}) {
    const url = new URL(`${root}${pathname}`);
    if (token) url.searchParams.set("token", token);
    if (searchParams) {
      for (const [key, value] of Object.entries(searchParams)) {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const requestInit = {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    };
    const response = await fetchImpl(url.toString(), requestInit);

    const responseText = await response.text();
    const parsed = parseJsonResponseText(responseText);
    if (!response.ok) {
      const message = parsed.ok && isRecord(parsed.payload) && typeof parsed.payload.message === "string"
        ? parsed.payload.message
        : "";
      throw new Error(message || `Eagle HTTP ${response.status}${formatResponseBodySnippet(responseText)}`);
    }
    if (!parsed.ok) {
      throw new Error(`Invalid JSON from Eagle HTTP ${response.status}${formatResponseBodySnippet(responseText)}`);
    }

    return parsed.payload;
  }

  return {
    async appInfo() {
      return unwrapData(await request("/api/v2/app/info"));
    },

    async libraryInfo() {
      return unwrapData(await request("/api/v2/library/info"));
    },

    async libraryHistory() {
      return unwrapData(await request("/api/library/history"));
    },

    async switchLibrary(libraryPath: string) {
      return unwrapData(
        await request("/api/library/switch", {
          method: "POST",
          body: { libraryPath },
        }),
      );
    },

    async folders({ offset = 0, limit = 1000 }: PageOptions = {}) {
      return normalizePaginatedResponse(
        await request("/api/v2/folder/get", {
          searchParams: { offset: normalizeOffset(offset), limit: clampLimit(limit, 1000) },
        }),
      );
    },

    async listItems({ offset = 0, limit = 30, folderId, isUnfiled = false, ext, rating, keywords, tags }: ListItemsOptions = {}) {
      const body: {
        ext?: unknown;
        fields: readonly string[];
        folders?: unknown[];
        isUnfiled?: boolean;
        keywords?: unknown[];
        limit: number;
        offset: number;
        rating?: number;
        tags?: string[];
      } = {
        offset: normalizeOffset(offset),
        limit: clampLimit(limit),
        fields: ITEM_FIELDS,
      };
      if (isUnfiled) {
        body.isUnfiled = true;
      } else if (folderId) {
        body.folders = [folderId];
      }
      if (ext) body.ext = ext;
      if (rating !== undefined && rating !== null && rating !== "") body.rating = Number(rating);
      if (keywords) body.keywords = Array.isArray(keywords) ? keywords : [keywords];
      const cleanTags = (Array.isArray(tags) ? tags : [tags]).map((tag) => String(tag || "").trim()).filter(Boolean);
      if (cleanTags.length) body.tags = cleanTags;

      return normalizePaginatedResponse(
        await request("/api/v2/item/get", { method: "POST", body }),
      );
    },

    async searchItems({ query, offset = 0, limit = 30 }: SearchItemsOptions) {
      return normalizePaginatedResponse(
        await request("/api/v2/item/query", {
          method: "POST",
          body: { query, offset: normalizeOffset(offset), limit: clampLimit(limit) },
        }),
      );
    },

    async listTags({ query = "", offset = 0, limit = 20 }: ListTagsOptions = {}) {
      return normalizePaginatedResponse(
        await request("/api/v2/tag/get", {
          searchParams: {
            name: String(query || "").trim(),
            offset: normalizeOffset(offset),
            limit: clampTagLimit(limit),
          },
        }),
      );
    },

    async itemById(id: string) {
      return unwrapData(
        await request("/api/v2/item/get", {
          method: "POST",
          body: { id, fields: ITEM_FIELDS },
        }),
      );
    },

    async legacyThumbnailPath(id: string) {
      return unwrapData(await request("/api/item/thumbnail", { searchParams: { id } }));
    },

    async updateItemStar(id: string, star: unknown) {
      const parsedStar = Number(star);
      if (!Number.isInteger(parsedStar) || parsedStar < 0 || parsedStar > 5) {
        throw new Error("star must be an integer from 0-5");
      }
      return unwrapData(
        await request("/api/v2/item/update", {
          method: "POST",
          body: { id, star: parsedStar },
        }),
      );
    },

    async updateItemMetadata(id: string, { tags, folders }: UpdateMetadataInput = {}) {
      const body: { folders?: string[]; id: unknown; tags?: string[] } = { id };
      if (tags !== undefined) body.tags = normalizeStringArray(tags, "tags");
      if (folders !== undefined) body.folders = normalizeStringArray(folders, "folders");
      if (!body.id) throw new Error("id is required");
      if (body.tags === undefined && body.folders === undefined) {
        throw new Error("tags or folders is required");
      }
      return unwrapData(
        await request("/api/v2/item/update", {
          method: "POST",
          body,
        }),
      );
    },

    async updateItemTrash(id: string, isDeleted: boolean) {
      if (!id) throw new Error("id is required");
      if (typeof isDeleted !== "boolean") throw new Error("isDeleted must be a boolean");
      return unwrapData(
        await request("/api/v2/item/update", {
          method: "POST",
          body: { id, isDeleted },
        }),
      );
    },
  };
}

function normalizeStringArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

function normalizePaginatedResponse(payload: unknown) {
  const data = unwrapData(payload);
  if (Array.isArray(data)) {
    return { items: data, total: data.length, offset: 0, limit: data.length };
  }
  const page = isRecord(data) ? data : {};
  return {
    items: Array.isArray(page.data) ? page.data : [],
    total: Number.isFinite(page.total) ? page.total : 0,
    offset: Number.isFinite(page.offset) ? page.offset : 0,
    limit: Number.isFinite(page.limit) ? page.limit : 0,
  };
}

function unwrapData(payload: unknown) {
  const envelope = isRecord(payload) ? payload as EagleApiEnvelope : {};
  if (envelope.status === "success") return envelope.data;
  throw new Error(typeof envelope.message === "string" && envelope.message ? envelope.message : "Unexpected Eagle API response");
}

function pathFromFileValue(value: unknown) {
  if (!value || typeof value !== "string") return "";
  if (value.startsWith("file://")) {
    return fileURLToPath(value);
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function resolveLibraryItemFile({ libraryPath, item, kind }: ResolveLibraryItemFileInput) {
  if (!libraryPath || !item?.id) return "";
  const itemDir = join(libraryPath, "images", `${item.id}.info`);
  const entries = await readdir(itemDir, { withFileTypes: true }) as Dirent[];
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);

  if (kind === "thumb") {
    const thumbnail = files.find((file) => /_thumbnail\.[a-z0-9]+$/i.test(file));
    if (thumbnail) return join(itemDir, thumbnail);
  }

  const ext = item.ext ? `.${String(item.ext).toLowerCase()}` : "";
  const original = files.find((file) => {
    const lower = file.toLowerCase();
    return lower !== "metadata.json" && !/_thumbnail\.[a-z0-9]+$/i.test(lower) && (!ext || extname(lower) === ext);
  });

  return original ? join(itemDir, original) : "";
}
module.exports = { ITEM_FIELDS, clampLimit, normalizeOffset, normalizeStringArray, createEagleClient, normalizePaginatedResponse, unwrapData, pathFromFileValue, resolveLibraryItemFile };
