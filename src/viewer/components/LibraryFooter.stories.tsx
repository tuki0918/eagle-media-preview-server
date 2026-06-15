import type { Meta, StoryObj } from "@storybook/react";
import { LibraryFooter } from "./LibraryFooter";
import { storyPanelClassName } from "./storyFixtures";

const meta = {
  title: "Viewer/LibraryFooter",
  component: LibraryFooter,
  decorators: [(Story) => <div className={storyPanelClassName}><Story /></div>],
  args: {
    name: "Yuta's Eagle Library",
  },
} satisfies Meta<typeof LibraryFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
