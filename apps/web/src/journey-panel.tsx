import { ArrowLeft } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { JourneyTextNotebook, type TravelJournalEntry } from "@fuyue/travel-ui";
import type { LocalDataRepository, RoomEntry } from "@fuyue/core";

export function JourneyPanel({
  repository,
  entries,
  onBack,
  onChange,
}: {
  repository: LocalDataRepository;
  entries: RoomEntry[];
  onBack: () => void;
  onChange: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const journal = useMemo<TravelJournalEntry[]>(
    () =>
      entries
        .filter(
          (entry) =>
            entry.subtype === "journey_text" && entry.status !== "archived",
        )
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .map((entry) => ({
          id: entry.id,
          title: entry.title,
          content: entry.content,
          occurredAt: entry.occurredAt,
          sourceLabel: entry.sourceLabel,
        })),
    [entries],
  );
  async function save(entry: { title: string; content: string }) {
    setBusy(true);
    setError("");
    try {
      await repository.createRoomEntry({
        room: "diary",
        author: "user",
        title: entry.title,
        content: entry.content,
        subtype: "journey_text",
        sourceLabel: "Journey Cards 文本适配 · LocalData",
      });
      await onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "旅行手记没有保存");
      throw cause;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel-content journey-panel">
      <header className="panel-header">
        <button
          data-panel-back
          className="icon-button quiet"
          onClick={onBack}
          aria-label="返回"
        >
          <ArrowLeft />
        </button>
        <div>
          <h1 id="panel-title">旅行手记</h1>
          <p>一句话也算旅程；纯文字、可导出、刷新后仍在。</p>
        </div>
      </header>
      <JourneyTextNotebook
        entries={journal}
        busy={busy}
        error={error}
        onSave={save}
      />
    </div>
  );
}
