declare module "jsdom" {
  export interface JSDOMOptions {
    url?: string;
  }

  export class JSDOM {
    window: Window & typeof globalThis;

    constructor(html?: string, options?: JSDOMOptions);
  }
}
