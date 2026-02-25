import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Simple in-memory IP limiter
const dailyLimits: Record<string, { count: number; date: string }> = {};
const DAILY_LIMIT = 3;

function today() {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      "unknown-ip";

    const todayStr = today();

    if (!dailyLimits[ip] || dailyLimits[ip].date !== todayStr) {
      dailyLimits[ip] = { count: 0, date: todayStr };
    }

    if (dailyLimits[ip].count >= DAILY_LIMIT) {
      return NextResponse.json(
        { error: "Daily limit reached. Upgrade for unlimited diagnostics." },
        { status: 429 }
      );
    }

    dailyLimits[ip].count++;

    const body = await req.json();
    const { log, gameTitle, gpuModel, driverVersion, apiMode } = body;

    if (!log) {
      return NextResponse.json({ error: "No crash log provided." }, { status: 400 });
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

Provide:

Quick Fix First
Issue
Confidence Level
Probability Breakdown (percentages totaling 100%)
Most Likely Cause
Recommended Fix Steps
Need More Info
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    const result = completion.choices[0].message.content;

    return NextResponse.json({ result });

  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}