import NextAuth from 'next-auth'
import { authConfig } from '@/auth.config'
import { NextResponse } from 'next/server'

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const user = req.auth?.user as { restaurantId?: string } | undefined
  const isLoggedIn = !!req.auth
  const hasRestaurant = !!user?.restaurantId
  const { pathname } = req.nextUrl

  // Not logged in → /login (sauf pages publiques)
  if (!isLoggedIn && pathname !== '/login' && !pathname.startsWith('/reservation')) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Logged in but no restaurant → /onboarding
  if (isLoggedIn && !hasRestaurant && !pathname.startsWith('/onboarding')) {
    return NextResponse.redirect(new URL('/onboarding', req.url))
  }

  // Fully set up but on login or onboarding → /dashboard
  if (isLoggedIn && hasRestaurant && (pathname === '/login' || pathname.startsWith('/onboarding'))) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon\\.ico).*)'],
}
