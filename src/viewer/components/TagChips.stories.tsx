import type { Meta, StoryObj } from "@storybook/react";
import { TagChips } from "./TagChips";
import { noop, storyPanelClassName } from "./storyFixtures";

const meta = {
  title: "Viewer/TagChips",
  component: TagChips,
  decorators: [(Story) => <div className={storyPanelClassName}><Story /></div>],
  args: {
    tags: ["landing", "reference", "bright"],
    onRemove: noop,
  },
} satisfies Meta<typeof TagChips>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ManyTags: Story = {
  args: {
    tags: ["landing", "reference", "bright", "campaign", "homepage", "retina", "approved"],
  },
};

export const Empty: Story = {
  args: {
    tags: [],
  },
};
