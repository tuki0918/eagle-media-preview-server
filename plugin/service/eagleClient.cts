const { fileURLToPath } = require("url");
const { readdir } = require("fs").promises;
const { extname, isAbsolute, join, relative, resolve } = require("path");

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

interface SmartFolderItemsOptions extends PageOptions {
  smartFolderId?: unknown;
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

    async smartFolders() {
      return normalizePaginatedResponse(await request("/api/v2/smartFolder/get"));
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

    async smartFolderItems({ smartFolderId, offset = 0, limit = 30 }: SmartFolderItemsOptions = {}) {
      const id = String(smartFolderId || "").trim();
      if (!id) throw new Error("smartFolderId is required");
      const pageOffset = normalizeOffset(offset);
      const pageLimit = clampLimit(limit);
      const smartFolder = unwrapSmartFolder(await request("/api/v2/smartFolder/get", { searchParams: { id } }));
      const sourceIds = smartFolderGroupLeafIds(smartFolder);
      const result = sourceIds.length
        ? mergePaginatedItemResponses(await Promise.all(sourceIds.map((sourceId) => smartFolderItemsResponse(sourceId))))
        : await smartFolderItemsResponse(id);
      return {
        ...result,
        items: result.items.slice(pageOffset, pageOffset + pageLimit),
        total: result.total || result.items.length,
        offset: pageOffset,
        limit: pageLimit,
      };

      async function smartFolderItemsResponse(sourceId: string) {
        return normalizePaginatedResponse(
          await request("/api/v2/smartFolder/getItems", {
            searchParams: { smartFolderId: sourceId },
          }),
        );
      }
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

function normalizePaginatedResponse(payload: unknown): { items: unknown[]; limit: number; offset: number; total: number } {
  const data = unwrapData(payload);
  if (Array.isArray(data)) {
    return { items: data, total: data.length, offset: 0, limit: data.length };
  }
  const page = isRecord(data) ? data : {};
  return {
    items: Array.isArray(page.data) ? page.data : [],
    total: typeof page.total === "number" && Number.isFinite(page.total) ? page.total : 0,
    offset: typeof page.offset === "number" && Number.isFinite(page.offset) ? page.offset : 0,
    limit: typeof page.limit === "number" && Number.isFinite(page.limit) ? page.limit : 0,
  };
}

function mergePaginatedItemResponses(responses: Array<{ items: unknown[]; limit: number; offset: number; total: number }>) {
  const seen = new Set<string>();
  const items: unknown[] = [];
  for (const response of responses) {
    for (const item of response.items) {
      const key = itemKey(item);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      items.push(item);
    }
  }
  return { items, total: items.length, offset: 0, limit: items.length };
}

function itemKey(item: unknown) {
  if (isRecord(item) && typeof item.id === "string" && item.id) return item.id;
  return "";
}

function unwrapSmartFolder(payload: unknown) {
  const data = unwrapData(payload);
  if (Array.isArray(data)) return isRecord(data[0]) ? data[0] : {};
  return isRecord(data) ? data : {};
}

function smartFolderGroupLeafIds(folder: Record<string, unknown>) {
  if (!isSmartFolderGroup(folder)) return [];
  const children = Array.isArray(folder.children) ? folder.children : [];
  if (!children.length) return [];
  const ids: string[] = [];
  collectSmartFolderLeafIds(children, ids);
  return ids;
}

function collectSmartFolderLeafIds(folders: unknown[], ids: string[]) {
  for (const folder of folders) {
    if (!isRecord(folder)) continue;
    const children = Array.isArray(folder.children) ? folder.children : [];
    if (isSmartFolderGroup(folder)) {
      collectSmartFolderLeafIds(children, ids);
      continue;
    }
    const id = typeof folder.id === "string" ? folder.id.trim() : "";
    if (id) ids.push(id);
  }
}

function isSmartFolderGroup(folder: Record<string, unknown>) {
  return folder.icon === "grid";
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
  const itemDir = resolveLibraryItemDir(libraryPath, item.id);
  if (!itemDir) return "";
  const entries = await readdir(itemDir, { withFileTypes: true }) as Dirent[];
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);

  if (kind === "thumb") {
    const thumbnail = files.find((file) => /_thumbnail\.[a-z0-9]+$/i.test(file));
    if (thumbnail) return join(itemDir, thumbnail);
  }

  const normalizedExt = String(item.ext || "").trim().replace(/^\./, "").toLowerCase();
  const ext = normalizedExt ? `.${normalizedExt}` : "";
  const original = files.find((file) => {
    const lower = file.toLowerCase();
    return lower !== "metadata.json" && !/_thumbnail\.[a-z0-9]+$/i.test(lower) && (!ext || extname(lower) === ext);
  });

  return original ? join(itemDir, original) : "";
}

function resolveLibraryItemDir(libraryPath: string, itemId: unknown) {
  const cleanId = String(itemId || "").trim();
  if (!cleanId || /[\\/]/.test(cleanId) || cleanId === "." || cleanId === "..") return "";
  const imagesRoot = resolve(libraryPath, "images");
  const itemDir = resolve(imagesRoot, `${cleanId}.info`);
  const relativePath = relative(imagesRoot, itemDir);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) return "";
  return itemDir;
}
module.exports = { ITEM_FIELDS, clampLimit, normalizeOffset, normalizeStringArray, createEagleClient, normalizePaginatedResponse, unwrapData, pathFromFileValue, resolveLibraryItemFile };
