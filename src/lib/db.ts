import "server-only";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Note = { id: number; body: string; created_at: string };

const globalDb = globalThis as typeof globalThis & { sqlite?: DatabaseSync };

function database() {
  if (!globalDb.sqlite) {
    const path = resolve(process.env.DATABASE_PATH || "./data/app.sqlite");
    mkdirSync(dirname(path), { recursive: true });
    const db = new DatabaseSync(path, { timeout: 5000 });
    db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 1000),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `);
    globalDb.sqlite = db;
  }
  return globalDb.sqlite;
}

export function listNotes(): Note[] {
  return database().prepare("SELECT id, body, created_at FROM notes ORDER BY id DESC").all() as Note[];
}

export function insertNote(body: string) {
  database().prepare("INSERT INTO notes (body) VALUES (?)").run(body);
}

export function deleteNote(id: number) {
  database().prepare("DELETE FROM notes WHERE id = ?").run(id);
}
