const getUserAgent = (): string => {
  if (typeof navigator === "undefined") return "";
  return (navigator.userAgent || "").toLowerCase();
};

export const detectElectron = (): boolean => {
  // Future-proofing:
  // - userAgent contains "Electron" in packaged apps
  // - preload can optionally set window.electronAPI
  const ua = getUserAgent();
  const w = window as unknown as { electronAPI?: unknown };
  return ua.includes("electron") || Boolean(w.electronAPI);
};

