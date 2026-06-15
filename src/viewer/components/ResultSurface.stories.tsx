import type { Meta, StoryObj } from "@storybook/react";
import { ResultSurface } from "./ResultSurface";
import { noop, sampleItems, storyCanvasClassName } from "./storyFixtures";

const meta = {
  title: "Viewer/ResultSurface",
  component: ResultSurface,
  decorators: [(Story) => <div className={storyCanvasClassName}><Story /></div>],
  args: {
    state: {
      kind: "list",
      items: sampleItems,
      onOpenPreview: noop,
      viewMode: "grid",
    },
  },
} satisfies Meta<typeof ResultSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const List: Story = {};

export const Empty: Story = {
  args: {
    state: {
      hasActiveFilters: true,
      kind: "empty",
      onClearFilters: noop,
      viewMode: "grid",
    },
  },
};

export const Message: Story = {
  args: {
    state: {
      kind: "message",
      text: "Loading items...",
      viewMode: "grid",
    },
  },
};
