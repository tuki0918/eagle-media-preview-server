import type { Meta, StoryObj } from "@storybook/react";
import { PreviewDialog } from "./PreviewDialog";

const meta = {
  title: "Viewer/PreviewDialog",
  component: PreviewDialog,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof PreviewDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StoreBacked: Story = {};
