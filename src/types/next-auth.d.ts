import 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
      restaurantId?: string
      role?: string
      nom: string
      avatarColor: string
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string
    restaurantId?: string
    role?: string
    nom?: string
    avatarColor?: string
  }
}
