import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App";
import { DevAuthProvider } from "@/hooks/use-auth";
import { Toaster } from "sonner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <DevAuthProvider>
        <App />
        <Toaster richColors position="top-center" />
      </DevAuthProvider>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
