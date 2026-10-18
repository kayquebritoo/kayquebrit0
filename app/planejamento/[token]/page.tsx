import type { Metadata,Viewport } from "next";
import ClientPlan from "./ClientPlan";
export const metadata:Metadata={title:'Sua marca e planejamento — KBOS',robots:{index:false,follow:false},referrer:'no-referrer'};
export const viewport:Viewport={width:'device-width',initialScale:1,maximumScale:5,userScalable:true};
export default async function Page({params}:{params:Promise<{token:string}>}) {return <ClientPlan token={(await params).token}/>;}
