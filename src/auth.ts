import NextAuth from 'next-auth'
import { authConfig } from '@/auth.config'
import { prisma } from '@/lib/db/prisma'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await prisma.user.upsert({
          where: { email: user.email },
          update: { lastLoginAt: new Date() },
          create: {
            email: user.email,
            nom: user.name ?? user.email,
          },
          include: {
            memberships: {
              orderBy: { joinedAt: 'asc' },
              take: 1,
            },
          },
        })

        token.userId = dbUser.id
        token.nom = dbUser.nom
        token.avatarColor = dbUser.avatarColor

        const membership = dbUser.memberships[0]
        if (membership) {
          token.restaurantId = membership.restaurantId
          token.role = membership.role
        }
      } else if (token.userId && !token.restaurantId) {
        // Membership créée après le login (onboarding) — on la récupère au prochain refresh
        const membership = await prisma.membership.findFirst({
          where: { userId: token.userId as string },
          orderBy: { joinedAt: 'asc' },
        })
        if (membership) {
          token.restaurantId = membership.restaurantId
          token.role = membership.role
        }
      }
      return token
    },
  },
})
