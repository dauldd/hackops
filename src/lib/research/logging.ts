import 'server-only';
import { appendResearchLog } from '../db.ts';
export type ResearchLogger = (stage: string, message: string, details?: unknown, level?: 'info' | 'warning' | 'error') => void;
export function redactLogDetails(value: unknown): unknown {
 if (typeof value === 'string') return value.replace(/sk-or-v1-[a-zA-Z0-9_-]+/g, '[REDACTED]').replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]');
 if (Array.isArray(value)) return value.map(redactLogDetails);
 if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /^(authorization|api[_-]?key|access[_-]?token|secret|reasoning|reasoning_details|analysis)$/i.test(key) ? '[REDACTED]' : redactLogDetails(item)]));
 return value;
}
export function createResearchLogger(runId: string): ResearchLogger {
 return (stage, message, details = null, level = 'info') => {
 const safe = redactLogDetails(details);
 appendResearchLog(runId, stage, level, String(redactLogDetails(message)), safe);
 const output = `[research:${runId}] ${stage}: ${String(redactLogDetails(message))}`;
 const write = level === 'error' ? console.error : level === 'warning' ? console.warn : console.info;
 write(output, safe === null ? '' : JSON.stringify(safe));
 };
}
