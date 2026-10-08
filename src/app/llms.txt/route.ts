import { aiPolicyText } from "@/lib/ip-notice";

export const dynamic = "force-static";

// llms.txt is where AI systems look for a short description of a site. Ours is a legal notice: this is private, proprietary software.
export function GET() {
  const body = [
    "# jindjinni",
    "",
    "> Proprietary business software (purchasing, receiving, accounts, customer service, inventory, sales, marketing, HR, chat). The signed-in product is private. Nothing here is offered for AI training, copying or reproduction.",
    "",
    aiPolicyText(),
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
