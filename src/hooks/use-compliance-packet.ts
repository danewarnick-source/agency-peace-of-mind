import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getCompliancePacket,
  type CompliancePacketPayload,
} from "@/lib/obligations/packet.functions";
import type { PacketSubjectKind } from "@/lib/obligations/packet";

export function useCompliancePacket(
  organizationId: string | undefined,
  subject: PacketSubjectKind,
  subjectId?: string | null,
) {
  const fn = useServerFn(getCompliancePacket);
  return useQuery<CompliancePacketPayload | null>({
    queryKey: ["compliance-packet", organizationId, subject, subjectId ?? null],
    enabled: !!organizationId,
    queryFn: () =>
      fn({
        data: {
          organizationId: organizationId!,
          subject,
          subjectId: subjectId ?? null,
        },
      }),
  });
}
