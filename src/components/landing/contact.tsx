import { useState } from "react";
import { z } from "zod";
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
      name: fd.get("name"),
      email: fd.get("email"),
      company: fd.get("company"),
      message: fd.get("message"),
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    await new Promise((r) => setTimeout(r, 600));
    setBusy(false);
    (e.target as HTMLFormElement).reset();
    toast.success("Thanks — we'll be in touch within one business day.");
  };

  return (
    <section id="contact" className="pi-home-contact-grid">
      <div>
        <p className="pi-home-kicker">Contact</p>
        <h2>Talk to our team</h2>
        <p className="pi-home-lede">
          Questions about a rollout, custom training, or enterprise pricing? We typically reply
          within one business day.
        </p>
        <dl className="pi-home-contact-meta">
          <div>
            <dt>Email</dt>
            <dd>Use the form — we reply within one business day.</dd>
          </div>
          <div>
            <dt>Hours</dt>
            <dd>Mon–Fri · 9am–6pm ET</dd>
          </div>
        </dl>
      </div>
      <form onSubmit={onSubmit} className="pi-home-cream-card">
        <div className="grid gap-4">
          <div className="pi-home-field">
            <label htmlFor="name">Full name</label>
            <input id="name" name="name" required />
          </div>
          <div className="pi-home-field">
            <label htmlFor="email">Work email</label>
            <input id="email" name="email" type="email" required />
          </div>
          <div className="pi-home-field">
            <label htmlFor="company">Company</label>
            <input id="company" name="company" />
          </div>
          <div className="pi-home-field">
            <label htmlFor="message">Message</label>
            <textarea id="message" name="message" rows={5} required />
          </div>
          <button type="submit" disabled={busy} className="pi-home-btn gold">
            {busy ? "Sending…" : "Send message"}
          </button>
        </div>
      </form>
    </section>
  );
}
