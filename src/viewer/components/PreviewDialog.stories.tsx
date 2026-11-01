import type { Meta, StoryObj } from "@storybook/react";
import { useEffect } from "react";
import { clearPreviewBodyState, setPreviewBodyState } from "../previewBodyState";
import { resetPreviewDialogState, setPreviewDialogState } from "../previewDialogState";
import { clearPreviewInfoState, setPreviewInfoState } from "../previewInfoState";
import { setPreviewTextState } from "../previewTextState";
import { PreviewDialog } from "./PreviewDialog";
import { sampleItems } from "./storyFixtures";

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
      setPreviewTextState({ displayName: "Design reference", originalName: "Design reference.jpg" });
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
        setPreviewTextState({ displayName: "", originalName: "" });
      };
    }, []);
    return <Story />;
  }],
};

// Phone-sized viewports overlay the header on the image; toggle the html "dark" class to compare themes.
export const ImageOverlay: Story = {
  decorators: [(Story) => {
    useEffect(() => {
      setPreviewDialogState({ infoOpen: false, mode: "image", open: true });
      setPreviewTextState({ displayName: "landing-page-reference", originalName: "landing-page-reference.jpg" });
      setPreviewBodyState({ item: sampleItems[0], kind: "image", srcKind: "thumb" });
      return () => {
        resetPreviewDialogState();
        clearPreviewBodyState();
        setPreviewTextState({ displayName: "", originalName: "" });
      };
    }, []);
    return <Story />;
  }],
};
