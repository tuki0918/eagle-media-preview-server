import type { Meta, StoryObj } from "@storybook/react";
import { PreviewBody, PreviewBodyHost } from "./PreviewBody";
import { sampleItems } from "./storyFixtures";

const previewFrameClassName = "relative h-[520px] w-[min(820px,calc(100vw-48px))] overflow-hidden rounded-lg border border-border bg-[#05070a]";

const meta = {
  title: "Viewer/PreviewBody",
  component: PreviewBody,
  decorators: [(Story) => <div className={previewFrameClassName}><Story /></div>],
  args: {
    item: sampleItems[0],
    kind: "image",
    srcKind: "thumb",
  },
} satisfies Meta<typeof PreviewBody>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Image: Story = {};

export const Audio: Story = {
  args: {
    item: sampleItems[2],
    kind: "audio",
  },
};

export const Text: Story = {
  args: {
    item: sampleItems[3],
    kind: "text",
  },
};

export const Unsupported: Story = {
  args: {
    item: { ...sampleItems[3], ext: "psd", name: "mockup.psd" },
    kind: "unsupported",
  },
};

export const StoreBackedHost: Story = {
  render: () => <PreviewBodyHost />,
};
