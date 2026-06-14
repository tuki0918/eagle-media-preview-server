export interface EagleFolder {
  id: string;
  name: string;
  imageCount?: number;
  children?: EagleFolder[];
  depth?: number;
}

export interface EagleItem {
  id?: string;
  name?: string;
  ext?: string;
  width?: number;
  height?: number;
  duration?: unknown;
  size?: number;
  tags?: unknown;
  folders?: unknown;
  [key: string]: unknown;
}
