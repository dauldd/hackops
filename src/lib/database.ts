import 'server-only';
import {mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

type Param = string | number | bigint | null | Uint8Array;
type Row = Record<string, unknown>;
type Result = {results: Row[]; meta: {changes: number; last_row_id: number}};
const schema = `CREATE TABLE IF NOT EXISTS company_research (
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
        sentence_citations TEXT, coverage TEXT, approved_at TEXT, approved_script_digest TEXT, declined_at TEXT,
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
`;
let local: DatabaseSync | undefined;
let ready: Promise<void> | undefined;
export function usesD1() {
 const values = [process.env.CLOUDFLARE_ACCOUNT_ID, process.env.CLOUDFLARE_D1_DATABASE_ID, process.env.CLOUDFLARE_API_TOKEN];
 if (values.some(Boolean) && !values.every(Boolean)) throw Error('Set all three CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID and CLOUDFLARE_API_TOKEN variables.');
 if (process.env.VERCEL && !values.every(Boolean)) throw Error('Vercel requires Cloudflare D1 credentials; local SQLite is development-only.');
 return values.every(Boolean);
}
async function remote(queries: {sql: string; params?: Param[]}[]): Promise<Result[]> {
 const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID!)}/d1/database/${encodeURIComponent(process.env.CLOUDFLARE_D1_DATABASE_ID!)}/query`, {
 method: 'POST', headers: {Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json'},
 body: JSON.stringify({batch: queries}), cache: 'no-store', signal: AbortSignal.timeout(30000),
 });
 const data = await response.json() as {success?: boolean; result?: (Result & {success?: boolean; error?: string})[]; errors?: {message: string}[]};
 if (!response.ok || !data.success || !data.result || data.result.some(r => r.success === false)) {
 throw Error(`D1 query failed (${response.status}): ${data.errors?.map(e => e.message).join('; ') || data.result?.find(r => r.success === false)?.error || 'Unknown database error'}`);
 }
 return data.result;
}
async function initialize() {
 if (!ready) ready = (async () => {
 if (usesD1()) {
 await remote(schema.split(';').map(sql => sql.trim()).filter(Boolean).map(sql => ({sql})));
 } else {
 const path = resolve(process.env.DATABASE_PATH || './data/app.sqlite');
 mkdirSync(dirname(path), {recursive: true});
 local = new DatabaseSync(path, {timeout: 5000});
 local.exec('PRAGMA journal_mode = WAL;'); local.exec(schema);
 const columns = new Set(local.prepare('PRAGMA table_info(video_pitches)').all().map(row => row.name));
 for (const column of ['sentence_citations', 'coverage', 'approved_at', 'approved_script_digest', 'declined_at']) if (!columns.has(column)) local.exec(`ALTER TABLE video_pitches ADD COLUMN ${column} TEXT`);
 }
 })().catch(error => {ready = undefined; throw error;});
 await ready;
}
export function database() {
 return {
 prepare(sql: string) {
 const execute = async (params: Param[]) => {await initialize(); return (await remote([{sql, params}]))[0];};
 return {
 async all(...params: Param[]): Promise<Row[]> {await initialize(); return local ? local.prepare(sql).all(...params) : (await execute(params)).results;},
 async get(...params: Param[]): Promise<Row | undefined> {await initialize(); return local ? local.prepare(sql).get(...params) : (await execute(params)).results[0];},
 async run(...params: Param[]) {await initialize(); if (local) return local.prepare(sql).run(...params); const result = await execute(params); return {changes: result.meta.changes, lastInsertRowid: result.meta.last_row_id};},
 };
 },
 async exec(sql: string) {await initialize(); if (local) local.exec(sql); else await remote([{sql}]);},
 };
}
