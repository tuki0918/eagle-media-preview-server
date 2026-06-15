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
  render: () => <ResultStateView hasActiveFilters kind="empty" onClearFilters={noop} />,
};
