import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";

const DAILY_LIMIT = 3;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getClientKey(req: NextRequest) {
  const xff = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  const ip = (xff?.split(",")[0] || realIp || "").trim();
  const cookieVid = req.cookies.get("vid")?.value;

  if (ip) return `ip:${ip}`;
  if (cookieVid) return `vid:${cookieVid}`;
  return `unknown:${crypto.randomUUID()}`;
}

export async function GET(req: NextRequest) {
  const isPro = req.cookies.get("fmg_pro")?.value === "1";
  if (isPro) {
    return NextResponse.json({ isPro: true, remaining: Infinity });
  }

  const clientKey = getClientKey(req);
  const key = `limit:${today()}:${clientKey}`;

  const redis = await getRedis();
  const raw = await redis.get(key);
  const count = raw ? Number(raw) : 0;

  return NextResponse.json({
    isPro: false,
    remaining: Math.max(0, DAILY_LIMIT - count),
  });
}