import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Layout } from "@/components/layout";
import { Home, Frown } from "lucide-react";

export default function NotFoundPage() {
  return (
    <Layout>
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center">
          <Frown className="w-10 h-10 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold">Page Not Found</h1>
        <p className="text-muted-foreground">The page you're looking for doesn't exist.</p>
        <Link href="/">
          <Button data-testid="btn-go-home">
            <Home className="w-4 h-4 mr-2" />
            Go Home
          </Button>
        </Link>
      </div>
    </Layout>
  );
}
