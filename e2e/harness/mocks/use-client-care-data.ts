import { TOMMY_GOALS } from "../fixtures";

export function useClientCareData() {
  return {
    data: {
      visibility: {
        goalsForStaff: TOMMY_GOALS.map((goal, i) => ({
          id: `goal-${i}`,
          goal,
          job_codes: ["SEI"],
          is_complete: true,
        })),
      },
    },
    isLoading: false,
  };
}
