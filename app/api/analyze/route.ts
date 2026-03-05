import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DAILY_LIMIT = 3;

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
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

async function getRemaining(req: NextRequest) {
  const isPro = req.cookies.get("fmg_pro")?.value === "1";
  if (isPro) return { isPro: true, remaining: Infinity };

  const clientKey = getClientKey(req);
  const key = `limit:${today()}:${clientKey}`;

  const redis = await getRedis();
  const currentRaw = await redis.get(key);
  const current = currentRaw ? Number(currentRaw) : 0;

  const remaining = Math.max(0, DAILY_LIMIT - current);
  return { isPro: false, remaining };
}

async function incrementAndGetCount(req: NextRequest) {
  const clientKey = getClientKey(req);
  const key = `limit:${today()}:${clientKey}`;

  const redis = await getRedis();
  const count = await redis.incr(key);

  // expire after 48 hours
  if (count === 1) {
    await redis.expire(key, 60 * 60 * 48);
  }

  return count;
}

export async function POST(req: NextRequest) {
  try {
    const isPro = req.cookies.get("fmg_pro")?.value === "1";

    // Enforce free limit if not Pro
    let count = 0;
    if (!isPro) {
      count = await incrementAndGetCount(req);
      if (count > DAILY_LIMIT) {
        return NextResponse.json(
          { error: "Daily limit reached.", remaining: 0, isPro: false },
          { status: 429 }
        );
      }
    }

    const body = await req.json();
    const { log, gameTitle, gpuModel, driverVersion, apiMode } = body ?? {};

    if (!log || typeof log !== "string" || !log.trim()) {
      const remainingInfo = await getRemaining(req);
      return NextResponse.json(
        { error: "No crash log provided.", ...remainingInfo },
        { status: 400 }
      );
    }

    const prompt = `
You are an advanced crash diagnostic engine specialized in MODDED PC games.

You understand:
- Forge logs
- Fabric logs
- CurseForge modpacks
- Dependency conflicts
- Missing mods
- Loader version mismatches
- Mixin failures
- GPU driver instability

Context:
Game: ${gameTitle ?? ""}
GPU: ${gpuModel ?? ""}
Driver Version: ${driverVersion ?? ""}
Graphics API Mode: ${apiMode ?? ""}

Crash Log:
${log}

Provide the following sections as plain text (no markdown, no ###):

Quick Fix First:
Issue:
Confidence Level:
Probability Breakdown (must total 100%):
Most Likely Cause:
Recommended Fix Steps:
Need More Info:

If the crash appears mod-related, prioritize mod conflict analysis over hardware causes.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    const result = completion.choices[0]?.message?.content ?? "No result.";

    // Set fallback cookie ID if missing (helps tracking)
    const res = NextResponse.json({
      result,
      isPro,
      remaining: isPro ? Infinity : Math.max(0, DAILY_LIMIT - count),
    });

    if (!req.cookies.get("vid")) {
      res.cookies.set("vid", crypto.randomUUID(), {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return res;
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}