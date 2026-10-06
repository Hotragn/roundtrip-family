/**
 * Diary shapes shared by the phone and the server. An entry the phone holds may carry its
 * recording as a Blob (made on the phone) or as a saved clip's URL (the synthetic demo entries,
 * voiced by the open speech models).
 */

export interface DiarySeed {
  id: string;
  parentId: string;
  kind: "voice" | "text" | "photo";
  createdAt: string;
  text: string;
  feelingWords: string[];
  outingId?: string;
  shared: boolean;
  inMemoryBook: boolean;
  audioUrl?: string;
}

/** A shared entry as the dashboard shows it. */
export interface SharedDiaryEntry {
  entryId: string;
  parentId: string;
  kind: "voice" | "text" | "photo";
  createdAt: string;
  text: string;
  feelingWords: string[];
  outingId?: string;
  outingTitle?: string;
  inMemoryBook: boolean;
  audioUrl?: string;
  /** "synthetic" for the demo's fictional entries; "visitor" for one written in this session. */
  provenance: "synthetic" | "visitor";
}
