import type { Meta, StoryObj } from "@storybook/react";
import { ResultsStatus } from "./ResultsStatus";
import { storyCanvasClassName } from "./storyFixtures";

const meta = {
  title: "Viewer/ResultsStatus",
  component: ResultsStatus,
  decorators: [(Story) => <div className={storyCanvasClassName}><Story /></div>],
  args: {
    total: 1284,
    viewMode: "grid",
  },
} satisfies Meta<typeof ResultsStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Grid: Story = {};

export const List: Story = {
  args: {
    viewMode: "list",
  },
};
