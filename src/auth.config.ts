import type { NextAuthConfig } from 'next-auth'
import MicrosoftEntraId from 'next-auth/providers/microsoft-entra-id'

export const authConfig: NextAuthConfig = {
  providers: [
    MicrosoftEntraId({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: { strategy: 'jwt' },
  callbacks: {
    async signIn({ user }) {
      const email = user.email ?? ''
      return email.endsWith('@le-robin.fr') || email.endsWith('@lerobin78.onmicrosoft.com')
    },
    session({ session, token }) {
      // Expose restaurantId and role from JWT so middleware can read them in Edge runtime
      if (token.userId) {
        session.user.id = token.userId as string
        session.user.nom = (token.nom as string) ?? session.user.name ?? ''
        session.user.avatarColor = (token.avatarColor as string) ?? '#9F1239'
      }
      if (token.restaurantId) {
        session.user.restaurantId = token.restaurantId as string
        session.user.role = token.role as string
      }
      return session
    },
  },
}
