import assert from "node:assert/strict";
import { britishStandIn, houseVoice, offeredVoices, pickVoice, type VoiceLike } from "../src/lib/jin-voice";

const v = (name: string, lang: string, extra: Partial<VoiceLike> = {}): VoiceLike => ({ name, lang, ...extra });
const US = [v("Albert", "en-US"), v("Samantha", "en-US", { default: true }), v("Ava (Premium)", "en-US"), v("Amélie", "fr-CA")];

// 1. The exact house voice wins when the device has it.
const withGoogle = [...US, v("Daniel", "en-GB"), v("Google UK English Female", "en-GB")];
assert.equal(pickVoice(withGoogle, "en-US")?.name, "Google UK English Female");
assert.equal(houseVoice(withGoogle)?.name, "Google UK English Female");

// 2. A person's own choice beats it, but a choice that is gone falls back to the house voice.
assert.equal(pickVoice(withGoogle, "en-US", "Samantha")?.name, "Samantha");
assert.equal(pickVoice(withGoogle, "en-US", "Vanished")?.name, "Google UK English Female");

// 3. Without Google's voice, the next British female voice is used, in the order of the list.
const edge = [...US, v("Microsoft Sonia Online (Natural) - English (United Kingdom)", "en-GB"), v("Microsoft Libby Online (Natural) - English (United Kingdom)", "en-GB")];
assert.equal(pickVoice(edge, "en-US")?.name, "Microsoft Libby Online (Natural) - English (United Kingdom)");
const apple = [...US, v("Daniel", "en-GB"), v("Kate (Enhanced)", "en-GB"), v("Serena (Premium)", "en-GB")];
assert.equal(pickVoice(apple, "en-US")?.name, "Serena (Premium)");

// 4. A British voice that is not on the list is still preferred to an American one, unless it is a man's.
const odd = [...US, v("English United Kingdom", "en-GB")];
assert.equal(pickVoice(odd, "en-US")?.name, "English United Kingdom");
assert.equal(britishStandIn([v("Google UK English Male", "en-GB"), v("Daniel", "en-GB"), v("Oliver", "en-GB")]), null);

// 5. A man's British voice alone never replaces a good natural voice in the person's own language.
assert.equal(pickVoice([...US, v("Daniel", "en-GB")], "en-US")?.name, "Ava (Premium)");

// 6. No British voice at all: the best natural voice for the person's language, exactly as before.
assert.equal(pickVoice(US, "en-US")?.name, "Ava (Premium)");
assert.equal(houseVoice(US), null);
assert.equal(pickVoice([], "en-US"), null);

// 7. A name that only looks like a house voice in another language is not used.
assert.equal(houseVoice([v("Kate", "en-US"), v("Serena", "es-ES")]), null);

// 8. The picker still hides novelty and foreign voices but offers the British ones.
const offered = offeredVoices(withGoogle, "en-US").map((x) => x.name);
assert.ok(offered.includes("Google UK English Female") && offered.includes("Daniel") && !offered.includes("Albert") && !offered.includes("Amélie"));

console.log("jin-voice: all passed");
