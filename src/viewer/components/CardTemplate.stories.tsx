import type { Meta, StoryObj } from "@storybook/react";
import { CardTemplate } from "./CardTemplate";
import { storyPanelClassName } from "./storyFixtures";

const meta = {
  title: "Viewer/CardTemplate",
  component: CardTemplate,
  decorators: [(Story) => <div className={storyPanelClassName}><Story /></div>],
} satisfies Meta<typeof CardTemplate>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TemplateElement: Story = {};
