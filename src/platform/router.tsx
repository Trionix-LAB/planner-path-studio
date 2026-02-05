import type { ReactNode } from "react";
import { BrowserRouter, HashRouter } from "react-router-dom";

import { platform } from "@/platform";

const RouterImpl = platform.runtime.isElectron ? HashRouter : BrowserRouter;

export const AppRouter = ({ children }: { children: ReactNode }) => {
  return <RouterImpl>{children}</RouterImpl>;
};

