import type { Meta, StoryObj } from "@storybook/react";
import { setTagCoverFetcher } from "../tagCovers";
import { setTagListState, type TagListState } from "../tagListState";
import { TagList } from "./TagList";
import { noop, storyPanelClassName } from "./storyFixtures";

const overview = {
  tags: [
    { name: "@character:same", imageCount: 12 },
    { name: "@work: xxx", imageCount: 4 },
    { name: "@series:hololive", imageCount: 31 },
    { name: "tree", imageCount: 1 },
    { name: "vtuber", imageCount: 8 },
    { name: "Screenshot", imageCount: 0 },
  ],
  groups: [{ id: "g1", name: "Characters", color: "orange", tags: ["@series:hololive", "vtuber"] }],
  starred: [{ name: "@character:same" }, { name: "@work: xxx" }],
};

function withTagListState(patch: Partial<TagListState>) {
  return (Story: () => JSX.Element) => {
    setTagCoverFetcher(async () => null);
    setTagListState({ error: "", onSelectTag: noop, overview: null, status: "idle", ...patch });
    return <div className={storyPanelClassName}><Story /></div>;
  };
}

const meta = {
  title: "Viewer/TagList",
  component: TagList,
} satisfies Meta<typeof TagList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  decorators: [withTagListState({ overview, status: "ready" })],
};

export const Loading: Story = {
  decorators: [withTagListState({ status: "loading" })],
};

export const Empty: Story = {
  decorators: [withTagListState({ overview: { tags: [], groups: [], starred: [] }, status: "ready" })],
};

export const LoadError: Story = {
  decorators: [withTagListState({ error: "The media server returned an error.", status: "error" })],
};
