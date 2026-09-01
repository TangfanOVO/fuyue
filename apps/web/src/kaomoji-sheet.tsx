import { useMemo } from "react";
import { KaomojiDrawer, createLocalKaomojiRepository } from "@fuyue/kaomoji-drawer";

export default function KaomojiSheet({ onInsert }: { onInsert: (value: string) => void }) {
  const repository = useMemo(() => createLocalKaomojiRepository("fuyue.public.kaomoji.v1"), []);
  return <KaomojiDrawer repository={repository} onInsert={onInsert} title="放进这句话" />;
}
