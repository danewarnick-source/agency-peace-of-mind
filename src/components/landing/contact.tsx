import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  company: z.string().trim().max(100).optional(),
  message: z.string().trim().min(10, "Tell us a bit more").max(1000),
});

export function Contact() {
  const [busy, setBusy] = useState(false);
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse({
      name: fd.get("name"), email: fd.get("email"),
      company: fd.get("company"), message: fd.get("message"),
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    await new Promise((r) => setTimeout(r, 600));
    setBusy(false);
    (e.target as HTMLFormElement).reset();
    toast.success("Thanks — we'll be in touch within one business day.");
  };

  return (
    <section id="contact" className="bg-[color:var(--surface-2)] py-24">
      <div className="mx-auto grid max-w-5xl gap-12 px-6 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--amber-600)]">Contact</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[color:var(--navy-900)] md:text-4xl">Talk to our team</h2>
          <p className="mt-4 text-[color:var(--text-soft)]">Questions about a rollout, custom training, or enterprise pricing? We typically reply within one business day.</p>
          <dl className="mt-8 space-y-3 text-sm">
            <div><dt className="font-semibold text-[color:var(--navy-900)]">Email</dt><dd className="text-[color:var(--text-soft)]">hello@careacademy.example</dd></div>
            <div><dt className="font-semibold text-[color:var(--navy-900)]">Hours</dt><dd className="text-[color:var(--text-soft)]">Mon–Fri · 9am–6pm ET</dd></div>
          </dl>
        </div>
        <form onSubmit={onSubmit} className="rounded-2xl border border-[color:var(--border-light)] bg-white p-7 shadow-[var(--shadow-card)]">
          <div className="grid gap-4">
            <div className="grid gap-2"><Label htmlFor="name">Full name</Label><Input id="name" name="name" required /></div>
            <div className="grid gap-2"><Label htmlFor="email">Work email</Label><Input id="email" name="email" type="email" required /></div>
            <div className="grid gap-2"><Label htmlFor="company">Company</Label><Input id="company" name="company" /></div>
            <div className="grid gap-2"><Label htmlFor="message">Message</Label><Textarea id="message" name="message" rows={5} required /></div>
            <Button type="submit" disabled={busy} size="lg">{busy ? "Sending…" : "Send message"}</Button>
          </div>
        </form>
      </div>
    </section>
  );
}
