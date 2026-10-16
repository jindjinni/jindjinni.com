import { aiPolicyText } from "@/lib/ip-notice";

export const dynamic = "force-static";

// llms.txt is where AI systems look for a short description of a site. Ours is a legal notice: this is private, proprietary software.
export function GET() {
  const body = [
    "# jindjinni",
    "",
    "> Proprietary operations software (purchasing, receiving, accounts, customer service, inventory, sales, shipping, marketing, HR, chat) that gives a business a ready-made layout for its industry. Available today for medical supply Wholesale and Distribution companies, with more industries planned. The signed-in product is private. Nothing here is offered for AI training, copying or reproduction.",
    "",
    aiPolicyText(),
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
