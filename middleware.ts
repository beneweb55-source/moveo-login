import NextAuth from "next-auth";
import { auth } from "@/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { nextUrl } = req;

  const isProtectedRoute = ["/profile", "/watchlist", "/settings"].some((route) =>
    nextUrl.pathname.startsWith(route)
  );

  if (isProtectedRoute && !isLoggedIn) {
    return Response.redirect(new URL("/login", nextUrl));
  }

  return;
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
