import type { Meta, StoryObj } from "@storybook/react";
import { ResultList } from "./ResultList";
import { ResultSurface } from "./ResultSurface";
import { ViewerDock } from "./ViewerDock";
import { noop, sampleItems, storyCanvasClassName } from "./storyFixtures";

const meta = {
  title: "Viewer/ResultList",
  component: ResultList,
  decorators: [(Story) => <div className={storyCanvasClassName}><Story /></div>],
  args: {
    items: sampleItems,
    onOpenPreview: noop,
    viewMode: "grid",
  },
} satisfies Meta<typeof ResultList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Grid: Story = {};

export const Tiles: Story = {
  args: {
    viewMode: "tiles",
  },
};

export const List: Story = {
  args: {
    viewMode: "list",
  },
};

export const ListWithFilters: Story = {
  args: {
    viewMode: "list",
    items: sampleItems.map((item, index) => index === 0
      ? { ...item, tags: ["landing", "reference", "bright", "hero", "marketing", "2026", "draft", "approved", "desktop"] }
      : item),
    filters: { activeExt: "", activeTags: ["reference"], onToggleExt: noop, onToggleTag: noop },
  },
};

export const ListInSmartFolder: Story = {
  args: {
    viewMode: "list",
    items: sampleItems.map((item, index) => index === 0
      ? { ...item, tags: ["landing", "reference", "bright", "hero", "marketing", "2026", "draft", "approved", "desktop"] }
      : item),
  },
};

const detailedItems = sampleItems.map((item, index) => ({
  ...item,
  modificationTime: Date.UTC(2026, 5, 12 - index),
  btime: Date.UTC(2025, 2, 3 + index),
  annotation: index === 0 ? "Hero reference for the spring landing page, bright variant with the long headline." : "",
  url: index === 0 ? "https://www.example.com/inspiration/landing-pages/spring" : "",
}));

/** The list inside its results area (so columns respond to its width) with the dock's column picker. */
export const ListColumns: Story = {
  args: {
    viewMode: "list",
    items: detailedItems,
  },
  render: (args) => (
    <>
      <ResultSurface state={{ kind: "list", items: args.items, onOpenPreview: noop, viewMode: "list" }} />
      <ViewerDock viewMode="list" />
    </>
  ),
};
