import type { Meta, StoryObj } from "@storybook/react";
import { PageButtons } from "./PageButtons";
import { noop, storyPanelClassName } from "./storyFixtures";

const meta = {
  title: "Viewer/PageButtons",
  component: PageButtons,
  decorators: [(Story) => <div className={storyPanelClassName}><div className="inline-flex items-center gap-2"><Story /></div></div>],
  args: {
    current: 5,
    pages: [1, "...", 4, 5, 6, "...", 12],
    onSelect: noop,
  },
} satisfies Meta<typeof PageButtons>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
