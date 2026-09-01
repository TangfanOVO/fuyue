import { useEffect, useState } from "react";

export const fuyueMotion = {
  pressMs: 140,
  switchMs: 260,
  panelMs: 300,
  easeOut: "cubic-bezier(.22, 1, .36, 1)",
  easeStrong: "cubic-bezier(.65, 0, .35, 1)",
} as const;

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}
