import type { Meta, StoryObj } from "@storybook/react";
import { useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { resetPreviewDialogState, setPreviewDialogState } from "../previewDialogState";
import { setLibraryFooterName } from "../libraryFooterState";
import { setLibraryName } from "../libraryNameState";
import { setResultSurfaceState } from "../resultSurfaceState";
import { setResultsStatusState } from "../resultsStatusState";
import { setSearchControlsState } from "../searchControlsState";
import { initializeSubfoldersVisible } from "../subfolderVisibilityState";
import { setThemePreference } from "../themeState";
import { noop, sampleItems } from "./storyFixtures";
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

export const Subfolders: Story = {
  decorators: [
    (Story) => {
      useEffect(() => {
        initializeSubfoldersVisible();
        setThemePreference("light");
        setLibraryName("My Eagle Library");
        setLibraryFooterName("My Eagle Library");
        setSearchControlsState({
          allFoldersTotal: 247,
          filtersOpen: false,
          folders: [{
            id: "references",
            name: "Design References",
            imageCount: 124,
            isExpand: true,
            children: [
              { id: "landscapes", name: "Landscapes", imageCount: 48, depth: 1 },
              { id: "architecture", name: "Architecture", imageCount: 32, depth: 1 },
              { id: "textures", name: "Textures", imageCount: 44, depth: 1 },
              { id: "empty-folder", name: "New collection", imageCount: 0, depth: 1 },
            ],
          }],
          hasActiveFilters: false,
          hasResettableFilters: false,
          searchQuery: "",
          section: "items",
          selectedExt: "",
          selectedFolderId: "references",
          selectedLimit: 30,
          selectedRating: "",
          selectedSmartFolderId: "",
          smartFolders: [],
        });
        setResultSurfaceState({ kind: "list", items: sampleItems.slice(0, 3), onOpenPreview: noop, viewMode: "grid" });
        setResultsStatusState({ total: 124, viewMode: "grid" });
      }, []);
      return <Story />;
    },
  ],
};

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
