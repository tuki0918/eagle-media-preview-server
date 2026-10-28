import type { Meta, StoryObj } from "@storybook/react";
import { useEffect } from "react";
import { resetPreviewDialogState, setPreviewDialogState } from "../previewDialogState";
import { clearPreviewInfoState, setPreviewInfoState } from "../previewInfoState";
import { setPreviewTextState } from "../previewTextState";
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

export const DetailsOpen: Story = {
  decorators: [(Story) => {
    useEffect(() => {
      setPreviewDialogState({ infoOpen: true, mode: "image", open: true });
      setPreviewTextState({ displayName: "Design reference", originalName: "Design reference.jpg", meta: "JPG · 1600 × 1067" });
      setPreviewInfoState({
        canEditMetadata: true,
        item: { id: "sample", name: "Design reference", ext: "jpg", tags: ["reference", "design", "inspiration"], folders: ["design"] },
        folders: [{ id: "design", name: "Design References" }],
        detailRows: [{ label: "Type", value: "JPG" }, { label: "Dimensions", value: "1600 × 1067" }, { label: "Size", value: "823 KB" }],
        onFolderSuggestions: () => [],
        onTagSuggestions: () => [],
        onSaveMetadata: async (_item, patch) => patch,
      });
      return () => {
        resetPreviewDialogState();
        clearPreviewInfoState();
        setPreviewTextState({ displayName: "", originalName: "", meta: "" });
      };
    }, []);
    return <Story />;
  }],
};
