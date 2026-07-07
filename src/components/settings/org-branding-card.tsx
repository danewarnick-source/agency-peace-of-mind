import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { OrgLogo, useOrgBranding } from "@/components/branding/org-logo";
import { PhotoUpload } from "@/components/person/photo-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ImageIcon } from "lucide-react";

/**
 * Org logo + face-sheet contact block (address, phone).
 * Admin/manager only (RLS on organization_branding also enforces this).
 */
export function OrgBrandingCard() {
  const { data: org } = useCurrentOrg();
  const { user } = useAuth();
  const qc = useQueryClient();
  const orgId = org?.organization_id ?? null;
  const { data: branding, refetch } = useOrgBranding(orgId);

  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAddress(branding?.org_address ?? "");
    setPhone(branding?.org_phone ?? "");
  }, [branding?.org_address, branding?.org_phone]);

  if (!orgId) return null;
  const isAdmin = org?.role === "admin" || org?.role === "super_admin" || org?.role === "manager";
  if (!isAdmin) return null;

  const save = async (patch: Record<string, unknown>) => {
    const { error } = await supabase
      .from("organization_branding")
      .upsert(
        {
          organization_id: orgId,
          updated_by: user?.id ?? null,
          ...patch,
        },
        { onConflict: "organization_id" },
      );
    if (error) throw error;
    await refetch();
    void qc.invalidateQueries({ queryKey: ["org-branding", orgId] });
  };

  const saveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await save({
        org_address: address.trim() || null,
        org_phone: phone.trim() || null,
      });
      toast.success("Branding saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] lg:col-span-2">
      <div className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Organization branding</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Logo and header contact info shown on the Client Face Sheet and other branded surfaces.
        If no logo is uploaded, your organization name is rendered in its place — never a broken image.
      </p>

      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
            <p className="mb-3 text-xs font-medium text-muted-foreground">Current header preview</p>
            <OrgLogo
              organizationId={orgId}
              orgName={org?.organization_name}
              className="h-16"
            />
          </div>
          <PhotoUpload
            bucket="org-branding"
            organizationId={orgId}
            subjectId="logo"
            currentPath={branding?.logo_path ?? null}
            onUploaded={async (path) => {
              await save({
                logo_path: path,
                logo_uploaded_at: new Date().toISOString(),
              });
            }}
            onCleared={async () => {
              await save({ logo_path: null, logo_uploaded_at: null });
            }}
            label={branding?.logo_path ? "Replace logo" : "Upload logo"}
          />
          <p className="text-[11px] text-muted-foreground">
            PNG, JPG, or WebP. Max 8 MB. Transparent PNG recommended.
          </p>
        </div>

        <form onSubmit={saveContact} className="space-y-3">
          <div className="grid gap-2">
            <Label htmlFor="org_address">Organization address</Label>
            <Input
              id="org_address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, Salt Lake City, UT 84101"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="org_phone">Organization phone</Label>
            <Input
              id="org_phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(801) 555-0100"
            />
          </div>
          <div>
            <Button type="submit" disabled={busy} size="sm">
              Save contact block
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
