import Stripe from "stripe";

export const runtime = "nodejs"; // Stripe needs Node runtime on Vercel

export async function POST(req: Request) {
  try {
    const { plan } = await req.json();

    const secretKey = process.env.STRIPE_SECRET_KEY;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

    if (!secretKey) {
      return new Response("Missing STRIPE_SECRET_KEY", { status: 500 });
    }
    if (!baseUrl) {
      return new Response("Missing NEXT_PUBLIC_BASE_URL", { status: 500 });
    }

const stripe = new Stripe(secretKey);    // Simple plan mapping (you can change prices later)
    const planConfig: Record<string, { name: string; amount: number }> = {
      pro: { name: "FixMyGame Pro (Unlimited)", amount: 900 }, // $9.00
      daypass: { name: "FixMyGame Day Pass", amount: 300 },   // $3.00
    };

    const selected = planConfig[plan] ?? planConfig.pro;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: selected.name },
            unit_amount: selected.amount,
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/?success=1`,
      cancel_url: `${baseUrl}/?canceled=1`,
      allow_promotion_codes: true,
    });

    return Response.json({ url: session.url });
  } catch (err: unknown) {
  const message =
    err instanceof Error ? err.message : "Checkout error";
  return new Response(message, { status: 500 });
}
}