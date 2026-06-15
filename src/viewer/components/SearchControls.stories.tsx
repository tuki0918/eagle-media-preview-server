import type { Meta, StoryObj } from "@storybook/react";
import { AdvancedFilters, SearchControls, SearchInput } from "./SearchControls";
import { sampleFolders, storyCanvasClassName, storyPanelClassName } from "./storyFixtures";

const meta = {
  title: "Viewer/SearchControls",
  component: SearchControls,
  decorators: [(Story) => <div className={storyCanvasClassName}><Story /></div>],
  args: {
    filtersOpen: true,
    folders: sampleFolders,
    hasActiveFilters: true,
    searchQuery: "landing page",
    selectedExt: "jpg",
    selectedFolderId: "design",
    selectedLimit: 30,
    selectedRating: "4",
  },
} satisfies Meta<typeof SearchControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Collapsed: Story = {
  args: {
    filtersOpen: false,
  },
};

export const InputOnly: Story = {
  render: () => (
    <div className={storyPanelClassName}>
      <SearchInput value="brand references" />
    </div>
  ),
};

export const AdvancedFiltersOnly: Story = {
  render: () => (
    <div className={storyCanvasClassName}>
      <AdvancedFilters filtersOpen folders={sampleFolders} selectedExt="mp4" selectedFolderId="campaigns" selectedLimit={60} selectedRating="3" />
    </div>
  ),
};
