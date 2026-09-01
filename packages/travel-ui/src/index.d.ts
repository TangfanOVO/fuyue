import type { ReactElement, ReactNode } from "react";
export type TravelAction = "open" | "walk" | "look";
export interface TravelPlace {
  id: string;
  name: string;
  note?: string;
  state: "available" | "current" | "visited";
}
export interface TravelJournalEntry {
  id: string;
  placeId?: string;
  title: string;
  content: string;
  occurredAt: string;
  sourceLabel: string;
}
export interface TravelRoomProps {
  title?: string;
  subtitle?: string;
  places: TravelPlace[];
  journal: TravelJournalEntry[];
  busy?: TravelAction | null;
  error?: string;
  empty?: ReactNode;
  onAction: (action: TravelAction, placeId?: string) => void | Promise<void>;
}
export declare function TravelRoom(props: TravelRoomProps): ReactElement;
export interface JourneyTextNotebookProps {
  entries: TravelJournalEntry[];
  busy?: boolean;
  error?: string;
  onSave: (entry: { title: string; content: string }) => void | Promise<void>;
}
export declare function JourneyTextNotebook(
  props: JourneyTextNotebookProps,
): ReactElement;
