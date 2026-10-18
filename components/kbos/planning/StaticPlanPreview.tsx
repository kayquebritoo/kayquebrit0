"use client";
import PlanView from "./PlanView";
import type { PublicClientPlan } from "@/lib/kbos/planning-model";
export default function StaticPlanPreview({data}:{data:PublicClientPlan}) {return <PlanView data={data} demo assetUrl={()=>'#arquivos'}/>;}
