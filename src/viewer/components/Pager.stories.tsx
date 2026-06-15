import type { Meta, StoryObj } from "@storybook/react";
import { Pager } from "./Pager";
import { noop, storyCanvasClassName } from "./storyFixtures";

const meta = {
  title: "Viewer/Pager",
  component: Pager,
  decorators: [(Story) => <div className={storyCanvasClassName}><Story /></div>],
  args: {
    current: 3,
    hidden: false,
    nextDisabled: false,
    onSelectPage: noop,
    pages: [1, 2, 3, 4, "...", 10],
    previousDisabled: false,
  },
} satisfies Meta<typeof Pager>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Boundary: Story = {
  args: {
    current: 1,
    previousDisabled: true,
  },
};
