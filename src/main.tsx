import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initAppTheme } from "@/features/settings";

initAppTheme();

createRoot(document.getElementById("root")!).render(<App />);
