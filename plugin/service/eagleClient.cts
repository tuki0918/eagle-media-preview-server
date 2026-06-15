const { fileURLToPath } = require("url");
const { readdir } = require("fs").promises;
const { extname, join } = require("path");

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

function clampLimit(value, fallback = 60) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(parsed, 30), 1000);
}

function normalizeOffset(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function clampTagLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 20;
  return Math.min(parsed, 100);
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

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.message || `Eagle HTTP ${response.status}`);
    }

    return payload;
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

    async switchLibrary(libraryPath) {
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

    async searchItems({ query, offset = 0, limit = 30 }) {
      return normalizePaginatedResponse(
        await request("/api/v2/item/query", {
          method: "POST",
          body: { query, offset: normalizeOffset(offset), limit: clampLimit(limit) },
        }),
      );
    },

    async listTags({ query = "", offset = 0, limit = 20 } = {}) {
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

    async itemById(id) {
      return unwrapData(
        await request("/api/v2/item/get", {
          method: "POST",
          body: { id, fields: ITEM_FIELDS },
        }),
      );
    },

    async legacyThumbnailPath(id) {
      return unwrapData(await request("/api/item/thumbnail", { searchParams: { id } }));
    },

    async updateItemStar(id, star) {
      const parsedStar = Number.parseInt(star, 10);
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

    async updateItemMetadata(id, { tags, folders }: UpdateMetadataInput = {}) {
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
  };
}

function normalizeStringArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

function normalizePaginatedResponse(payload) {
  const data = unwrapData(payload);
  if (Array.isArray(data)) {
    return { items: data, total: data.length, offset: 0, limit: data.length };
  }
  return {
    items: Array.isArray(data?.data) ? data.data : [],
    total: Number.isFinite(data?.total) ? data.total : 0,
    offset: Number.isFinite(data?.offset) ? data.offset : 0,
    limit: Number.isFinite(data?.limit) ? data.limit : 0,
  };
}

function unwrapData(payload) {
  if (payload?.status === "success") return payload.data;
  throw new Error(payload?.message || "Unexpected Eagle API response");
}

function pathFromFileValue(value) {
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

async function resolveLibraryItemFile({ libraryPath, item, kind }) {
  if (!libraryPath || !item?.id) return "";
  const itemDir = join(libraryPath, "images", `${item.id}.info`);
  const entries = await readdir(itemDir, { withFileTypes: true });
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
module.exports = { ITEM_FIELDS, clampLimit, normalizeOffset, createEagleClient, normalizePaginatedResponse, unwrapData, pathFromFileValue, resolveLibraryItemFile };
