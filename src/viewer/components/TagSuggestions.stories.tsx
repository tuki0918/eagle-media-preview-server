import type { Meta, StoryObj } from "@storybook/react";
import { TagSuggestions } from "./TagSuggestions";
import { noop, storyPanelClassName } from "./storyFixtures";

const meta = {
  title: "Viewer/TagSuggestions",
  component: TagSuggestions,
  decorators: [
    (Story) => (
      <div className={`${storyPanelClassName} relative min-h-[180px]`}>
        <Story />
      </div>
    ),
  ],
  args: {
    hidden: false,
    items: [
      { name: "landing", count: 42 },
      { name: "reference", count: 31 },
      { name: "campaign", count: 18 },
    ],
    onSelect: noop,
  },
} satisfies Meta<typeof TagSuggestions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
