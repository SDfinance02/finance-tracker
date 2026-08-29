/// <reference lib="webworker" />
import { runMonteCarlo } from '../lib/monteCarlo';
import type { FutureEvent, FutureRiskSettings, FutureScenario, FutureStartingPoint } from '../types';

type Payload={start:FutureStartingPoint;scenario:FutureScenario;events:FutureEvent[];settings:FutureRiskSettings;startDate:string};
self.onmessage=(event:MessageEvent<Payload>)=>{
  try{const {start,scenario,events,settings,startDate}=event.data;self.postMessage({ok:true,result:runMonteCarlo(start,scenario,events,settings,new Date(startDate))});}
  catch(error){self.postMessage({ok:false,error:String(error)});}
};
