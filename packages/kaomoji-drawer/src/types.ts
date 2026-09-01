export type KaomojiCompatibility = "stable" | "limited" | "blocked";

export type KaomojiItem = {
  value: string;
  label?: string;
  categories: string[];
  favorite: boolean;
  useCount: number;
  lastUsedAt?: string;
  compatibility: KaomojiCompatibility;
  compatibilityNotes: string[];
  safeValue?: string;
};

export type KaomojiCandidate = {
  id: string | number;
  value: string;
  label?: string;
  suggestedCategories: string[];
  compatibility: KaomojiCompatibility;
  compatibilityNotes: string[];
  safeValue?: string;
};

export type KaomojiReviewDecision = "approved" | "rejected";
export type KaomojiAcceptedVersion = "original" | "compatible";

export type KaomojiCatalogEntry = {
  value: string;
  label?: string;
  categories: string[];
};

export type KaomojiCatalogManifest = {
  schemaVersion: 1;
  libraryVersion: string;
  generatedAt: string;
  itemCount: number;
  itemsUrl: string;
  valuesUrl?: string;
};

export type KaomojiCatalogSyncMode = "manual" | "automatic" | "off";

export type KaomojiCatalogSyncState = {
  mode: KaomojiCatalogSyncMode;
  lastCheckedAt?: string;
  lastSyncedAt?: string;
  libraryVersion?: string;
  lastAdded?: number;
};

export type KaomojiCatalogOptions = {
  manifestUrl?: string;
  stateStorageKey?: string;
  checkIntervalMs?: number;
  fetcher?: typeof fetch;
};

export type KaomojiCatalogMergeResult = {
  added: number;
  skipped: number;
};

export interface KaomojiReviewRepository {
  listCandidates(): Promise<KaomojiCandidate[]>;
  reviewCandidate(
    id: KaomojiCandidate["id"],
    decision: KaomojiReviewDecision,
    options?: { acceptedVersion?: KaomojiAcceptedVersion; categories?: string[] },
  ): Promise<void>;
}

export interface KaomojiRepository {
  list(): Promise<KaomojiItem[]>;
  upsert(value: string, categories: string[], label?: string): Promise<KaomojiItem>;
  remove(value: string): Promise<boolean>;
  markUsed(value: string): Promise<void>;
  setFavorite(value: string, favorite: boolean): Promise<void>;
  getCategoryOrder?(): Promise<string[]>;
  setCategoryOrder?(categories: string[]): Promise<void>;
  mergeCatalog?(items: KaomojiCatalogEntry[]): Promise<KaomojiCatalogMergeResult>;
}
