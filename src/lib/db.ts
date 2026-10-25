import "server-only";

import { readStoredResearch, type CompanyResearch } from "./research/schema.ts";

import type { VisualizationReport } from "./visualization/schema.ts";

export type Note = { id: number; body: string; created_at: string };

export { database } from './database.ts';
import { database } from './database.ts';

export async function listNotes(): Promise<Note[]> {
  return (await database().prepare("SELECT id, body, created_at FROM notes ORDER BY id DESC").all()) as Note[];
}

export async function insertNote(body: string) {
  (await database().prepare("INSERT INTO notes (body) VALUES (?)").run(body));
}

export async function deleteNote(id: number) {
  (await database().prepare("DELETE FROM notes WHERE id = ?").run(id));
}

export type SavedResearch = { id: number; requestedName: string; report: CompanyResearch; model: string; createdAt: string; runId?: string };
export async function insertResearch(requestedName: string, report: CompanyResearch, model: string, usage: unknown, annotations: unknown): Promise<SavedResearch> {
  const result = (await database().prepare("INSERT INTO company_research (requested_name, company_name, report, model, usage, annotations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(requestedName, report.companyName, JSON.stringify(report), model, JSON.stringify(usage), JSON.stringify(annotations), report.researchedAt));
  return { id: Number(result.lastInsertRowid), requestedName, report, model, createdAt: report.researchedAt };
}
export async function listResearch() {
 const rows=(await database().prepare("SELECT id, requested_name AS requestedName, company_name AS companyName, created_at AS createdAt, report FROM company_research ORDER BY id DESC LIMIT 100").all()) as {id:number;requestedName:string;companyName:string;createdAt:string;report:string}[];
 return rows.map(row=>{const {report:json,...summary}=row;const report=readStoredResearch(JSON.parse(json));return {...summary,overallScore:report.overallScore,identityStatus:report.identity.status,commercialScore:report.qualification.commercialAttractiveness.score};});
}
export async function getResearch(id: number): Promise<SavedResearch | null> {
 const row = (await database().prepare("SELECT id, requested_name AS requestedName, report, model, created_at AS createdAt, (SELECT id FROM research_runs WHERE report_id = company_research.id ORDER BY created_at DESC LIMIT 1) AS runId FROM company_research WHERE id = ?").get(id)) as (Omit<SavedResearch, 'report'> & { report: string }) | undefined;
 return row ? { ...row, report: readStoredResearch(JSON.parse(row.report)) } : null;
}

export type ResearchLog = { id: number; stage: string; level: 'info' | 'warning' | 'error'; message: string; details: unknown; createdAt: string };
export async function createResearchRun(id: string, companyName: string) {
 const now = new Date().toISOString();
 (await database().prepare("INSERT INTO research_runs (id, company_name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(id, companyName, now, now));
}
export async function appendResearchLog(runId: string, stage: string, level: ResearchLog['level'], message: string, details: unknown = null) {
 const now = new Date().toISOString();
 (await database().prepare("INSERT INTO research_logs (run_id, stage, level, message, details, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(runId, stage, level, message, JSON.stringify(details), now));
 (await database().prepare("UPDATE research_runs SET updated_at = ? WHERE id = ?").run(now, runId));
}
export async function finishResearchRun(runId: string, reportId: number | null, error: string | null = null) {
 (await database().prepare("UPDATE research_runs SET status = ?, report_id = ?, error = ?, updated_at = ? WHERE id = ?").run(error ? 'failed' : 'completed', reportId, error, new Date().toISOString(), runId));
}
export async function getResearchRun(runId: string, after = 0) {
 const run = (await database().prepare("SELECT id, company_name AS companyName, status, report_id AS reportId, error, created_at AS createdAt, updated_at AS updatedAt FROM research_runs WHERE id = ?").get(runId)) as { id: string; companyName: string; status: string; reportId: number | null; error: string | null; createdAt: string; updatedAt: string } | undefined;
 if (!run) return null;
 const rows = (await database().prepare("SELECT id, stage, level, message, details, created_at AS createdAt FROM research_logs WHERE run_id = ? AND id > ? ORDER BY id LIMIT 500").all(runId, after)) as (Omit<ResearchLog, 'details'> & { details: string })[];
 return { ...run, logs: rows.map(row => ({ ...row, details: JSON.parse(row.details) })) };
}
export type ResearchRunSummary = { id: string; companyName: string; status: string; reportId: number | null; error: string | null; createdAt: string; updatedAt: string };
export async function listResearchRuns(): Promise<ResearchRunSummary[]> {
 return (await database().prepare("SELECT id, company_name AS companyName, status, report_id AS reportId, error, created_at AS createdAt, updated_at AS updatedAt FROM research_runs ORDER BY created_at DESC LIMIT 100").all()).map(row => ({ ...row })) as ResearchRunSummary[];
}

export type SavedVisualization = { id: number; researchId: number; runId: string; report: VisualizationReport; createdAt: string };
export async function insertVisualization(researchId: number, report: VisualizationReport, runId: string): Promise<SavedVisualization> {
 const result=(await database().prepare("INSERT INTO company_visualizations (research_id, run_id, report, created_at) VALUES (?, ?, ?, ?)").run(researchId,runId,JSON.stringify(report),report.createdAt));
 return {id:Number(result.lastInsertRowid),researchId,runId,report,createdAt:report.createdAt};
}
export async function listVisualizations(researchId:number){return (await database().prepare("SELECT id, research_id AS researchId, run_id AS runId, created_at AS createdAt, json_extract(report, '$.status') AS status FROM company_visualizations WHERE research_id = ? ORDER BY id DESC LIMIT 30").all(researchId)).map(row=>({...row})) as {id:number;researchId:number;runId:string;createdAt:string;status:string}[];}
export async function getVisualization(id:number):Promise<SavedVisualization|null>{
 const row=(await database().prepare("SELECT id, research_id AS researchId, run_id AS runId, created_at AS createdAt, report FROM company_visualizations WHERE id = ?").get(id)) as (Omit<SavedVisualization,'report'>&{report:string})|undefined;
 return row?{...row,report:JSON.parse(row.report) as VisualizationReport}:null;
}
