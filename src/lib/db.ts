import "server-only";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { readStoredResearch, type CompanyResearch } from "./research/schema.ts";

import type { VisualizationReport } from "./visualization/schema.ts";

export type Note = { id: number; body: string; created_at: string };

const globalDb = globalThis as typeof globalThis & { sqlite?: DatabaseSync };

let schemaReady = false;
export function database() {
  if (!globalDb.sqlite) {
    const path = resolve(process.env.DATABASE_PATH || "./data/app.sqlite");
    mkdirSync(dirname(path), { recursive: true });
    const db = new DatabaseSync(path, { timeout: 5000 });
    globalDb.sqlite = db;
  }
  if (!schemaReady) {
    globalDb.sqlite.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS company_research (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requested_name TEXT NOT NULL,
        company_name TEXT NOT NULL,
        report TEXT NOT NULL CHECK(json_valid(report)),
        model TEXT NOT NULL,
        usage TEXT,
        annotations TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS research_runs (
        id TEXT PRIMARY KEY,
        company_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        report_id INTEGER REFERENCES company_research(id),
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS research_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL REFERENCES research_runs(id),
        stage TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        details TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS research_logs_run_id ON research_logs(run_id, id);
      CREATE TABLE IF NOT EXISTS company_visualizations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        research_id INTEGER NOT NULL REFERENCES company_research(id),
        run_id TEXT NOT NULL REFERENCES research_runs(id),
        report TEXT NOT NULL CHECK(json_valid(report)),
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS visualizations_research_id ON company_visualizations(research_id, id);
      CREATE TABLE IF NOT EXISTS video_pitches (
        id TEXT PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES company_research(id),
        visualization_id INTEGER NOT NULL REFERENCES company_visualizations(id),
        status TEXT NOT NULL, script_text TEXT, script_references TEXT, validation_result TEXT,
        sources TEXT NOT NULL, openrouter_job_id TEXT, polling_url TEXT, estimated_cost REAL,
        confirmed_cost REAL, video_file_path TEXT, error TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS video_company ON video_pitches(company_id, created_at);
      CREATE TABLE IF NOT EXISTS video_webhook_events (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 1000),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `);
    schemaReady = true;
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

export type SavedResearch = { id: number; requestedName: string; report: CompanyResearch; model: string; createdAt: string; runId?: string };
export function insertResearch(requestedName: string, report: CompanyResearch, model: string, usage: unknown, annotations: unknown): SavedResearch {
  const result = database().prepare("INSERT INTO company_research (requested_name, company_name, report, model, usage, annotations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(requestedName, report.companyName, JSON.stringify(report), model, JSON.stringify(usage), JSON.stringify(annotations), report.researchedAt);
  return { id: Number(result.lastInsertRowid), requestedName, report, model, createdAt: report.researchedAt };
}
export function listResearch() {
 const rows=database().prepare("SELECT id, requested_name AS requestedName, company_name AS companyName, created_at AS createdAt, report FROM company_research ORDER BY id DESC LIMIT 100").all() as {id:number;requestedName:string;companyName:string;createdAt:string;report:string}[];
 return rows.map(row=>{const {report:json,...summary}=row;const report=readStoredResearch(JSON.parse(json));return {...summary,overallScore:report.overallScore,identityStatus:report.identity.status,commercialScore:report.qualification.commercialAttractiveness.score};});
}
export function getResearch(id: number): SavedResearch | null {
 const row = database().prepare("SELECT id, requested_name AS requestedName, report, model, created_at AS createdAt, (SELECT id FROM research_runs WHERE report_id = company_research.id ORDER BY created_at DESC LIMIT 1) AS runId FROM company_research WHERE id = ?").get(id) as (Omit<SavedResearch, 'report'> & { report: string }) | undefined;
 return row ? { ...row, report: readStoredResearch(JSON.parse(row.report)) } : null;
}

export type ResearchLog = { id: number; stage: string; level: 'info' | 'warning' | 'error'; message: string; details: unknown; createdAt: string };
export function createResearchRun(id: string, companyName: string) {
 const now = new Date().toISOString();
 database().prepare("INSERT INTO research_runs (id, company_name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(id, companyName, now, now);
}
export function appendResearchLog(runId: string, stage: string, level: ResearchLog['level'], message: string, details: unknown = null) {
 const now = new Date().toISOString();
 database().prepare("INSERT INTO research_logs (run_id, stage, level, message, details, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(runId, stage, level, message, JSON.stringify(details), now);
 database().prepare("UPDATE research_runs SET updated_at = ? WHERE id = ?").run(now, runId);
}
export function finishResearchRun(runId: string, reportId: number | null, error: string | null = null) {
 database().prepare("UPDATE research_runs SET status = ?, report_id = ?, error = ?, updated_at = ? WHERE id = ?").run(error ? 'failed' : 'completed', reportId, error, new Date().toISOString(), runId);
}
export function getResearchRun(runId: string, after = 0) {
 const run = database().prepare("SELECT id, company_name AS companyName, status, report_id AS reportId, error, created_at AS createdAt, updated_at AS updatedAt FROM research_runs WHERE id = ?").get(runId) as { id: string; companyName: string; status: string; reportId: number | null; error: string | null; createdAt: string; updatedAt: string } | undefined;
 if (!run) return null;
 const rows = database().prepare("SELECT id, stage, level, message, details, created_at AS createdAt FROM research_logs WHERE run_id = ? AND id > ? ORDER BY id LIMIT 500").all(runId, after) as (Omit<ResearchLog, 'details'> & { details: string })[];
 return { ...run, logs: rows.map(row => ({ ...row, details: JSON.parse(row.details) })) };
}
export type ResearchRunSummary = { id: string; companyName: string; status: string; reportId: number | null; error: string | null; createdAt: string; updatedAt: string };
export function listResearchRuns(): ResearchRunSummary[] {
 return database().prepare("SELECT id, company_name AS companyName, status, report_id AS reportId, error, created_at AS createdAt, updated_at AS updatedAt FROM research_runs ORDER BY created_at DESC LIMIT 100").all().map(row => ({ ...row })) as ResearchRunSummary[];
}

export type SavedVisualization = { id: number; researchId: number; runId: string; report: VisualizationReport; createdAt: string };
export function insertVisualization(researchId: number, report: VisualizationReport, runId: string): SavedVisualization {
 const result=database().prepare("INSERT INTO company_visualizations (research_id, run_id, report, created_at) VALUES (?, ?, ?, ?)").run(researchId,runId,JSON.stringify(report),report.createdAt);
 return {id:Number(result.lastInsertRowid),researchId,runId,report,createdAt:report.createdAt};
}
export function listVisualizations(researchId:number){return database().prepare("SELECT id, research_id AS researchId, run_id AS runId, created_at AS createdAt, json_extract(report, '$.status') AS status FROM company_visualizations WHERE research_id = ? ORDER BY id DESC LIMIT 30").all(researchId).map(row=>({...row})) as {id:number;researchId:number;runId:string;createdAt:string;status:string}[];}
export function getVisualization(id:number):SavedVisualization|null{
 const row=database().prepare("SELECT id, research_id AS researchId, run_id AS runId, created_at AS createdAt, report FROM company_visualizations WHERE id = ?").get(id) as (Omit<SavedVisualization,'report'>&{report:string})|undefined;
 return row?{...row,report:JSON.parse(row.report) as VisualizationReport}:null;
}
