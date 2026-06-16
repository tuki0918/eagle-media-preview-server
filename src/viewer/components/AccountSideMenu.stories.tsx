import type { Meta, StoryObj } from "@storybook/react";
import { AccountSideMenu } from "./AccountSideMenu";
import { setLibraryFooterName } from "../libraryFooterState";
import { setLoginConnectState } from "../loginConnectState";

const meta = {
  title: "Viewer/AccountSideMenu",
  component: AccountSideMenu,
  parameters: {
    layout: "fullscreen",
  },
  render: () => {
    setLibraryFooterName("Yuta's Eagle Library");
    setLoginConnectState({
      authenticated: true,
      authRequired: true,
      disabled: false,
      isError: false,
      message: "",
      user: { role: "editor", username: "ed" },
    });

    return (
      <div className="min-h-dvh pl-0 min-[720px]:pl-[72px] min-[1180px]:pl-[224px]">
        <AccountSideMenu />
        <main className="p-6">
          <h1 className="m-0 text-xl font-bold text-foreground">Viewer content</h1>
          <p className="text-muted-foreground">Account menu layout check</p>
        </main>
      </div>
    );
  },
} satisfies Meta<typeof AccountSideMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Authenticated: Story = {};
