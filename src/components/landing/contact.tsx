import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  agency: z.string().trim().min(1).max(150),
  email: z.string().trim().email().max(255),
  message: z.string().trim().min(5).max(1000),
});

export function Contact() {
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse({
      name: fd.get("name"),
      agency: fd.get("agency"),
      email: fd.get("email"),
      message: fd.get("message"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check your inputs.");
      return;
    }
    setSubmitting(true);
    setTimeout(() => {
      toast.success("Thanks — we'll be in touch within one business day.");
      (e.target as HTMLFormElement).reset();
      setSubmitting(false);
    }, 600);
  };

  return (
    <section id="contact" className="bg-background py-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 md:grid-cols-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">Contact us</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Talk to our compliance team
          </h2>
          <p className="mt-4 text-muted-foreground">
            Tell us about your agency and we'll show you exactly how CareCompliance fits into your
            workflows. No high-pressure sales — just answers.
          </p>
          <dl className="mt-8 space-y-4 text-sm">
            <div><dt className="font-medium">Response time</dt><dd className="text-muted-foreground">Within one business day</dd></div>
            <div><dt className="font-medium">Demo length</dt><dd className="text-muted-foreground">~25 minutes, fully tailored</dd></div>
            <div><dt className="font-medium">Email</dt><dd className="text-muted-foreground">hello@carecompliance.app</dd></div>
          </dl>
        </div>

        <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" name="name" required maxLength={100} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="agency">Agency name</Label>
              <Input id="agency" name="agency" required maxLength={150} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Work email</Label>
              <Input id="email" name="email" type="email" required maxLength={255} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="message">Message</Label>
              <Textarea id="message" name="message" rows={4} required maxLength={1000} />
            </div>
            <Button type="submit" disabled={submitting} className="bg-[image:var(--gradient-brand)] text-primary-foreground">
              {submitting ? "Sending…" : "Send message"}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
