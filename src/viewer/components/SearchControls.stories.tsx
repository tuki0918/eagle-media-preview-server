import type { Meta, StoryObj } from "@storybook/react";
import { AdvancedFilters, SearchControls, SearchFiltersButton, SearchInput } from "./SearchControls";
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
    selectedRating: "4",
  },
} satisfies Meta<typeof SearchControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MultipleRatings: Story = {
  args: {
    selectedRating: "5,4,0",
  },
};

export const NoRatingFilter: Story = {
  args: {
    selectedRating: "",
  },
};

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
      <AdvancedFilters filtersOpen hasActiveFilters selectedExt="mp4" selectedRating="3" />
    </div>
  ),
};

export const FiltersButtonWithActiveFilters: Story = {
  render: () => (
    <div className={storyPanelClassName}>
      <div className="flex items-center gap-3">
        <SearchFiltersButton />
        <SearchFiltersButton activeFilters={['"landing page"', "#web", "JPG"]} />
        <SearchFiltersButton activeFilters={["★★★★☆"]} filtersOpen />
        <SearchFiltersButton activeFilters={["★★★★☆"]} unavailable />
      </div>
    </div>
  ),
};
