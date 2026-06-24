import type { Meta, StoryObj } from "@storybook/react";
import { PreviewNotice } from "./shared";

const meta = {
  title: "Viewer/PreviewBody/PreviewNotice",
  component: PreviewNotice,
  decorators: [(Story) => <div className="grid min-h-[180px] w-[min(520px,calc(100vw-48px))] place-items-center rounded-lg border border-border bg-[#05070a] p-6 [&_.preview-notice]:text-white"><Story /></div>],
  args: {
    message: "This format is not supported in this browser.",
  },
} satisfies Meta<typeof PreviewNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LongMessage: Story = {
  args: {
    message: "This video could not be played on this device. iPhone requires Safari-compatible video such as H.264 video with AAC audio.",
  },
};
