import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { AuthProvider, useAuth } from "./AuthContext";
import tailwindStyles from "./tailwind.css?url";

import type { Route } from "./+types/root";

export const links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: tailwindStyles },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="bg-slate-900 text-slate-200 antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

function AppShell() {
  const auth = useAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-950/80">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-lg font-semibold text-slate-100">
              gatillo
            </Link>
            <nav className="flex items-center gap-4 text-sm font-semibold text-slate-300">
              {auth.isAuthenticated ? (
                <NavLink
                  to="/triggers"
                  end
                  className={({ isActive }) =>
                    isActive ? "text-sky-500" : "hover:text-slate-100"
                  }
                >
                  Triggers
                </NavLink>
              ) : null}
              <NavLink
                to="/triggers/claim"
                end
                className={({ isActive }) =>
                  isActive ? "text-sky-500" : "hover:text-slate-100"
                }
              >
                Claim
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {auth.isLoading ? (
              <span className="text-sm text-slate-400">
                Checking sign-in status...
              </span>
            ) : auth.isAuthenticated ? (
              <>
                <span className="text-sm text-slate-300">
                  Hello {auth.user?.email ?? "there"}
                </span>
                <button
                  type="button"
                  onClick={() => void auth.logout()}
                  className="cursor-pointer inline-flex items-center justify-center rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                to="/sign-in"
                role="button"
                className="cursor-pointer inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <h1 className="mb-3 text-3xl font-semibold">{message}</h1>
      <p className="text-slate-300">{details}</p>
      {stack && (
        <pre className="mt-4 w-full overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs text-slate-200">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
