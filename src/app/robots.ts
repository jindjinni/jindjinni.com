import type { MetadataRoute } from "next";

// Tells well-behaved crawlers what they may read. The signed-in app and the API are never for crawlers, and the
// known AI-training and AI-assistant crawlers are asked to stay out of the whole site. robots.txt is a request, not a
// lock (the Terms of Service and the security headers in next.config.ts do the enforcing); it is one layer of several.
export const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-Web",
  "Claude-User",
  "anthropic-ai",
  "Google-Extended",
  "Google-CloudVertexBot",
  "CCBot",
  "PerplexityBot",
  "Perplexity-User",
  "Bytespider",
  "Amazonbot",
  "Applebot-Extended",
  "cohere-ai",
  "cohere-training-data-crawler",
  "Meta-ExternalAgent",
  "Meta-ExternalFetcher",
  "FacebookBot",
  "Diffbot",
  "ImagesiftBot",
  "Omgilibot",
  "YouBot",
  "Timpibot",
  "AI2Bot",
  "DuckAssistBot",
  "MistralAI-User",
  "PetalBot",
  "SemrushBot",
  "AhrefsBot",
  "DataForSeoBot",
  "Scrapy",
  "HTTrack",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: AI_CRAWLERS, disallow: "/" },
      { userAgent: "*", allow: ["/", "/terms", "/privacy", "/acceptable-use", "/security"], disallow: ["/dashboard", "/api/", "/invite/", "/accept-terms", "/onboarding", "/closed", "/no-access", "/unsubscribe/"] },
    ],
  };
}
