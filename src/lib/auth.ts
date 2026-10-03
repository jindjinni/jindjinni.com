import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { encode as defaultEncode } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";

// "Remember me" on the login form: unchecked, a session is good for a day;
// checked (the default -- see the login form and server action), it's good
// for 90 days, so signing in once keeps you signed in across browser
// restarts instead of asking again every visit.
//
// The session cookie's own browser-visible Max-Age is always issued from
// the long value below -- Auth.js sets that from the static `session.maxAge`
// config with no per-login hook. What actually varies per login is the
// `exp` claim baked into the encrypted JWT the cookie carries: the custom
// `encode` below reads the `rememberMe` flag the jwt() callback stashed on
// the token and picks a short or long maxAge before handing off to Auth.js's
// own encoder. A short-lived token then fails decryption/verification once
// its `exp` passes, so the user is treated as signed out well before the
// cookie itself would expire.
const REMEMBER_ME_SESSION_SECONDS = 60 * 60 * 24 * 90; // 90 days
const SHORT_SESSION_SECONDS = 60 * 60 * 24; // 1 day

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: REMEMBER_ME_SESSION_SECONDS },
  jwt: {
    maxAge: REMEMBER_ME_SESSION_SECONDS,
    encode: async (params) => {
      const rememberMe = (params.token as { rememberMe?: boolean } | undefined)?.rememberMe;
      const maxAge = rememberMe === false ? SHORT_SESSION_SECONDS : REMEMBER_ME_SESSION_SECONDS;
      return defaultEncode({ ...params, maxAge });
    },
  },
  // Vercel sets this automatically; local dev and any other host need it
  // explicit so Auth.js trusts the incoming Host header.
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        rememberMe: { label: "Remember me", type: "text" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email.toLowerCase()))
          .limit(1);

        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        // Missing entirely (e.g. the sign-up flow's auto sign-in) defaults
        // to "remembered" -- only an explicit "false" shortens the session.
        const rememberMe = credentials?.rememberMe !== "false";
        return { id: user.id, email: user.email, name: user.name, rememberMe };
      },
    }),
  ],
  callbacks: {
    // Every session carries the user's id; org membership is looked up
    // separately (a user can belong to more than one org) by
    // src/lib/tenant.ts, never baked permanently into the token.
    jwt: async ({ token, user }) => {
      if (user) {
        token.userId = user.id;
        // Carried on the token itself (not just read once here) so it
        // survives into every later re-encode of this session, not just
        // the one right after sign-in -- see the custom `encode` above.
        token.rememberMe = (user as { rememberMe?: boolean }).rememberMe !== false;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        (session.user as { id?: string }).id = token.userId as string;
      }
      return session;
    },
  },
});
