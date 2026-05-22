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
  // Header (~56px) + page padding accounted for by the outer dashboard chrome.
  // Lock this view to the viewport so only the iframe scrolls.
  return (
    <div className="h-screen overflow-hidden -m-6 flex flex-col">
      <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-border bg-card">
        <div className="min-w-0">
          {category && <p className="text-xs font-medium text-accent">{category}</p>}
          <h2 className="text-base font-semibold tracking-tight truncate">{title ?? "External Lesson"}</h2>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/courses">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Link>
        </Button>
      </div>
      <div className="h-[calc(100vh-4rem)] overflow-hidden bg-card">
        <iframe
          src={url}
          title={title ?? "Mindsmith lesson"}
          scrolling="yes"
          className="w-full h-full border-none"
          allow="fullscreen; autoplay; clipboard-write"
          allowFullScreen
        />
      </div>
    </div>
  );
}
