import type { AureumDesktopApi } from "./index";

declare global {
  interface Window {
    aureum: AureumDesktopApi;
  }
}

export {};
