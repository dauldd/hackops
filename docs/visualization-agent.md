# Visualization & Business Case Agent

Opening a saved research report loads its latest ready visualization, preferring it over newer incomplete attempts. If none is ready, the dashboard prepares one from the report’s proposals. **Refresh dashboard** rebuilds it with the selected inputs. Existing ready visualizations can be reopened without running the agent again. The report and activity logs can each be collapsed in one click; detailed evidence and score explanations are collapsed for demos.

The repository does not yet contain a Proposal Agent. The visualization API accepts its future structured output directly. The UI and API share research opportunity drafts or the same conditional discovery proposals shown on the report when no implementation proposal was established. Discovery proposals require retained evidence and confirmed company identity; they keep current workflows unknown and scenario benefits illustrative. A user-entered proposal can also be linked to retained evidence. If neither evidence nor a proposal is available, the agent requests one. Video creation prepares a missing business case automatically and reuses any existing ready artifact; it still waits for script confirmation before submitting a video render.

## API and independent use

- `POST /api/research/:researchId/visualizations` accepts optional `{ proposals, inputs, runId }` and returns a saved artifact. No web scraper or research loop is added.
- `GET /api/research/:researchId/visualizations` lists saved artifacts.
- `GET /api/visualizations/:id` returns the full presentation-ready JSON, including sources, proposals, inputs, scenarios, metrics, chart specifications, assumptions and calculation methods.
- `createVisualizationReport(research, proposals, researchId, overrides)` is independently callable with upstream structured data.
- `visualizeCompany(...)` adds existing SQLite persistence and activity logging.

A proposal has `id`, `title`, `process`, nullable `problem`, `proposedSolution`, supporting evidence IDs in `evidence`, `currentWorkflow`, `proposedWorkflow`, `currentWorkflowStatus` (`observed`, `hypothesized`, `unknown`), and optional per-proposal `inputs`. Supplied chart inputs override a proposal's inputs. A missing current workflow is explicitly unknown; it is not turned into a verified manual process.

Each quantitative input has `{ value, unit, classification, origin, sourceReferences, explanation }`. Classification is verified/assumption/unknown. Origin is research/company/scenario. Research-verified values need retained verified evidence. Company-provided figures require an explicit explanation. All ordinary form entries are assumptions unless the user identifies entered current-state figures as company-provided. Null financial inputs remain unknown; implementation pricing, recurring fees and labor costs are never fabricated. Monetary units are EUR; there is no implicit FX conversion.

Input keys and units are defined in `src/lib/visualization/calculations.ts`. Rates are fractions in the API and percentages in the form. Blank operational fields use clearly labelled illustrative defaults (500 tasks/month, 12 current minutes, 3 automated minutes, with coverage/adoption/review assumptions). These are not company facts. Cash realization defaults to zero, so released hours do not automatically become cash savings.

## Reasoning versus arithmetic

The existing OpenRouter integration selects useful views, interprets the upstream proposal, extracts only quote-supported operational numbers, and supplies qualitative headlines/selling points. It cannot provide trusted chart datasets or mathematical results. TypeScript performs every workload, capacity, scenario, cost and ROI calculation and validates discriminated chart schemas before saving. No generation occurs on GET or during page loading.

The configurable reasoning model is `OPENROUTER_VISUALIZATION_MODEL`, falling back to the research model. Credentials remain in the existing server environment. A provider failure is shown in the UI/logs; unsupported AI arithmetic is never silently saved as a business case.

## Financial definitions

- Eligible fraction = automation coverage × adoption.
- Current hours/month = volume × current minutes / 60.
- Proposed hours/month = volume × [(1 − eligible) × current minutes + eligible × (automated minutes + review rate × review minutes)] / 60.
- Annual hours released = (current hours − proposed hours) × 12.
- Annual labor capacity value = released hours × loaded hourly cost. This is not a payroll saving.
- Annual cash benefit = capacity value × explicitly assumed/verified cash realization share.
- Annual net cash benefit = cash benefit − monthly recurring cost × 12.
- First-year net benefit = annual net cash benefit − implementation investment.
- First-year ROI = first-year net benefit / positive implementation investment × 100.
- Simple payback = investment / positive monthly net cash benefit. Undefined/nonpositive cases return null, never infinity or a misleading zero.

The 36-month cumulative chart shows both benefit and total costs. The three-year table uses a fixed annual volume and one initial investment. A separate scaling chart varies workload with explicit growth assumptions; it does not assume revenue or sales conversion follows volume. No discounting, tax, staffing reductions or unspecified ramp-up are claimed.

Conservative/base/optimistic scenarios vary adoption, coverage and proposed handling time while retaining current-state data. Sensitivity charts vary coverage and investment explicitly. Charts display assumptions, source links, input references, units and formulas. Unknown pricing suppresses financial views, while meaningful workload and workflow views remain available. Business cases are independent and must not be summed without checking overlap.

## Preview and export

The UI previews bars, lines, areas, waterfalls, pie/donut distributions, Sankey links, flowcharts, sensitivity heatmaps, KPIs and tables. SVG charts can be downloaded; complete datasets and presentation headlines are available as JSON for the future PPTX/Gamma agent. Hypothetical current workflows, proposed workflows and relative Sankey weights have explicit labels. Each chart includes a clear insight and conditional connection to Velho's solution.

Focused numerical/scenario specifications were added in `tests/visualization.test.ts` and scoring expectations updated for the more flexible outreach rubric. Tests, typecheck, build, browser sessions and live API checks were deliberately not run during this change, per the user's request.
