export const listClientTargetBehaviors = async () => {
  return (window.__e2e.targetBehaviors ?? []).map((behavior_name, i) => ({
    id: `tb-${i}`,
    behavior_name,
  }));
};
