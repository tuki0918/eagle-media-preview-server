import type { Meta, StoryObj } from "@storybook/react";
import { PreviewMeta, PreviewOriginalName } from "./PreviewText";
import { storyPanelClassName } from "./storyFixtures";

const meta = {
  title: "Viewer/PreviewText",
  component: PreviewOriginalName,
  decorators: [(Story) => <div className={storyPanelClassName}><Story /></div>],
} satisfies Meta<typeof PreviewOriginalName>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OriginalName: Story = {
  args: {
    value: "campaign/launch/final/landing-page-reference.jpg",
  },
};

export const MetaLine: Story = {
  render: () => <PreviewMeta value="JPG · 1600 x 1067 · 842 KB" />,
};
