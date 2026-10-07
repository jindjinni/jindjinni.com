import { requireOrg } from "@/lib/tenant";
import { fetchMessages, listPeople, roomAccess, touchPresence, unreadByRoom } from "@/lib/chat-service";
import { EVERYONE, groupRoomsFor } from "@/lib/chat-rules";
import { isAdmin } from "@/lib/permissions";
import { ChatApp } from "./chat-app";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chat" };

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ room?: string }> }) {
  const org = await requireOrg();
  const ctx = { organizationId: org.organizationId, userId: org.userId, role: org.role };
  const now = Date.parse(new Date().toISOString());
  await touchPresence(ctx, now);

  // The room in the link (a person's private message, a department...) if this person may open it, else the whole-company room.
  const wanted = (await searchParams).room;
  const room = wanted && (await roomAccess(ctx, wanted)).ok ? wanted : EVERYONE;

  const [people, unread, first] = await Promise.all([listPeople(ctx, now), unreadByRoom(ctx), fetchMessages(ctx, { room })]);
  const me = people.find((p) => p.isMe);

  return (
    <ChatApp
      me={{ id: org.userId, name: me?.name ?? "You", canModerate: isAdmin(org.role) }}
      rooms={groupRoomsFor(org.role)}
      initialRoom={room}
      initialPeople={people}
      initialUnread={unread}
      initialMessages={first.ok ? first.messages : []}
      initialHasMore={first.ok ? first.hasMore : false}
    />
  );
}
