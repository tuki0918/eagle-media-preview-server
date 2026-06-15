import type { EagleFolder, EagleItem } from "../types";

export const sampleFolders: EagleFolder[] = [
  { id: "design", name: "Design References", imageCount: 124 },
  { id: "campaigns", name: "Campaigns", imageCount: 58 },
  { id: "campaigns-social", name: "Social", imageCount: 31, depth: 1 },
  { id: "screenshots", name: "Screenshots", imageCount: 17 },
];

export const sampleItems: EagleItem[] = [
  {
    id: "sample-photo",
    name: "landing-page-reference.jpg",
    ext: "jpg",
    width: 1600,
    height: 1067,
    size: 842_340,
    star: 4,
    tags: ["landing", "reference", "bright"],
    folders: ["design"],
    modificationTime: "2026-06-12T08:30:00.000Z",
  },
  {
    id: "sample-video",
    name: "launch-cut.mp4",
    ext: "mp4",
    width: 1920,
    height: 1080,
    duration: 132,
    size: 24_144_512,
    star: 3,
    tags: ["launch", "motion"],
    folders: ["campaigns-social"],
    modificationTime: "2026-06-13T14:10:00.000Z",
  },
  {
    id: "sample-audio",
    name: "podcast-intro.mp3",
    ext: "mp3",
    duration: 44,
    size: 4_210_720,
    star: 2,
    tags: ["audio"],
    folders: ["campaigns"],
    modificationTime: "2026-06-14T02:15:00.000Z",
  },
  {
    id: "sample-note",
    name: "research-notes.md",
    ext: "md",
    size: 12_840,
    star: 0,
    tags: ["notes"],
    folders: ["screenshots"],
    modificationTime: "2026-06-11T23:45:00.000Z",
  },
];

export const detailRows = [
  { label: "Name", value: "landing-page-reference.jpg" },
  { label: "Type", value: "JPG" },
  { label: "Dimensions", value: "1600 x 1067" },
  { label: "Tags", value: ["landing", "reference", "bright"], chips: true },
] as const;

export const noop = () => {};

export const storyCanvasClassName = "w-[min(960px,calc(100vw-48px))]";
export const storyPanelClassName = "w-[min(520px,calc(100vw-48px))] rounded-app border border-app-border bg-app-surface p-4 shadow-app-soft";
