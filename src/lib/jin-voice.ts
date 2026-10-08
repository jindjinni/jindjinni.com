// Jin's reading voice. The browser ships with several voices and the default one is often the most robotic. This picks the
// most natural-sounding voice the device already has (Apple "Enhanced/Premium", Google, Microsoft "Natural"), skips the novelty
// voices, and cuts the answer into sentences so it reads with natural pauses. Pure functions, so they are easy to test.

export type VoiceLike = { name: string; lang: string; localService?: boolean; default?: boolean };

const NATURAL_WORDS = /\b(natural|neural|premium|enhanced|studio|wavenet|online)\b/i;
// Names people commonly find warm and human on Apple, Google and Microsoft devices (female-sounding first: Jin is "her").
const GOOD_NAMES = ["samantha", "ava", "allison", "susan", "zoe", "serena", "karen", "moira", "tessa", "aria", "jenny", "libby", "sonia", "emma", "google us english", "google uk english female", "siri"];
// Voices that are jokes, whispers or very robotic.
const BAD_NAMES = ["albert", "bad news", "bahh", "bells", "boing", "bubbles", "cellos", "deranged", "good news", "hysterical", "jester", "organ", "superstar", "trinoids", "whisper", "wobble", "zarvox", "fred", "junior", "ralph", "kathy", "espeak", "grandma", "grandpa", "rocko", "shelley", "flo", "eddy", "reed", "sandy"];

export function scoreVoice(v: VoiceLike, lang: string): number {
  const name = v.name.toLowerCase();
  const want = (lang || "en-US").toLowerCase();
  const have = (v.lang || "").toLowerCase().replace("_", "-");
  let s = 0;
  if (have === want) s += 40;
  else if (have.split("-")[0] === want.split("-")[0]) s += 25;
  else return -1000; // never read an English answer in another language
  if (BAD_NAMES.some((b) => name.includes(b))) s -= 200;
  if (NATURAL_WORDS.test(v.name)) s += 60;
  const nameIdx = GOOD_NAMES.findIndex((g) => name.includes(g));
  if (nameIdx >= 0) s += 30 - Math.min(nameIdx, 20);
  if (/female/.test(name)) s += 5;
  if (/\bmale\b/.test(name) && !/female/.test(name)) s -= 3;
  if (v.default) s += 1;
  return s;
}

/**
 * The platform's house voice for Jin, used for everyone who has not picked their own (until further notice, per the owner).
 * Matched by name, in order. It exists on Chrome and Edge (Google's voices); on devices without it Jin falls back to the
 * best natural voice below. To change the house voice later, change this one list.
 */
export const HOUSE_VOICE_NAMES = ["Google UK English Female"];

/** The best voice for a language, or null when there is none worth choosing (then the browser's own default is used). */
export function pickVoice<T extends VoiceLike>(voices: readonly T[], lang: string, preferredName?: string | null): T | null {
  if (preferredName) {
    const chosen = voices.find((v) => v.name === preferredName);
    if (chosen) return chosen;
  }
  for (const house of HOUSE_VOICE_NAMES) {
    const found = voices.find((v) => v.name.toLowerCase() === house.toLowerCase());
    if (found) return found;
  }
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const v of voices) {
    const sc = scoreVoice(v, lang);
    if (sc > bestScore) {
      best = v;
      bestScore = sc;
    }
  }
  return best && bestScore > -100 ? best : null;
}

/** Voices worth offering in the picker: the right language, no novelty voices, best first. */
export function offeredVoices<T extends VoiceLike>(voices: readonly T[], lang: string): T[] {
  return voices
    .map((v) => ({ v, s: scoreVoice(v, lang) }))
    .filter((x) => x.s > -100)
    .sort((a, b) => b.s - a.s || a.v.name.localeCompare(b.v.name))
    .map((x) => x.v);
}

/**
 * What Jin actually says, made from the text on screen. Pictures (emoji, check marks, arrows) are never spoken or named, and
 * symbols are turned into the words a person would say, so it sounds like talking, not like reading the screen aloud.
 */
export function spokenText(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s*(?:->|=>|→|⇒)\s*/g, ", then ")
    // emoji and pictures, including skin tones, flags, keycaps and joined families
    .replace(/[0-9#*]\ufe0f?\u20e3/g, " ")
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\u{E0020}-\u{E007F}\u200d\ufe0e\ufe0f\u20e3]/gu, " ")
    .replace(/[\u2190-\u21ff\u2300-\u23ff\u25a0-\u25ff\u2600-\u27bf\u2900-\u297f\u2b00-\u2bff]/g, " ")
    .replace(/[•·▪●○◦‣]/g, ". ")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s&\s/g, " and ")
    .replace(/(\d)\s*%/g, "$1 percent")
    .replace(/[*_`~#|^<>]+/g, " ")
    .replace(/\s*\/\s*/g, " or ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/([.,!?;:])(?:\s*[.,;:])+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits text into sentence-sized pieces (at most `max` characters) so each is read with a natural pause and none is cut off. */
export function speechChunks(text: string, max = 180): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?;:]+[.!?;:]*\s*/g) ?? [clean];
  const out: string[] = [];
  for (const raw of sentences) {
    let s = raw.trim();
    if (!s) continue;
    while (s.length > max) {
      let cut = s.lastIndexOf(", ", max);
      if (cut < max / 2) cut = s.lastIndexOf(" ", max);
      if (cut < 1) cut = max;
      out.push(s.slice(0, cut + 1).trim());
      s = s.slice(cut + 1).trim();
    }
    if (s) out.push(s);
  }
  return out;
}

/** A calm, unhurried pace reads as more human than the default. */
export const VOICE_RATE = 0.96;
export const VOICE_PITCH = 1.02;
