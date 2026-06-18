import type { Meta, StoryObj } from "@storybook/react";
import type { CSSProperties } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
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
    setLibraryFooterName("My Eagle Library");
    setLoginConnectState({
      authenticated: true,
      authRequired: true,
      disabled: false,
      isError: false,
      message: "",
      user: { role: "editor", username: "ed" },
    });

    return (
      <TooltipProvider>
        <SidebarProvider defaultOpen style={{ "--sidebar-width": "14rem", "--sidebar-width-icon": "3rem" } as CSSProperties}>
          <AccountSideMenu />
          <SidebarInset className="min-h-dvh p-6">
            <h1 className="m-0 text-xl font-bold text-foreground">Viewer content</h1>
            <p className="text-muted-foreground">Account menu layout check</p>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    );
  },
} satisfies Meta<typeof AccountSideMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Authenticated: Story = {};
