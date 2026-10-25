import { listResearch, listResearchRuns } from '@/lib/db';
import ResearchWorkspace from './workspace';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export default async function ResearchPage() {
 return <main className="intelligence-app"><nav className="workspace-nav" aria-label="Main navigation"><a className="brand" href="/research"><span className="brand-symbol" aria-hidden="true">v.</span>velho<span className="brand-subtitle">INTELLIGENCE</span></a><div className="nav-links"><a href="/research" aria-current="page"><span aria-hidden="true">◈</span> Research workspace</a></div><div className="nav-caption"><span className="live-dot"/>Applied intelligence</div></nav><div className="workspace-content"><header className="workspace-header"><div><span className="breadcrumb">Workspace</span><span className="breadcrumb-divider">/</span><strong>Company research</strong></div><span className="workspace-badge">Evidence-led decisions</span></header>
 <section className="intro"><p className="eyebrow"><span className="live-dot"/> YOUR NEXT OPPORTUNITY STARTS HERE</p><h1>Great opportunities.<br /><span>Grounded in evidence.</span></h1><p>Turn company signals into your next conversation. Research the business,<br className="desktop-break"/> uncover automation opportunities, and build a compelling case.</p><div className="workflow-steps" aria-label="Research workflow"><span><b>01</b> Research the company</span><i aria-hidden="true">→</i><span><b>02</b> Explore the value</span><i aria-hidden="true">→</i><span><b>03</b> Create your pitch</span></div></section>
 <ResearchWorkspace initialResults={(await listResearch())} initialRuns={(await listResearchRuns())} />
 <footer><span>velho · Applied intelligence</span><span>From signals to possibilities.</span></footer></div></main>;
}
