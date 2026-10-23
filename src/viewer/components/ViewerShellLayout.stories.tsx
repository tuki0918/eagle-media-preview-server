import type { Meta, StoryObj } from "@storybook/react";
import { useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { resetPreviewDialogState, setPreviewDialogState } from "../previewDialogState";
import { ViewerShellLayout } from "./ViewerShellLayout";

const meta = {
  title: "Viewer/ViewerShellLayout",
  component: ViewerShellLayout,
  decorators: [(Story) => <TooltipProvider><Story /></TooltipProvider>],
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

// Opens the preview over the shell, e.g. to check the preview header against the results header.
export const PreviewOpen: Story = {
  decorators: [
    (Story) => {
      useEffect(() => {
        setPreviewDialogState({ hasNext: true, hasPrevious: true, infoOpen: false, mode: "unsupported", open: true });
        return () => resetPreviewDialogState();
      }, []);
      return <Story />;
    },
  ],
};
