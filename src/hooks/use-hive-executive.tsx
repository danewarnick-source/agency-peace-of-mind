import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkHiveExecutive } from "@/lib/hive-exec.functions";
import { useAuth } from "./use-auth";

export function useIsHiveExecutive() {
  const { session, loading: authLoading } = useAuth();
  const check = useServerFn(checkHiveExecutive);
  const enabled = !!session?.user?.id;
  const q = useQuery({
    queryKey: ["hive-executive", session?.user?.id ?? "none"],
    enabled,
    queryFn: async () => {
      const result = await check();
      return result ?? { isExecutive: false };
    },
    staleTime: 60_000,
    retry: 1,
  });
  // Fail closed (not executive) once the check errors. Do not freeze every
  // /dashboard/* shell on a failed Hive Executive RPC — that used to leave
  // Admin Home on "Loading…" forever because `q.data === undefined` after error.
  // Still treat "no data yet" as loading so a queryClient.clear() cannot flash
  // isExecutive=false and bounce someone off /dashboard/hive-exec.
  const isLoading =
    authLoading ||
    (enabled && q.data === undefined && !q.isError && (q.isPending || q.isFetching));
  return { isExecutive: !!q.data?.isExecutive, isLoading };
}
