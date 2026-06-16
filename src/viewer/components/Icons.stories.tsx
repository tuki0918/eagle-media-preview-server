import type { Meta, StoryObj } from "@storybook/react";
import {
  ChevronLeftIcon,
  MaximizeIcon,
  PanelLeftIcon,
  PanelLeftOpenIcon,
  PanelRightOpenIcon,
  PanelTopCloseIcon,
  PanelTopOpenIcon,
  SearchIcon,
  XIcon,
} from "./Icons";
import { storyPanelClassName } from "./storyFixtures";

const icons = [
  ["ChevronLeft", ChevronLeftIcon],
  ["PanelLeftOpen", PanelLeftOpenIcon],
  ["PanelRightOpen", PanelRightOpenIcon],
  ["PanelTopClose", PanelTopCloseIcon],
  ["PanelTopOpen", PanelTopOpenIcon],
  ["Maximize", MaximizeIcon],
  ["PanelLeft", PanelLeftIcon],
  ["Search", SearchIcon],
  ["X", XIcon],
] as const;

const IconGrid = () => (
  <div className={`${storyPanelClassName} grid grid-cols-3 gap-4`}>
    {icons.map(([label, Icon]) => (
      <div key={label} className="grid justify-items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-grid h-10 w-10 place-items-center rounded-md border border-border bg-card text-foreground">
          <Icon />
        </span>
        <span>{label}</span>
      </div>
    ))}
  </div>
);

const meta = {
  title: "Viewer/Icons",
  component: IconGrid,
} satisfies Meta<typeof IconGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const All: Story = {};
