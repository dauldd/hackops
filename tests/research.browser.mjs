// Optional real-browser regression test. Install Playwright separately or set PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.RESEARCH_TEST_URL || 'http://localhost:3100';
const liveCompany = process.env.RESEARCH_TEST_COMPANY;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
 await page.goto(base);
 const button = page.getByRole('button', { name: 'Research company' });
 await button.waitFor();
 assert.equal(await button.isEnabled(), true);
 if (!liveCompany) {
 await page.route('**/api/research/runs/*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'failed', logs: [{ id: 1, stage: 'failed', level: 'error', message: 'Test research error', details: null, createdAt: '2026-01-01T00:00:00.000Z' }] }) }));
 await page.route('**/api/research', async route => {
 if (route.request().method() !== 'POST') return route.continue();
 const body = route.request().postDataJSON();
 assert.equal(body.companyName, 'Browser Test Oy');
 assert.match(body.runId, /^[0-9a-f-]{36}$/);
 await new Promise(resolve => setTimeout(resolve, 500));
 return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'Test research error' }) });
 });
 }
 await page.getByLabel('Company legal name').fill(liveCompany || 'Browser Test Oy');
 const pendingResponse = page.waitForResponse(response => response.url().endsWith('/api/research') && response.request().method() === 'POST', { timeout: 290000 });
 await button.click();
 await page.getByRole('button', { name: 'Researching…' }).waitFor();
 assert.equal(await page.getByLabel('Company legal name').isDisabled(), true);
 const response = await pendingResponse;
 const saved = await response.json();
 if (liveCompany) {
 assert.equal(response.status(), 201, saved.error);
 await page.locator('#report-heading').waitFor();
 assert.equal(await page.locator('#report-heading').textContent(), saved.report.companyName);
 await page.reload();
 await page.locator('.notes article').filter({ has: page.getByRole('heading', { name: saved.report.companyName, exact: true }) }).first().getByRole('button', { name: 'View report' }).click();
 await page.locator('#report-heading').waitFor();
 await page.getByRole('heading', { name: 'Research activity log', exact: true }).waitFor();
 const logsResponse = await page.request.get(`${base}/api/research/runs/${saved.runId}`);
 const run = await logsResponse.json();
 assert.equal(run.status, 'completed');
 assert.ok(run.logs.some(log => log.stage === 'provider.result'));
 assert.ok(run.logs.some(log => log.stage === 'completed'));
 console.log(JSON.stringify({ companyName: saved.report.companyName, reportId: saved.id, researchStatus: saved.report.researchStatus, events: run.logs.length }));
 } else {
 await page.getByRole('alert').filter({ hasText: 'Test research error' }).waitFor();
 assert.equal(await button.isEnabled(), true);
 await page.getByRole('heading', { name: 'Research activity log', exact: true }).waitFor();
 await page.getByRole('link', { name: 'Notebook', exact: true }).click();
 await page.getByRole('heading', { name: 'Make a note of it.' }).waitFor();
 }
 assert.deepEqual(errors, []);
 console.log(liveCompany ? 'PASS: live research, report rendering, persistence, reopening, and logs.' : 'PASS: button click, request input, pending state, error recovery, logs, and navigation.');
} finally { await browser.close(); }
