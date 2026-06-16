import type { Meta, StoryObj } from "@storybook/react";
import { AdvancedFilters, SearchControls, SearchInput } from "./SearchControls";
import { storyCanvasClassName, storyPanelClassName } from "./storyFixtures";

const meta = {
  title: "Viewer/SearchControls",
  component: SearchControls,
  decorators: [(Story) => <div className={storyCanvasClassName}><Story /></div>],
  args: {
    filtersOpen: true,
    hasActiveFilters: true,
    searchQuery: "landing page",
    selectedExt: "jpg",
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
      <AdvancedFilters filtersOpen hasActiveFilters selectedExt="mp4" selectedLimit={60} selectedRating="3" />
    </div>
  ),
};
