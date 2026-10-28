declare module "jsdom" {
  export interface JSDOMOptions {
    runScripts?: "outside-only" | "dangerously";
    url?: string;
  }

  export class JSDOM {
    window: Window & typeof globalThis;

    constructor(html?: string, options?: JSDOMOptions);
  }
}
