import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export interface AdventureChoice {
  id: string;
  label: string;
  votes: number;
}

export type AdventureStatus = "idle" | "active" | "paused" | "ended";
export type AdventureAction = "start" | "pause" | "resume" | "end";

export interface AdventureState {
  id: string;
  status: AdventureStatus;
  title: string;
  chapter: string;
  scene: string;
  choices: AdventureChoice[];
  updatedAt: string;
}

export interface AdventureStore {
  getCurrent(): AdventureState;
  getHistory(): AdventureState[];
  create(): AdventureState;
  transition(action: string): AdventureState;
  recordVote(choiceId: string): AdventureState;
  close(): void;
}

export class AdventureConflictError extends Error {}
export class AdventureInputError extends Error {}

const startingStory = {
  title: "The Lanterns of Elderglen",
  chapter: "Chapter 1 · The Crossroads",
  scene: "At the edge of a moonlit forest, three lanterns flicker beside a fork in the road. A silver bell rings somewhere among the trees.",
  choices: [
    { id: "forest", label: "Follow the silver bell into the forest" },
    { id: "road", label: "Take the lantern-lit road to the old bridge" },
    { id: "hill", label: "Climb the hill to search for the bell" }
  ]
};

type SessionRow = {
  id: string;
  status: AdventureStatus;
  title: string;
  chapter: string;
  scene: string;
  updated_at: string;
};

export class SqliteAdventureStore implements AdventureStore {
  private readonly database: Database.Database;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new Database(databasePath);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("foreign_keys = ON");
    const schemaVersion = this.database.pragma("user_version", { simple: true }) as number;
    if (schemaVersion > 1) throw new Error(`SQLite schema version ${schemaVersion} is newer than this server supports.`);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS adventure_sessions (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('idle', 'active', 'paused', 'ended')),
        title TEXT NOT NULL,
        chapter TEXT NOT NULL,
        scene TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS adventure_choices (
        id TEXT PRIMARY KEY,
        adventure_id TEXT NOT NULL REFERENCES adventure_sessions(id) ON DELETE CASCADE,
        choice_order INTEGER NOT NULL,
        label TEXT NOT NULL,
        UNIQUE (adventure_id, choice_order)
      );
      CREATE TABLE IF NOT EXISTS adventure_votes (
        id TEXT PRIMARY KEY,
        adventure_id TEXT NOT NULL REFERENCES adventure_sessions(id) ON DELETE CASCADE,
        choice_id TEXT NOT NULL REFERENCES adventure_choices(id) ON DELETE CASCADE,
        voter_id TEXT,
        event_message_id TEXT,
        source TEXT NOT NULL DEFAULT 'local' CHECK (source IN ('local', 'twitch')),
        created_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS adventure_votes_event_message_id
        ON adventure_votes(event_message_id) WHERE event_message_id IS NOT NULL;
      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    this.database.pragma("user_version = 1");

    const current = this.database.prepare("SELECT value FROM app_state WHERE key = 'current_adventure_id'").get() as { value: string } | undefined;
    if (!current) this.create();
  }

  getCurrent(): AdventureState {
    const pointer = this.database.prepare("SELECT value FROM app_state WHERE key = 'current_adventure_id'").get() as { value: string } | undefined;
    if (!pointer) throw new Error("No current adventure is stored.");
    const state = this.read(pointer.value);
    if (!state) throw new Error("The current adventure record is missing from SQLite.");
    return state;
  }

  getHistory(): AdventureState[] {
    const rows = this.database.prepare("SELECT id FROM adventure_sessions WHERE status = 'ended' ORDER BY created_at DESC").all() as { id: string }[];
    return rows.map(({ id }) => this.read(id)).filter((item): item is AdventureState => item !== null);
  }

  create(): AdventureState {
    const now = new Date().toISOString();
    const id = randomUUID();
    const insertSession = this.database.prepare(`
      INSERT INTO adventure_sessions (id, status, title, chapter, scene, created_at, updated_at)
      VALUES (?, 'idle', ?, ?, ?, ?, ?)
    `);
    const insertChoice = this.database.prepare("INSERT INTO adventure_choices (id, adventure_id, choice_order, label) VALUES (?, ?, ?, ?)");
    const setCurrent = this.database.prepare("INSERT INTO app_state (key, value) VALUES ('current_adventure_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    this.database.transaction(() => {
      this.database.prepare("UPDATE adventure_sessions SET status = 'ended', updated_at = ? WHERE id = (SELECT value FROM app_state WHERE key = 'current_adventure_id') AND status <> 'ended'").run(now);
      insertSession.run(id, startingStory.title, startingStory.chapter, startingStory.scene, now, now);
      startingStory.choices.forEach((choice, index) => insertChoice.run(choice.id + ":" + id, id, index, choice.label));
      setCurrent.run(id);
    })();
    return this.getCurrent();
  }

  transition(action: string): AdventureState {
    const current = this.getCurrent();
    const nextStatus: Partial<Record<AdventureAction, AdventureStatus>> = {
      start: current.status === "idle" || current.status === "paused" ? "active" : undefined,
      pause: current.status === "active" ? "paused" : undefined,
      resume: current.status === "paused" ? "active" : undefined,
      end: current.status === "active" || current.status === "paused" ? "ended" : undefined
    };
    const next = nextStatus[action as AdventureAction];
    if (!next) throw new AdventureConflictError(`Cannot ${action} an adventure while it is ${current.status}.`);
    this.database.prepare("UPDATE adventure_sessions SET status = ?, updated_at = ? WHERE id = ?").run(next, new Date().toISOString(), current.id);
    return this.getCurrent();
  }

  recordVote(choiceId: string): AdventureState {
    const current = this.getCurrent();
    if (current.status !== "active") throw new AdventureConflictError("Voting is available only while an adventure is active.");
    const choice = this.database.prepare("SELECT id FROM adventure_choices WHERE id = ? AND adventure_id = ?").get(choiceId, current.id);
    if (!choice) throw new AdventureInputError("Choose one of the available story paths.");
    const now = new Date().toISOString();
    this.database.transaction(() => {
      this.database.prepare("INSERT INTO adventure_votes (id, adventure_id, choice_id, created_at) VALUES (?, ?, ?, ?)").run(randomUUID(), current.id, choiceId, now);
      this.database.prepare("UPDATE adventure_sessions SET updated_at = ? WHERE id = ?").run(now, current.id);
    })();
    return this.getCurrent();
  }

  close(): void {
    this.database.close();
  }

  private read(id: string): AdventureState | null {
    const row = this.database.prepare("SELECT id, status, title, chapter, scene, updated_at FROM adventure_sessions WHERE id = ?").get(id) as SessionRow | undefined;
    if (!row) return null;
    const choices = this.database.prepare(`
      SELECT c.id, c.label, COUNT(v.id) AS votes
      FROM adventure_choices c
      LEFT JOIN adventure_votes v ON v.choice_id = c.id
      WHERE c.adventure_id = ?
      GROUP BY c.id, c.label, c.choice_order
      ORDER BY c.choice_order
    `).all(id) as { id: string; label: string; votes: number }[];
    return { id: row.id, status: row.status, title: row.title, chapter: row.chapter, scene: row.scene, choices, updatedAt: row.updated_at };
  }
}
