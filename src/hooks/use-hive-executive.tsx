import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkHiveExecutive } from "@/lib/hive-exec.functions";
import { useAuth } from "./use-auth";

export function useIsHiveExecutive() {
  const { session, loading: authLoading } = useAuth();
  const check = useServerFn(checkHiveExecutive);
  const q = useQuery({
    queryKey: ["hive-executive", session?.user?.id ?? "none"],
    enabled: !!session?.user?.id,
    queryFn: () => check(),
    staleTime: 60_000,
  });
  // Treat "no resolved data yet" as loading. q.isLoading flips to false in
  // the brief window after queryClient.clear() but before the refetch has
  // started, which would otherwise let downstream redirects fire with a
  // stale `isExecutive=false` and bounce the user off /dashboard/hive-exec.
  const isLoading =
    authLoading ||
    !session?.user?.id ||
    q.isLoading ||
    q.isFetching ||
    q.data === undefined;
  return { isExecutive: !!q.data?.isExecutive, isLoading };
}
