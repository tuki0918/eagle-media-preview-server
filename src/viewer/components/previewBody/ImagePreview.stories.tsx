import type { Meta, StoryObj } from "@storybook/react";
import { ImagePreview } from "./ImagePreview";
import { sampleItems } from "../storyFixtures";

const previewFrameClassName = "relative h-[520px] w-[min(820px,calc(100vw-48px))] overflow-hidden rounded-lg border border-border bg-[#05070a]";

const meta = {
  title: "Viewer/PreviewBody/ImagePreview",
  component: ImagePreview,
  decorators: [(Story) => <div className={previewFrameClassName}><Story /></div>],
  args: {
    item: sampleItems[0],
    srcKind: "thumb",
  },
} satisfies Meta<typeof ImagePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Thumbnail: Story = {};

export const OriginalFile: Story = {
  args: {
    srcKind: "file",
  },
};

export const MissingThumbnail: Story = {
  args: {
    item: { ...sampleItems[0], noPreview: true, noThumbnail: true },
    srcKind: "thumb",
  },
};
