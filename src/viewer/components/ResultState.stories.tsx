import type { Meta, StoryObj } from "@storybook/react";
import { ResultStateView } from "./ResultState";
import { noop, storyCanvasClassName } from "./storyFixtures";

const meta = {
  title: "Viewer/ResultState",
  decorators: [(Story) => <div className={storyCanvasClassName}><Story /></div>],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Message: Story = {
  render: () => <ResultStateView kind="message" text="Loading items..." />,
};

export const ErrorMessage: Story = {
  render: () => <ResultStateView className="error" kind="message" text="Unable to load items." />,
};

export const EmptyWithFilters: Story = {
  render: () => (
    <ResultStateView
      filterLabels={['"sunset"', "#travel", "#2024", "JPG", "★5,4"]}
      hasActiveFilters
      kind="empty"
      onClearFilters={noop}
    />
  ),
};

export const EmptyFolder: Story = {
  render: () => (
    <ResultStateView hasActiveFilters hasClearableFilters={false} kind="empty" onClearFilters={noop} onShowAllItems={noop} />
  ),
};

export const EmptyLibrary: Story = {
  render: () => <ResultStateView hasActiveFilters={false} kind="empty" onClearFilters={noop} />,
};
