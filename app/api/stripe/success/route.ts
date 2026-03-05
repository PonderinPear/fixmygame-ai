import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get("session_id");

    if (!sessionId) {
      return NextResponse.redirect(new URL("/?canceled=1", req.url));
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.redirect(new URL("/?canceled=1", req.url));
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return NextResponse.redirect(new URL("/?canceled=1", req.url));
    }

    const res = NextResponse.redirect(new URL("/?success=1", req.url));

    // 1 year “pro” cookie
    res.cookies.set("fmg_pro", "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return res;
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(new URL("/?canceled=1", req.url));
  }
}