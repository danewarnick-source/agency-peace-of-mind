import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkHiveExecutive } from "@/lib/hive-exec.functions";
import { useAuth } from "./use-auth";

export function useIsHiveExecutive() {
  const { session } = useAuth();
  const check = useServerFn(checkHiveExecutive);
  const q = useQuery({
    queryKey: ["hive-executive", session?.user?.id ?? "none"],
    enabled: !!session?.user?.id,
    queryFn: () => check(),
    staleTime: 60_000,
  });
  return { isExecutive: !!q.data?.isExecutive, isLoading: q.isLoading };
}
