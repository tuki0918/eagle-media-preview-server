import type { Meta, StoryObj } from "@storybook/react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AccountSideMenu } from "./AccountSideMenu";
import { setEagleStatus, type EagleStatus } from "../eagleStatusState";
import { setLibraryFooterName } from "../libraryFooterState";
import { setLoginConnectState } from "../loginConnectState";
import { setSearchControlsState, type SearchControlsState } from "../searchControlsState";
import { setThemePreference } from "../themeState";
import type { EagleFolder, EagleSmartFolder } from "../types";
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

export const EagleUnavailable: Story = {
  args: {
    eagleStatus: "offline",
  },
};

export const EagleChecking: Story = {
  args: {
    eagleStatus: "checking",
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

export const FolderFiltering: Story = {
  args: {
    folders: [
      {
        id: "references",
        name: "References",
        imageCount: 124,
        children: [
          { id: "web-design", name: "Web Design", imageCount: 80, depth: 1 },
          { id: "mobile-design", name: "Mobile Design", imageCount: 44, depth: 1 },
        ],
      },
      ...Array.from({ length: 24 }, (_, index) => ({
        id: `project-${index}`,
        name: `Project ${String(index + 1).padStart(2, "0")}`,
        imageCount: index * 3,
      })),
    ],
    smartFolders: [
      { id: "design-favorites", name: "Design Favorites", imageCount: 16, conditions: [] },
      ...sampleSmartFolders,
    ],
  },
};

interface AccountMenuStoryArgs {
  authenticated?: boolean;
  authRequired?: boolean;
  disabled?: boolean;
  eagleStatus?: EagleStatus;
  folders?: EagleFolder[];
  isError?: boolean;
  message?: string;
  role?: string;
  selectedFolderId?: string;
  selectedSmartFolderId?: string;
  smartFolders?: EagleSmartFolder[];
  theme?: "dark" | "light";
  username?: string;
}

function AccountSideMenuStory(args: AccountMenuStoryArgs) {
  setLibraryFooterName("My Eagle Library");
  setEagleStatus(args.eagleStatus ?? "online");
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
    folders: args.folders ?? sampleFolders,
    selectedFolderId: args.selectedFolderId ?? "campaigns-social",
    selectedSmartFolderId: args.selectedSmartFolderId ?? "",
    smartFolders: args.smartFolders ?? sampleSmartFolders,
  }));

  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen sidebarWidth={16 * 16}>
        <AccountSideMenu />
        <SidebarInset className="min-h-dvh p-6">
          <SidebarTrigger className="mb-4 md:hidden" />
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
    tagsTotal: 86,
    uncategorizedTotal: 12,
    untaggedTotal: 34,
    ...overrides,
  };
}
