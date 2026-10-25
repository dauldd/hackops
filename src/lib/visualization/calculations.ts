import { ValidationError } from '../research/schema.ts';
import {inputKeys,type Inputs,type Metrics,type Scenario,type InputKey,type QuantitativeInput} from './schema.ts';
export const definitions:Record<InputKey,{label:string;unit:string;fallback:number|null}>={monthlyVolume:{label:'Tasks per month',unit:'tasks/month',fallback:500},currentMinutes:{label:'Current handling time',unit:'minutes/task',fallback:12},automatedMinutes:{label:'Automated handling time',unit:'minutes/task',fallback:3},automationRate:{label:'Automation coverage',unit:'fraction',fallback:.8},adoptionRate:{label:'Adoption',unit:'fraction',fallback:.8},reviewRate:{label:'Human review rate',unit:'fraction',fallback:.1},reviewMinutes:{label:'Additional human review',unit:'minutes/task',fallback:3},hourlyCost:{label:'Loaded hourly labor cost',unit:'EUR/hour',fallback:null},implementationCost:{label:'Implementation investment',unit:'EUR',fallback:null},monthlyOperatingCost:{label:'Recurring operating cost',unit:'EUR/month',fallback:null},cashRealizationRate:{label:'Share of capacity value becoming cash savings',unit:'fraction',fallback:0},annualGrowthRate:{label:'Annual volume growth',unit:'fraction',fallback:.1},monthlyHoursPerEmployee:{label:'Available hours per employee',unit:'hours/month',fallback:160}};
export function resolveInputs(supplied:Partial<Inputs>={}):Inputs{
 const resolved={} as Inputs;
 for(const key of inputKeys){const d=definitions[key];const raw=supplied[key];const value=raw?.value??d.fallback;
 if(value!==null&&(!Number.isFinite(value)||value<0||value>1e9||(d.unit==='fraction'&&value>1)||(key==='monthlyHoursPerEmployee'&&value===0)))throw new ValidationError(`Invalid ${d.label}.`);
 if(raw&&raw.unit!==d.unit)throw new ValidationError(`Expected ${d.unit} for ${d.label}.`);
 resolved[key]=raw?.value!=null?{...raw,sourceReferences:[...raw.sourceReferences]}:{value,unit:d.unit,classification:value===null?'unknown':'assumption',origin:'scenario',sourceReferences:[],explanation:value===null?`${d.label} has not been provided.`:`Illustrative planning input: ${d.label} = ${value} ${d.unit}; not measured company data.`};
 }
 return resolved;
}
function finite(value:number|null){if(value!==null&&!Number.isFinite(value))throw new ValidationError('Calculation produced a non-finite value.');return value;}
export function calculate(inputs:Inputs):Metrics{
 for(const key of inputKeys){const value=inputs[key]?.value;if(value===undefined||(value!==null&&(!Number.isFinite(value)||value<0||(definitions[key].unit==='fraction'&&value>1))))throw new ValidationError(`Invalid calculation input ${key}.`);}
 for(const key of ['monthlyVolume','currentMinutes','automatedMinutes','automationRate','adoptionRate','reviewRate','reviewMinutes','cashRealizationRate','annualGrowthRate'] as const)if(inputs[key].value===null)throw new ValidationError(`Resolve ${key} as a fact or labelled assumption before calculating.`);
 const n=(key:InputKey)=>inputs[key].value;
 const volume=n('monthlyVolume')!,before=n('currentMinutes')!,after=n('automatedMinutes')!,eligible=n('automationRate')!*n('adoptionRate')!;
 const currentMonthlyHours=volume*before/60;
 const automatedMonthlyHours=volume*((1-eligible)*before+eligible*(after+n('reviewRate')!*n('reviewMinutes')!))/60;
 const monthlyHoursReleased=currentMonthlyHours-automatedMonthlyHours;
 const annualHoursReleased=monthlyHoursReleased*12;
 const wage=n('hourlyCost'),investment=n('implementationCost'),operating=n('monthlyOperatingCost');
 const annualCapacityValue=wage===null?null:annualHoursReleased*wage;
 const annualCashBenefit=annualCapacityValue===null?null:annualCapacityValue*n('cashRealizationRate')!;
 const annualNetCashBenefit=annualCashBenefit===null||operating===null?null:annualCashBenefit-operating*12;
 const firstYearNetBenefit=annualNetCashBenefit===null||investment===null?null:annualNetCashBenefit-investment;
 const roiPct=firstYearNetBenefit===null||investment===null||investment<=0?null:firstYearNetBenefit/investment*100;
 const paybackMonths=annualNetCashBenefit===null||investment===null||annualNetCashBenefit<=0?null:investment/(annualNetCashBenefit/12);
 const timeline=Array.from({length:37},(_,month)=>({month,benefit:annualCashBenefit===null?null:annualCashBenefit/12*month,cost:investment===null||operating===null?null:investment+operating*month,net:annualCashBenefit===null||investment===null||operating===null?null:annualCashBenefit/12*month-investment-operating*month}));
 let cumulative:number|null=0;
 const outlook=Array.from({length:3},(_,index)=>{const netBenefit=annualNetCashBenefit===null||investment===null?null:annualNetCashBenefit-(index===0?investment:0);cumulative=cumulative===null||netBenefit===null?null:cumulative+netBenefit;return{year:index+1,grossCapacityValue:annualCapacityValue,cashBenefit:annualCashBenefit,operatingCost:operating===null?null:operating*12,investment:index===0?investment:0,netBenefit,cumulativeNet:cumulative};});
 const metrics:Metrics={currentMonthlyHours,automatedMonthlyHours,monthlyHoursReleased,annualHoursReleased,workloadReductionPct:currentMonthlyHours===0?0:monthlyHoursReleased/currentMonthlyHours*100,currentTasksPerHour:before<=0?null:60/before,automatedTasksPerHour:volume===0||automatedMonthlyHours<=0?null:volume/automatedMonthlyHours,currentAnnualLaborValue:wage===null?null:currentMonthlyHours*12*wage,automatedAnnualLaborValue:wage===null?null:automatedMonthlyHours*12*wage,annualCapacityValue,annualCashBenefit,annualNetCashBenefit,firstYearNetBenefit,roiPct,paybackMonths,timeline,outlook};
 for(const value of Object.values(metrics))if(typeof value==='number')finite(value);
 return metrics;
}
export function createScenarios(base:Inputs):Scenario[]{
 return (['conservative','base','optimistic'] as const).map(name=>{
 const inputs=structuredClone(base);const assumptions:string[]=[];
 // Verified current-state facts are fixed. Projected future performance always remains a scenario.
 const factor=name==='conservative'?.7:name==='optimistic'?1.2:1;
 for(const key of ['automationRate','adoptionRate'] as const){const original=inputs[key];inputs[key]={...original,value:Math.min(1,original.value!*factor),classification:'assumption',origin:'scenario',explanation:`${name} scenario: ${definitions[key].label} ${Math.round(Math.min(1,original.value!*factor)*100)}%.`};}
 if(name!=='base'){const original=inputs.automatedMinutes;inputs.automatedMinutes={...original,value:original.value!*(name==='conservative'?1.3:.8),classification:'assumption',origin:'scenario',explanation:`${name} scenario handling-time assumption.`};}
 for(const [key,value]of Object.entries(inputs))if(value.classification==='assumption')assumptions.push(`${definitions[key as InputKey].label}: ${value.value} ${value.unit}. ${value.explanation}`);
 return{name,label:`${name==='base'?'Base case':name[0].toUpperCase()+name.slice(1)} — illustrative scenario, not verified company performance`,inputs,metrics:calculate(inputs),assumptions};
 });
}
export function dataLabel(inputs:Inputs,keys:InputKey[]):{classification:'derived'|'illustrative'|'mixed';assumptions:string[];sources:string[]}{
 const values=keys.map(k=>inputs[k]);const assumed=values.some(v=>v.classification==='assumption');const verified=values.some(v=>v.classification==='verified');
 return {classification:assumed?(verified?'mixed':'illustrative'):'derived',assumptions:keys.filter(k=>inputs[k].classification==='assumption').map(k=>`${definitions[k].label}: ${inputs[k].value} ${inputs[k].unit}. ${inputs[k].explanation}`),sources:[...new Set(values.flatMap(v=>v.sourceReferences))]};
}
export function companyInput(value:number, key:InputKey, explanation:string):QuantitativeInput{return{value,unit:definitions[key].unit,classification:'verified',origin:'company',sourceReferences:[],explanation};}
