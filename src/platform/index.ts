import type { Platform } from "@/platform/contracts";
import { webPlatform } from "@/platform/web/platform";

// For now we only ship a web implementation.
// When Electron is introduced, keep the same interface and switch the implementation here.
export const platform: Platform = webPlatform;

export type { Platform, PickDirectoryOptions } from "@/platform/contracts";

