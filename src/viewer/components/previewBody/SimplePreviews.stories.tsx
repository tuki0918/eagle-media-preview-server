import type { Meta, StoryObj } from "@storybook/react";
import { PdfPreview, TextPreview, UnsupportedPreview, UrlPreview } from "./SimplePreviews";
import { sampleItems } from "../storyFixtures";

const previewFrameClassName = "relative h-[520px] w-[min(820px,calc(100vw-48px))] overflow-hidden rounded-lg border border-border bg-background";

const meta = {
  title: "Viewer/PreviewBody/SimplePreviews",
  component: TextPreview,
  decorators: [(Story) => <div className={previewFrameClassName}><Story /></div>],
  args: {
    item: sampleItems[3],
  },
} satisfies Meta<typeof TextPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Text: Story = {};

export const Pdf: Story = {
  render: () => <PdfPreview item={{ ...sampleItems[3], ext: "pdf", name: "proposal.pdf" }} />,
};

export const UrlWithThumbnail: Story = {
  render: () => <UrlPreview item={{ ...sampleItems[0], ext: "url", name: "reference.url", url: "https://example.com/reference" }} />,
};

export const UrlWithoutThumbnail: Story = {
  render: () => <UrlPreview item={{ ...sampleItems[0], ext: "url", name: "reference.url", noPreview: true, noThumbnail: true, url: "https://example.com/reference" }} />,
};

export const Unsupported: Story = {
  render: () => <UnsupportedPreview item={{ ...sampleItems[0], ext: "psd", name: "campaign-layout.psd" }} />,
};
