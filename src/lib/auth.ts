import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import bcryptjs from "bcryptjs";
import { checkLoginRateLimit, recordLoginFailure, resetLoginRateLimit } from "@/lib/rate-limit";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "账号", type: "text" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = String(credentials.email).trim();
        const password = String(credentials.password);
        const rateLimitKey = email.toLowerCase();
        const rateLimit = checkLoginRateLimit(rateLimitKey);

        if (!rateLimit.allowed) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.isActive) {
          recordLoginFailure(rateLimitKey);
          return null;
        }

        const isPasswordValid = await bcryptjs.compare(
          password,
          user.password
        );

        if (!isPasswordValid) {
          recordLoginFailure(rateLimitKey);
          return null;
        }

        resetLoginRateLimit(rateLimitKey);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          region: user.region,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.region = (user as any).region;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as any).role = token.role;
        (session.user as any).region = token.region;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 保持登录 30 天
  },
});
