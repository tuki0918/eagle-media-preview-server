import type { Meta, StoryObj } from "@storybook/react";
import type { CSSProperties } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AccountSideMenu } from "./AccountSideMenu";
import { setLibraryFooterName } from "../libraryFooterState";
import { setLoginConnectState } from "../loginConnectState";
import { setSearchControlsState, type SearchControlsState } from "../searchControlsState";
import { setThemePreference } from "../themeState";
import { sampleFolders, sampleSmartFolders } from "./storyFixtures";

const meta = {
  title: "Viewer/AccountSideMenu",
  component: AccountSideMenuStory,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    role: "editor",
    username: "ed",
  },
} satisfies Meta<typeof AccountSideMenuStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Authenticated: Story = {};

export const Admin: Story = {
  args: {
    role: "admin",
    username: "admin",
  },
};

export const AuthError: Story = {
  args: {
    isError: true,
    message: "Session expired. Sign in again.",
    role: "viewer",
    username: "viewer",
  },
};

export const PublicAccess: Story = {
  args: {
    authenticated: false,
    authRequired: false,
    selectedFolderId: "",
  },
};

export const SmartFolderSelected: Story = {
  args: {
    selectedFolderId: "",
    selectedSmartFolderId: "favorites",
  },
};

export const DarkTheme: Story = {
  args: {
    theme: "dark",
  },
};

interface AccountMenuStoryArgs {
  authenticated?: boolean;
  authRequired?: boolean;
  disabled?: boolean;
  isError?: boolean;
  message?: string;
  role?: string;
  selectedFolderId?: string;
  selectedSmartFolderId?: string;
  theme?: "dark" | "light";
  username?: string;
}

function AccountSideMenuStory(args: AccountMenuStoryArgs) {
  setLibraryFooterName("My Eagle Library - Eagle 4.0.0");
  setThemePreference(args.theme ?? "light");
  setLoginConnectState({
    authenticated: args.authenticated ?? true,
    authRequired: args.authRequired ?? true,
    disabled: args.disabled ?? false,
    isError: args.isError ?? false,
    message: args.message ?? "",
    user: args.authenticated === false ? null : { role: args.role ?? "editor", username: args.username ?? "ed" },
  });
  setSearchControlsState(storySearchState({
    selectedFolderId: args.selectedFolderId ?? "campaigns-social",
    selectedSmartFolderId: args.selectedSmartFolderId ?? "",
  }));

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
}

function storySearchState(overrides: Partial<SearchControlsState> = {}): SearchControlsState {
  return {
    allFoldersTotal: 247,
    filtersOpen: false,
    folders: sampleFolders,
    hasActiveFilters: false,
    hasResettableFilters: false,
    searchQuery: "",
    selectedExt: "",
    selectedFolderId: "",
    selectedLimit: 30,
    selectedRating: "",
    selectedSmartFolderId: "",
    smartFolders: sampleSmartFolders,
    ...overrides,
  };
}
