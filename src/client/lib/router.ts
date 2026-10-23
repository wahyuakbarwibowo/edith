import { useSyncExternalStore, type MouseEvent } from "react";

const subscribe = (cb: () => void) => {
  addEventListener("popstate", cb);
  return () => removeEventListener("popstate", cb);
};

export const usePath = () => useSyncExternalStore(subscribe, () => location.pathname);

export function navigate(path: string) {
  history.pushState(null, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
}

/** onClick for <a href> that keeps navigation client-side. */
export function linkTo(e: MouseEvent<HTMLAnchorElement>) {
  if (e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  navigate(e.currentTarget.pathname);
}
