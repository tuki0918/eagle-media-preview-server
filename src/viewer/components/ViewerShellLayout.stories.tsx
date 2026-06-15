import type { Meta, StoryObj } from "@storybook/react";
import { ViewerShellLayout } from "./ViewerShellLayout";

const meta = {
  title: "Viewer/ViewerShellLayout",
  component: ViewerShellLayout,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    hidden: false,
  },
} satisfies Meta<typeof ViewerShellLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyShell: Story = {};
