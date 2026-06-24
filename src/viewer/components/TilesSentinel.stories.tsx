import type { Meta, StoryObj } from "@storybook/react";
import { TilesSentinel } from "./TilesSentinel";
import { storyPanelClassName } from "./storyFixtures";

const meta = {
  title: "Viewer/TilesSentinel",
  component: TilesSentinel,
  decorators: [(Story) => <div className={storyPanelClassName}><Story /></div>],
  args: {
    hidden: false,
    text: "Loading more items...",
  },
} satisfies Meta<typeof TilesSentinel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {};

export const Hidden: Story = {
  args: {
    hidden: true,
  },
};
