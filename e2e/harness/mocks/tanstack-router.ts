import type { NavCall } from "../e2e-bridge";

let impl: (args: NavCall) => void = () => {};

export function setNavigateImpl(fn: (args: NavCall) => void) {
  impl = fn;
}

export function useNavigate() {
  return (args: NavCall) => {
    window.__e2e.navigations.push(args);
    impl(args);
  };
}
