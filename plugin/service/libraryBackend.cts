// The one place the viewer server reads a library from (docs/design/standalone-server.md, section 4).
// The plugin reads through Eagle's Web API (`createEagleApiBackend`); a standalone server will read
// the library folder instead. The server never talks to an Eagle client directly.
const { createConnectionContext } = require("./connection.cjs");

interface EagleApiClient {
  appInfo(): Promise<unknown>;
  libraryInfo(): Promise<unknown>;
  folders(): Promise<unknown>;
  smartFolders(): Promise<unknown>;
  listItems(options: unknown): Promise<unknown>;
  searchItems(options: unknown): Promise<unknown>;
  smartFolderItems(options: unknown): Promise<unknown>;
  itemById(id: string): Promise<unknown>;
  itemsByIds(ids: string[]): Promise<unknown[]>;
  sortIndexItems?(ids: string[]): Promise<unknown[]>;
  itemExtensions(options?: unknown): Promise<unknown>;
  legacyThumbnailPath(id: string): Promise<unknown>;
  listTags(options: unknown): Promise<unknown>;
  tagOverview(): Promise<unknown>;
  tagCoverItem(tag: string): Promise<unknown>;
  addItemFromPath(input: unknown): Promise<unknown>;
  updateItemStar(id: string, star: unknown): Promise<unknown>;
  updateItemMetadata(id: string, input: unknown): Promise<unknown>;
  updateItemTrash(id: string, isDeleted: boolean): Promise<unknown>;
}

interface EagleApiBackendOptions {
  client: EagleApiClient;
  libraryInfoTtlMs?: number;
}

// Wraps an Eagle Web API client. Every call goes to the client as it is made, so the backend
// behaves exactly as the client does (and a test double needs only the methods it is asked for).
function createEagleApiBackend({ client, libraryInfoTtlMs }: EagleApiBackendOptions) {
  const connection = createConnectionContext({ client, libraryInfoTtlMs });
  return {
    kind: "eagle-api" as const,
    // The library open in Eagle; cached briefly, since Eagle can switch it at any time.
    libraryInfo: () => connection.libraryInfo(),
    lastLibraryInfo: () => connection.lastLibraryInfo(),
    clearLibraryInfo: () => connection.clearLibraryInfo(),

    appInfo: () => client.appInfo(),
    folders: () => client.folders(),
    smartFolders: () => client.smartFolders(),
    listItems: (options: unknown) => client.listItems(options),
    searchItems: (options: unknown) => client.searchItems(options),
    smartFolderItems: (options: unknown) => client.smartFolderItems(options),
    itemById: (id: string) => client.itemById(id),
    itemsByIds: (ids: string[]) => client.itemsByIds(ids),
    // Advanced Sort's index reads item metadata with this; absent when the client can't.
    sortIndexItems: client.sortIndexItems ? (ids: string[]) => client.sortIndexItems!(ids) : undefined,
    itemExtensions: (options?: unknown) => client.itemExtensions(options),
    legacyThumbnailPath: (id: string) => client.legacyThumbnailPath(id),
    listTags: (options: unknown) => client.listTags(options),
    tagOverview: () => client.tagOverview(),
    tagCoverItem: (tag: string) => client.tagCoverItem(tag),

    // Present only on a backend that may change the library. A read-only backend leaves it out,
    // and the server then refuses every write.
    write: {
      addItemFromPath: (input: unknown) => client.addItemFromPath(input),
      updateItemStar: (id: string, star: unknown) => client.updateItemStar(id, star),
      updateItemMetadata: (id: string, input: unknown) => client.updateItemMetadata(id, input),
      updateItemTrash: (id: string, isDeleted: boolean) => client.updateItemTrash(id, isDeleted),
    },
  };
}

module.exports = { createEagleApiBackend };
