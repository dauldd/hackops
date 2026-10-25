// Focused specifications; intentionally not executed during implementation.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculate,resolveInputs,createScenarios,definitions} from '../src/lib/visualization/calculations.ts';
import {buildCharts} from '../src/lib/visualization/charts.ts';
import type {Inputs,InputKey,Proposal} from '../src/lib/visualization/schema.ts';
function supplied(values:Partial<Record<InputKey,number>>){return Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{value,unit:definitions[key as InputKey].unit,classification:'assumption',origin:'scenario',sourceReferences:[],explanation:'Explicit illustrative scenario.'}])) as Partial<Inputs>;}
test('full-coverage example releases 900 hours and cash math uses operating costs',()=>{
 const inputs=resolveInputs(supplied({monthlyVolume:500,currentMinutes:12,automatedMinutes:3,automationRate:1,adoptionRate:1,reviewRate:0,hourlyCost:30,implementationCost:12000,monthlyOperatingCost:100,cashRealizationRate:1}));const m=calculate(inputs);
 assert.equal(m.currentMonthlyHours,100);assert.equal(m.automatedMonthlyHours,25);assert.equal(m.annualHoursReleased,900);assert.equal(m.annualCapacityValue,27000);assert.equal(m.annualNetCashBenefit,25800);assert.equal(m.firstYearNetBenefit,13800);assert.equal(m.roiPct,115);assert.ok(Math.abs(m.paybackMonths!-12000/2150)<1e-9);assert.equal(m.timeline[0].net,-12000);
});
test('released capacity does not become cash without a realization assumption',()=>{
 const m=calculate(resolveInputs(supplied({hourlyCost:30,implementationCost:12000,monthlyOperatingCost:100,cashRealizationRate:0})));assert.ok(m.annualCapacityValue!>0);assert.equal(m.annualCashBenefit,0);assert.equal(m.annualNetCashBenefit,-1200);assert.equal(m.paybackMonths,null);
});
test('missing money stays unknown and scenarios are explicitly illustrative',()=>{
 const inputs=resolveInputs();const m=calculate(inputs);assert.equal(m.annualCapacityValue,null);assert.equal(m.roiPct,null);assert.equal(m.paybackMonths,null);const scenarios=createScenarios(inputs);assert.equal(scenarios.length,3);assert.ok(scenarios.every(s=>s.label.includes('not verified')&&s.assumptions.length>0));
 const proposal:Proposal={id:'p',title:'Invoice workflow',process:'Invoice processing',problem:null,proposedSolution:'Integrate invoice intake with accounting.',evidence:[],currentWorkflow:[],proposedWorkflow:[],currentWorkflowStatus:'unknown'};
 const charts=buildCharts({proposal,inputs,scenarios,notes:[],missingInputs:[]},[{purpose:'roi',chartType:'line',headline:'ROI',insight:'',sellingPoint:'Validate costs.'}]);assert.ok(charts.length>=3);assert.ok(charts.every(c=>c.evidenceClassification==='illustrative'&&c.assumptions.length>0));assert.ok(!charts.some(c=>c.id==='p-roi'));
});
test('range checks prevent impossible coverage and non-finite calculations',()=>{assert.throws(()=>resolveInputs(supplied({automationRate:1.1})));assert.throws(()=>resolveInputs(supplied({monthlyVolume:Infinity})));});
