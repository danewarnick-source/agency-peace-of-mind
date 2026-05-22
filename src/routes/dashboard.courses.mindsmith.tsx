import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";

const searchSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  category: z.string().optional(),
});

export const Route = createFileRoute("/dashboard/courses/mindsmith")({
  validateSearch: searchSchema,
  component: MindsmithPlayer,
});

function MindsmithPlayer() {
  const { url, title, category } = useSearch({ from: "/dashboard/courses/mindsmith" });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          {category && <p className="text-xs font-medium text-accent">{category}</p>}
          <h2 className="text-lg font-semibold tracking-tight">{title ?? "External Lesson"}</h2>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/courses">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to library
          </Link>
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <iframe
          src={url}
          title={title ?? "Mindsmith lesson"}
          className="w-full h-[75vh] rounded-lg"
          allow="fullscreen; autoplay; clipboard-write"
          allowFullScreen
        />
      </div>
    </div>
  );
}
