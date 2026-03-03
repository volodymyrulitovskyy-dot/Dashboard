import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";

export default withAuth(
  function middleware() {
    const response = NextResponse.next();
    response.headers.set("x-request-id", crypto.randomUUID());
    response.headers.set("x-powered-by", "netsuite-portal");
    return response;
  },
  {
    callbacks: {
      authorized: ({ token }) => Boolean(token),
    },
    pages: {
      signIn: "/signin",
    },
  },
);

export const config = {
  matcher: ["/dashboard/:path*", "/api/teams/:path*"],
};
