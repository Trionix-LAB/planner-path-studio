import type { Platform } from "@/platform/contracts";
import { detectElectron } from "@/platform/runtime";
import { electronPlatform } from "@/platform/electron/platform";
import { webPlatform } from "@/platform/web/platform";

export const platform: Platform = detectElectron() ? electronPlatform : webPlatform;

export type { Platform, PickDirectoryOptions } from "@/platform/contracts";

