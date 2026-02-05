import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Routes } from "react-router-dom";
import StartScreen from "./pages/StartScreen";
import MapWorkspace from "./pages/MapWorkspace";
import NotFound from "./pages/NotFound";
import { AppRouter } from "@/platform/router";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppRouter>
        <Routes>
          <Route path="/" element={<StartScreen />} />
          <Route path="/map" element={<MapWorkspace />} />
          <Route path="/create-mission" element={<MapWorkspace />} />
          <Route path="/open-mission" element={<MapWorkspace />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
