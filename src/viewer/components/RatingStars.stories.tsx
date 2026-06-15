import type { Meta, StoryObj } from "@storybook/react";
import { PreviewRating, RatingStars } from "./RatingStars";
import { noop, sampleItems, storyPanelClassName } from "./storyFixtures";

const meta = {
  title: "Viewer/RatingStars",
  component: RatingStars,
  decorators: [(Story) => <div className={storyPanelClassName}><Story /></div>],
  args: {
    className: "rating-control inline-flex items-center gap-1",
    interactive: false,
    item: sampleItems[0],
    onSelect: noop,
  },
} satisfies Meta<typeof RatingStars>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Static: Story = {};

export const Interactive: Story = {
  args: {
    interactive: true,
  },
};

export const StoreBackedPreviewRating: Story = {
  render: () => <PreviewRating />,
};
