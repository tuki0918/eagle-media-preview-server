import type { Meta, StoryObj } from "@storybook/react";
import { ResultList } from "./ResultList";
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
