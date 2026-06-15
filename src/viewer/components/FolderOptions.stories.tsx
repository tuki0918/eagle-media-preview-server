import type { Meta, StoryObj } from "@storybook/react";
import { FolderOptions } from "./FolderOptions";
import { sampleFolders, storyPanelClassName } from "./storyFixtures";

const meta = {
  title: "Viewer/FolderOptions",
  component: FolderOptions,
  args: {
    folders: sampleFolders,
  },
  render: (args) => (
    <div className={storyPanelClassName}>
      <select className="min-h-[46px] w-full rounded-app border border-app-border bg-app-surface px-3">
        <FolderOptions {...args} />
      </select>
    </div>
  ),
} satisfies Meta<typeof FolderOptions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
