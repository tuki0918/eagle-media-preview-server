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

export const Table: Story = {
  args: {
    viewMode: "table",
  },
};
