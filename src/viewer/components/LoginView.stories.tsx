import type { Meta, StoryObj } from "@storybook/react";
import { ConnectButton, ConnectMessage, LoginView } from "./LoginView";
import { storyPanelClassName } from "./storyFixtures";

const meta = {
  title: "Viewer/LoginView",
  component: LoginView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    hidden: false,
  },
} satisfies Meta<typeof LoginView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Parts: Story = {
  render: () => (
    <div className={storyPanelClassName}>
      <div className="grid gap-4">
        <ConnectButton />
        <ConnectButton disabled />
        <ConnectMessage message="Connected to Eagle." />
        <ConnectMessage isError message="Unable to connect to Eagle." />
      </div>
    </div>
  ),
};
