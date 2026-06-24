import type { Meta, StoryObj } from "@storybook/react";
import { AudioPreview, VideoPreview } from "./MediaPreviews";
import { sampleItems } from "../storyFixtures";

const previewFrameClassName = "relative h-[520px] w-[min(820px,calc(100vw-48px))] overflow-hidden rounded-lg border border-border bg-[#05070a]";

const meta = {
  title: "Viewer/PreviewBody/MediaPreviews",
  component: VideoPreview,
  decorators: [(Story) => <div className={previewFrameClassName}><Story /></div>],
  args: {
    item: sampleItems[1],
  },
} satisfies Meta<typeof VideoPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Video: Story = {};

export const Audio: Story = {
  render: () => <AudioPreview item={sampleItems[2]} />,
};

export const AudioWithoutArtwork: Story = {
  render: () => <AudioPreview item={{ ...sampleItems[2], noPreview: true, noThumbnail: true }} />,
};
