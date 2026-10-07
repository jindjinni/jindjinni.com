// The emoji picker's list: a handful of categories, each emoji with a few words so the search box finds it.
// Kept to long-established emoji so they show properly on every computer and phone. (Anyone can also use their own keyboard's emoji.)

export type Emoji = { e: string; k: string };
export type EmojiGroup = { id: string; icon: string; label: string; items: Emoji[] };

const list = (s: string): Emoji[] =>
  s
    .trim()
    .split("\n")
    .map((l) => {
      const [e, ...k] = l.trim().split(" ");
      return { e, k: k.join(" ") };
    });

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    id: "smileys",
    icon: "😀",
    label: "Smileys",
    items: list(`
😀 grin happy smile
😃 smile happy open
😄 laugh happy smile
😁 beam grin
😆 laughing squint
😅 sweat nervous relief
😂 joy tears laugh lol
🤣 rofl rolling laugh
🙂 slight smile
😉 wink
😊 blush smile happy
😇 angel innocent halo
🥰 love adore hearts face
😍 heart eyes love
🤩 star struck wow
😘 kiss blow
😋 yum tasty delicious
😛 tongue playful
😜 wink tongue silly
🤪 zany crazy
🤗 hug thanks
🤔 thinking hmm
🤨 skeptical eyebrow
😐 neutral
😑 expressionless
🙄 eye roll
😏 smirk
😬 grimace awkward
😌 relieved calm
😔 sad pensive
😴 sleep tired zzz
😷 mask sick
🤒 sick thermometer
🤕 hurt bandage
🤢 nauseous sick
🥵 hot
🥶 cold freezing
🥴 woozy dizzy
😵 dizzy
🤯 mind blown
🤠 cowboy
😎 cool sunglasses
🤓 nerd
🧐 monocle
😕 confused
😟 worried
🙁 frown
😮 surprised wow
😲 astonished
😳 flushed embarrassed
🥺 pleading please
😢 cry sad
😭 sob crying
😱 scream shocked
😖 confounded
😞 disappointed
😓 sweat downcast
😩 weary
😫 tired
😤 triumph huff
😡 angry mad
😠 angry
🤬 cursing swearing
😈 devil
💀 skull dead
💩 poop
🤡 clown
👻 ghost
🤖 robot
`),
  },
  {
    id: "people",
    icon: "👍",
    label: "Hands & people",
    items: list(`
👍 thumbs up yes good ok
👎 thumbs down no bad
👌 ok perfect
✌️ peace victory
🤞 fingers crossed luck
🤟 love you
🤘 rock
🤙 call me
👈 left point
👉 right point
👆 up point
👇 down point
☝️ one up
✋ stop hand high five
🖐️ hand
🖖 vulcan
👋 wave hello bye
🤝 handshake deal
🙏 pray thanks please
💪 strong muscle flex
👏 clap applause
🙌 raised hands praise hooray
👐 open hands
🤲 palms
✍️ writing
🤳 selfie
👀 eyes look
🧠 brain smart
🦷 tooth
👂 ear listen
👃 nose
👶 baby
🧒 child
👦 boy
👧 girl
🧑 person
👨 man
👩 woman
🧓 older person
👴 old man
👵 old woman
🙋 raising hand
🙅 no gesture
🙆 ok gesture
🤷 shrug
🤦 facepalm
💁 information desk
🙇 bow sorry
🏃 run running
🚶 walk walking
💃 dance dancing
🕺 dance
`),
  },
  {
    id: "hearts",
    icon: "❤️",
    label: "Hearts & symbols",
    items: list(`
❤️ red heart love
🧡 orange heart
💛 yellow heart
💚 green heart
💙 blue heart
💜 purple heart
🖤 black heart
🤍 white heart
💔 broken heart
💕 two hearts
💞 revolving hearts
💖 sparkling heart
💗 growing heart
💘 heart arrow
💯 hundred perfect
💢 anger
💥 boom collision
💫 dizzy stars
💦 sweat water drops
💨 dash wind
💬 speech bubble chat
💭 thought bubble
🔥 fire hot lit
✨ sparkles shiny
⭐ star
🌟 glowing star
🎉 party celebrate tada
🎊 confetti
🎈 balloon
🎁 gift present
🏆 trophy win
🥇 gold medal first
🥈 silver medal second
🥉 bronze medal third
✅ check done yes
❌ cross no wrong
❗ exclamation important
❓ question
⚠️ warning caution
🚫 prohibited no
➕ plus add
➖ minus
✔️ check mark
☑️ checked box
🔔 bell notification
🔕 muted no bell
📌 pin
🔒 lock
🔓 unlock
`),
  },
  {
    id: "work",
    icon: "💼",
    label: "Work & things",
    items: list(`
💼 briefcase work
📦 package box parcel
📬 mailbox mail
📧 email
📨 incoming envelope
📞 phone call
📱 mobile phone
☎️ telephone
💻 laptop computer
🖥️ desktop computer
🖨️ printer
⌨️ keyboard
📷 camera photo
📸 camera flash
🎥 movie camera video
📎 paperclip attach
📝 memo note write
📄 page document
📑 documents
📊 bar chart report
📈 chart up growth
📉 chart down
🗂️ folders
📁 folder
📅 calendar date
🕒 clock time
⏰ alarm clock
⏳ hourglass waiting
💰 money bag
💵 dollar cash
💳 credit card payment
🧾 receipt invoice
🏦 bank
🏷️ tag price label
🛒 shopping cart
🚚 delivery truck shipping
✈️ airplane flight
🏠 house home
🏢 office building
🔧 wrench tool
🔨 hammer
🔍 search magnifying glass
💡 idea light bulb
🔑 key
🧪 test tube lab
💉 syringe
💊 pill medicine
🩺 stethoscope
🧰 toolbox
📣 megaphone announce
🚨 siren alert emergency
`),
  },
  {
    id: "food",
    icon: "🍕",
    label: "Food & drink",
    items: list(`
☕ coffee break
🍵 tea
🥤 cup drink soda
🍺 beer
🍻 cheers beers
🥂 champagne toast
🍷 wine
🍕 pizza
🍔 burger
🍟 fries
🌭 hot dog
🌮 taco
🌯 burrito
🥪 sandwich lunch
🥗 salad
🍝 spaghetti pasta
🍜 noodles ramen
🍣 sushi
🍤 shrimp
🍗 chicken drumstick
🥩 steak meat
🍳 egg cooking breakfast
🥞 pancakes
🍞 bread
🧀 cheese
🍎 apple
🍌 banana
🍇 grapes
🍓 strawberry
🍉 watermelon
🍊 orange
🍋 lemon
🥑 avocado
🥕 carrot
🍩 donut
🍪 cookie
🎂 birthday cake
🍰 cake
🍫 chocolate
🍿 popcorn
🍦 ice cream
`),
  },
  {
    id: "nature",
    icon: "🌳",
    label: "Nature & travel",
    items: list(`
☀️ sun sunny
🌤️ sun cloud
⛅ partly cloudy
☁️ cloud
🌧️ rain
⛈️ storm thunder
❄️ snow cold
🌈 rainbow
🌊 wave ocean
🌴 palm tree vacation
🌳 tree
🌸 blossom flower
🌹 rose
🌻 sunflower
🍀 clover luck
🍁 maple leaf fall
🐶 dog
🐱 cat
🐭 mouse
🐻 bear
🐼 panda
🦊 fox
🐯 tiger
🦁 lion
🐸 frog
🐵 monkey
🐔 chicken
🐧 penguin
🦆 duck
🦅 eagle
🐝 bee
🦋 butterfly
🐢 turtle
🐠 fish
🐬 dolphin
🌙 moon night
🌍 earth globe
🚗 car drive
🚕 taxi
🚌 bus
🚲 bike
✈️ plane
🚀 rocket
⚓ anchor
⛽ gas fuel
🏖️ beach vacation
⛰️ mountain
🏝️ island
`),
  },
];

const ALL: Emoji[] = EMOJI_GROUPS.flatMap((g) => g.items);

/** Emoji whose name words start with, or contain, what was typed. "heart" finds the heart emoji; an emoji pasted in finds itself. */
export function searchEmoji(query: string): Emoji[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const seen = new Set<string>();
  const out: Emoji[] = [];
  for (const m of ALL) {
    if (seen.has(m.e)) continue;
    const words = m.k.split(" ");
    if (m.e === q || words.some((w) => w.startsWith(q)) || m.k.includes(q)) {
      seen.add(m.e);
      out.push(m);
    }
  }
  return out.slice(0, 80);
}

export const RECENT_KEY = "chat-recent-emoji";
export const RECENT_MAX = 16;

/** Newest first, no repeats, at most RECENT_MAX. */
export function addRecent(list: string[], e: string): string[] {
  return [e, ...list.filter((x) => x !== e)].slice(0, RECENT_MAX);
}
