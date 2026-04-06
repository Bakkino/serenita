export { default } from "next-auth/middleware";

// Protegge tutte le pagine tranne login, callback, privacy, terms e asset statici
export const config = {
  matcher: [
    "/((?!login|api/auth|api/callback|api/banking/sync|privacy|terms|_next/static|_next/image|favicon.ico).*)",
  ],
};
