'use client';
import {useEffect,useRef,useState} from 'react';
import type {BusinessCase,InputKey} from '@/lib/visualization/schema';
const money=(n:number)=>new Intl.NumberFormat('en-FI',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
const fmt=(n:number)=>new Intl.NumberFormat('en-GB',{maximumFractionDigits:0}).format(n);
type Values={volume:number;minutes:number;automatedMinutes:number;coverage:number;hourly:number;investment:number};
const sliderInfo:{key:keyof Values;label:string;min:number;max:number;step:number;unit:string}[]=[
 {key:'volume',label:'Monthly task volume',min:100,max:20000,step:100,unit:' tasks'},
 {key:'minutes',label:'Minutes per task · current',min:1,max:90,step:1,unit:' min'},
 {key:'automatedMinutes',label:'Minutes per task · with Velho',min:0,max:30,step:1,unit:' min'},
 {key:'coverage',label:'Expected automation',min:0,max:100,step:1,unit:'%'},
 {key:'hourly',label:'Employee hourly cost',min:10,max:200,step:1,unit:' €/h'},
 {key:'investment',label:'Velho implementation cost',min:1000,max:500000,step:1000,unit:' €'}
];
function Slider({item,value,onChange}:{item:typeof sliderInfo[number];value:number;onChange:(v:number)=>void}){return <label className="roi-slider"><span>{item.label}<b>{item.unit.includes('€')?money(value):`${fmt(value)}${item.unit}`}</b></span><input aria-label={item.label} type="range" min={item.min} max={item.max} step={item.step} value={value} onChange={e=>onChange(Number(e.target.value))}/></label>}
export default function ValueDashboard({businessCase}:{businessCase?:BusinessCase}){
 const inputs=businessCase?.inputs;
 const fact=(key:InputKey,illustration:number)=>{const input=inputs?.[key];return input?.classification==='verified'&&input.value!==null?input.value:illustration;};
 const [v,setV]=useState<Values>({volume:fact('monthlyVolume',2000),minutes:fact('currentMinutes',8),automatedMinutes:fact('automatedMinutes',2),coverage:75,hourly:fact('hourlyCost',35),investment:fact('implementationCost',25000)});
 const seeded=useRef(false);
 useEffect(()=>{if(!businessCase||seeded.current)return;seeded.current=true;setV(current=>({...current,volume:fact('monthlyVolume',current.volume),minutes:fact('currentMinutes',current.minutes),automatedMinutes:fact('automatedMinutes',current.automatedMinutes),hourly:fact('hourlyCost',current.hourly),investment:fact('implementationCost',current.investment)}));},[businessCase]);
 const currentMonthlyHours=v.volume*v.minutes/60;
 const automatedMonthlyHours=v.volume*((1-v.coverage/100)*v.minutes+(v.coverage/100)*v.automatedMinutes)/60;
 const effectiveMinutes=v.minutes*(1-v.coverage/100)+v.automatedMinutes*(v.coverage/100);
 const hoursReleased=Math.max(0,currentMonthlyHours-automatedMonthlyHours);
 const annualHoursReleased=hoursReleased*12;
 const annualValue=annualHoursReleased*v.hourly;
 const firstYearNet=annualValue-v.investment;
 const roi=v.investment?firstYearNet/v.investment*100:0;
 const payback=annualValue>0?v.investment/(annualValue/12):null;
 const moneyBefore=currentMonthlyHours*12*v.hourly,moneyAfter=automatedMonthlyHours*12*v.hourly;
 return <section className="roi-dashboard" aria-label="Interactive automation ROI dashboard">
  <div className="roi-dashboard-head"><div><span>VELHO · BUSINESS CASE</span><h2>Interactive Automation ROI Simulator</h2><p>See what automating your processes could mean for your business.</p></div><strong className="roi-headline">{fmt(annualHoursReleased)}<small>hours released / year</small></strong></div>
  <div className="roi-main-grid">
    <div className="roi-controls">{sliderInfo.map(item=><Slider key={item.key} item={item} value={v[item.key]} onChange={n=>setV(current=>({...current,[item.key]:n}))}/>)}</div>
   <div className="roi-results"><table className="roi-metrics-table"><thead><tr><th>Metric</th><th>Current</th><th>With Velho</th></tr></thead><tbody>
    <tr><td>Monthly tasks</td><td>{fmt(v.volume)}</td><td>{fmt(v.volume)}</td></tr>
    <tr><td>Minutes per task</td><td>{fmt(v.minutes)} min</td><td>{effectiveMinutes.toFixed(1)} min effective</td></tr>
    <tr><td>Monthly employee hours</td><td>{fmt(currentMonthlyHours)} h</td><td>{fmt(automatedMonthlyHours)} h</td></tr>
    <tr><td>Annual employee hours</td><td>{fmt(currentMonthlyHours*12)} h</td><td>{fmt(automatedMonthlyHours*12)} h</td></tr>
    <tr className="roi-highlight"><td>Annual capacity released</td><td>—</td><td>{fmt(annualHoursReleased)} hours</td></tr>
    <tr><td>Annual value at selected hourly cost</td><td>{money(moneyBefore)}</td><td>{money(moneyAfter)}</td></tr>
   </tbody></table>
    <div className="roi-kpis"><div><small>Potential annual savings</small><b>{money(annualValue)}</b></div><div><small>Year-one ROI</small><b>{Math.round(roi)}%</b></div><div><small>Payback period</small><b>{payback===null?'—':`${payback.toFixed(1)} mo`}</b></div><div><small>Project investment</small><b>{money(v.investment)}</b></div></div>
   </div>
  </div>
  <div className="roi-support-grid">
   <article className="roi-panel"><header><span>Money Leakage Waterfall</span><b>{money(annualValue)} capacity recovered</b></header><p>Annual workload value · based on selected employee cost</p><div className="leakage-waterfall"><div><small>Current</small><b>{money(moneyBefore)}</b><i style={{height:`${Math.max(8,moneyBefore?100:8)}%`}}/></div><div className="leakage-step"><small>Released</small><b>− {money(annualValue)}</b><i style={{height:`${Math.max(8,moneyBefore?Math.min(100,annualValue/Math.max(1,moneyBefore)*100):8)}%`}}/></div><div><small>With Velho</small><b>{money(moneyAfter)}</b><i style={{height:`${Math.max(8,moneyBefore?moneyAfter/moneyBefore*100:8)}%`}}/></div></div></article>
   <article className="roi-panel"><header><span>Employee Time Allocation</span><b>{fmt(annualHoursReleased)} h recovered</b></header><p>Annual time in the selected workflow</p><div className="time-allocation"><div><span>Current workload</span><div><i style={{width:'100%'}}/></div><b>{fmt(currentMonthlyHours*12)} h</b></div><div><span>With Velho</span><div><i style={{width:`${currentMonthlyHours?automatedMonthlyHours/currentMonthlyHours*100:0}%`}}/></div><b>{fmt(automatedMonthlyHours*12)} h</b></div><div><span>Capacity released</span><div className="released"><i style={{width:`${currentMonthlyHours?hoursReleased/currentMonthlyHours*100:0}%`}}/></div><b>{fmt(annualHoursReleased)} h</b></div></div></article>

  </div>
 </section>;
}
