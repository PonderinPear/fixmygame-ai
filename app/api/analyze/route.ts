import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

async function incrementAndCheckDailyLimit(clientKey: string) {
  const key = `limit:${today()}:${clientKey}`;
  const count = (await kv.incr(key)) as number;

  if (count === 1) {
    await kv.expire(key, 60 * 60 * 48);
  }

  return count;
}

export async function POST(req: NextRequest) {
  try {
    // KV rate limiting
    const clientKey = getClientKey(req);
    const count = await incrementAndCheckDailyLimit(clientKey);

    if (count > DAILY_LIMIT) {
      return NextResponse.json(
        { error: "Daily limit reached. Upgrade for unlimited diagnostics." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { log, gameTitle, gpuModel, driverVersion, apiMode } = body;

    if (!log) {
      return NextResponse.json(
        { error: "No crash log provided." },
        { status: 400 }
      );
    }

    const prompt = `
You are an advanced GPU crash diagnostic engine.

Context:
Game: ${gameTitle}
GPU: ${gpuModel}
Driver Version: ${driverVersion}
Graphics API Mode: ${apiMode}

Crash Log:
${log}

Provide the following sections as plain text (no markdown, no ###, no bullet symbols):
Quick Fix First:
Issue:
Confidence Level:
Probability Breakdown (must total 100%):
Most Likely Cause:
Recommended Fix Steps:
Need More Info:
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    const result = completion.choices[0].message.content;

    const res = NextResponse.json({ result });

    // Set fallback cookie ID if missing
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