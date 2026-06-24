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
      <select className="min-h-[46px] w-full rounded-md border border-border bg-card px-3">
        <FolderOptions {...args} />
      </select>
    </div>
  ),
} satisfies Meta<typeof FolderOptions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Nested: Story = {
  args: {
    folders: [
      { id: "brand", name: "Brand", imageCount: 128 },
      { id: "brand-guides", name: "Guides", imageCount: 22, depth: 1 },
      { id: "brand-social", name: "Social Campaigns", imageCount: 58, depth: 1 },
      { id: "brand-social-q3", name: "Q3 Launch", imageCount: 14, depth: 2 },
    ],
  },
};

export const Empty: Story = {
  args: {
    folders: [],
  },
};
