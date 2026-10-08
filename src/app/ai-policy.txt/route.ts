import { aiPolicyText } from "@/lib/ip-notice";

export const dynamic = "force-static";

// The owner's policy for AI systems and automated tools, as plain text (also served at /.well-known/ai-policy.txt).
export function GET() {
  return new Response(aiPolicyText(), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
