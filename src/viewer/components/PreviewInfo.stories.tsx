import type { Meta, StoryObj } from "@storybook/react";
import { PreviewActions, PreviewDetailsPanel, PreviewInfoActions, PreviewInfoDetails } from "./PreviewInfo";
import { detailRows, sampleFolders, sampleItems, storyPanelClassName } from "./storyFixtures";

const suggestions = (query: string, selectedValues: string[]) => {
  const all = ["landing", "reference", "bright", "campaign", "social"];
  return all
    .filter((value) => value.includes(query.toLowerCase()) && !selectedValues.includes(value))
    .map((name) => ({ value: name, label: name, meta: "12 items" }));
};

const meta = {
  title: "Viewer/PreviewInfo",
  component: PreviewDetailsPanel,
  decorators: [(Story) => <div className={storyPanelClassName}><Story /></div>],
  args: {
    detailRows,
    folders: sampleFolders,
    item: sampleItems[0],
    onFolderSuggestions: suggestions,
    onSaveMetadata: async (_item, patch) => patch,
    onTagSuggestions: suggestions,
  },
} satisfies Meta<typeof PreviewDetailsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DetailsPanel: Story = {};

export const Actions: Story = {
  render: () => <PreviewActions canManageLibrary item={sampleItems[0]} onToggleTrash={async () => {}} />,
};

export const StoreBackedShells: Story = {
  render: () => (
    <div className="grid gap-4">
      <PreviewInfoDetails />
      <PreviewInfoActions />
    </div>
  ),
};
