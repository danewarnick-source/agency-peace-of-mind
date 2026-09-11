import { createFileRoute } from "@tanstack/react-router";
import { CertReviewPanel } from "@/components/compliance/cert-review-panel";

export const Route = createFileRoute("/dashboard/compliance_/cert-review/$completionId")({
  head: () => ({ meta: [{ title: "Review certificate — Provider Interface" }] }),
  component: CertReviewPage,
});

function CertReviewPage() {
  const { completionId } = Route.useParams();
  return <CertReviewPanel completionId={completionId} />;
}
