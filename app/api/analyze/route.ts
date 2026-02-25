import OpenAI from "openai";

type AnalyzeRequestBody = {
  log?: string;
  gameTitle?: string;
  gpuModel?: string;
  driverVersion?: string;
  apiMode?: "Auto Detect" | "DX11" | "DX12" | "Vulkan";
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AnalyzeRequestBody;

    const log = body?.log?.trim();
    const gameTitle = body?.gameTitle?.trim();
    const gpuModel = body?.gpuModel?.trim();
    const driverVersion = body?.driverVersion?.trim();
    const apiMode = body?.apiMode?.trim();

    if (!log) {
      return new Response(JSON.stringify({ error: "No crash log provided." }), {
        status: 400,
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY is missing from .env.local" }),
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey });

    const systemPrompt =
      "You are an expert PC gaming crash troubleshooting assistant. You diagnose crash logs and provide likely causes with probabilities and concrete fix steps.";

    const userPrompt = `
You are a professional PC gaming crash analyst.

Always respond in this EXACT format (use the headings exactly):

Quick Fix First:
- (3 bullets max: fastest high-impact fixes first)

Issue:
(1–2 sentence summary of what the error likely means)

Confidence Level:
(Low / Medium / High)

Probability Breakdown:
- Driver/software issue: __%
- Overheating/thermal: __%
- API conflict (DX11/DX12/Vulkan): __%
- Power/PSU/unstable clocks: __%
- Hardware failure: __%
(Percentages must sum to 100)

Most Likely Cause:
- (bullets)

Recommended Fix Steps:
1. (numbered steps, clear actions)

Need More Info:
- (ONLY if information is insufficient)

Context (if provided):
- Game: ${gameTitle || "Unknown"}
- GPU: ${gpuModel || "Unknown"}
- Driver: ${driverVersion || "Unknown"}
- Graphics API Mode: ${apiMode || "Unknown"}

Crash Log / Error:
${log}
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
    });

    const result = completion.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ result }), { status: 200 });
  } catch (error: unknown) {
    console.error("🔥 OPENAI ERROR:", error);

    const message =
      error instanceof Error ? error.message : "Unknown server error";

    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}