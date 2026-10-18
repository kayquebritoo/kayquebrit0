import { NextResponse } from "next/server";
import { googleConfigured } from "@/lib/kbos/auth-google";
export async function GET(){return NextResponse.json({google:googleConfigured()},{headers:{'Cache-Control':'no-store'}});}
