import { listResearch, listResearchRuns } from '@/lib/db';
import ResearchWorkspace from './workspace';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export default function ResearchPage() {
 return <main><header><a className="brand" href="/research">▧ Velho Intelligence</a><a href="/notebook">Notebook</a></header>
 <section className="intro"><p className="eyebrow">AGENT 01 · COMPANY RESEARCH</p><h1>Find the evidence.<br />See the opportunity.</h1><p>Investigate a company’s business, hiring and growth. Discover credible ways Velho could help.</p></section>
 <ResearchWorkspace initialResults={listResearch()} initialRuns={listResearchRuns()} />
 <footer>Velho Applied Intelligence · Research saved with SQLite</footer></main>;
}
