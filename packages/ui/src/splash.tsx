import { Orbit } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export function FuyueSplash({ storageKey = "fuyue.public.splash.seen.v1", duration = 3420 }: { storageKey?: string; duration?: number }) {
  const [visible, setVisible] = useState(false);
  const dismiss = useCallback(() => { try { window.sessionStorage.setItem(storageKey, "1"); } catch { /* denied storage must not block entry */ } setVisible(false); }, [storageKey]);
  useEffect(() => { try { if (window.sessionStorage.getItem(storageKey) === "1") return; } catch { /* show without persistence */ } const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches; const frame = window.requestAnimationFrame(() => setVisible(true)); const timer = window.setTimeout(dismiss, reduce ? Math.min(duration, 720) : duration); return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); }; }, [dismiss, duration, storageKey]);
  if (!visible) return null;
  return <button type="button" className="fuyue-splash" onClick={dismiss} aria-label="进入赴约"><span className="splash-orbit"><Orbit size={42} strokeWidth={1.2} /><i /></span><strong>赴约</strong><small>在这里，也在赴约。</small><span className="splash-progress" aria-hidden="true"><i /></span><em>轻触进入</em></button>;
}
