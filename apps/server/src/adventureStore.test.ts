import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SqliteAdventureStore } from "./adventureStore.js";

describe("SQLite adventure persistence", () => {
  it("keeps an unstarted preview in persistent session history when replaced", () => {
    const directory = mkdtempSync(join(tmpdir(), "chatquest-sqlite-"));
    const store = new SqliteAdventureStore(join(directory, "chatquest.sqlite"));
    try {
      const first = store.getCurrent();
      store.create();
      expect(store.getHistory().some((item) => item.id === first.id && item.status === "ended")).toBe(true);
    } finally {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("restores the current session, completed history, and vote totals after reopening", () => {
    const directory = mkdtempSync(join(tmpdir(), "chatquest-sqlite-"));
    const databasePath = join(directory, "chatquest.sqlite");
    let store: SqliteAdventureStore | undefined;
    let reopened: SqliteAdventureStore | undefined;
    try {
      store = new SqliteAdventureStore(databasePath);
      const first = store.getCurrent();
      const active = store.transition("start");
      store.recordVote(active.choices[0].id);
      const next = store.create();
      store.close();
      store = undefined;

      reopened = new SqliteAdventureStore(databasePath);
      expect(reopened.getCurrent().id).toBe(next.id);
      expect(reopened.getCurrent().status).toBe("idle");
      const completed = reopened.getHistory().find((item) => item.id === first.id);
      expect(completed?.status).toBe("ended");
      expect(completed?.choices[0].votes).toBe(1);
    } finally {
      reopened?.close();
      store?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
