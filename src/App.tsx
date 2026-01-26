import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import CreateSession from "./pages/CreateSession";
import JoinSession from "./pages/JoinSession";
import Lobby from "./pages/Lobby";
import Questions from "./pages/Questions";
import Swipe from "./pages/Swipe";
import Results from "./pages/Results";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/create" element={<CreateSession />} />
          <Route path="/join/:code" element={<JoinSession />} />
          <Route path="/lobby/:code" element={<Lobby />} />
          <Route path="/questions/:code" element={<Questions />} />
          <Route path="/swipe/:code" element={<Swipe />} />
          <Route path="/results/:code" element={<Results />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
