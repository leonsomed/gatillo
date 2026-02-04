import { useEffect } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/home";
import { useAuth } from "~/AuthContext";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "gatillo" },
    { name: "description", content: "Welcome to gatillo" },
  ];
}

export function loader({ context }: Route.LoaderArgs) {
  return { message: context.VALUE_FROM_EXPRESS };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const auth = useAuth();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token");
    if (!token) {
      return;
    }

    url.searchParams.delete("token");
    window.history.replaceState({}, "", url.toString());
  }, []);

  return (
    <div className="container">
      <h1>Welcome to gatillo</h1>
      {auth.isLoading ? (
        <p>Checking sign-in status...</p>
      ) : auth.isAuthenticated ? (
        <p>Signed in{auth.user?.email ? ` as ${auth.user.email}` : ""}</p>
      ) : (
        <p>Not signed in.</p>
      )}
      {auth.error ? <p>{auth.error}</p> : null}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <p>
          <Link to="/triggers/claim" role="button">
            Claim trigger
          </Link>
        </p>

        {!auth.isLoading && auth.isAuthenticated ? (
          <p>
            <Link to="/triggers" role="button">
              Manage triggers
            </Link>
          </p>
        ) : null}
        {!auth.isLoading && auth.isAuthenticated ? (
          <p>
            <button type="button" onClick={() => void auth.logout()}>
              Sign out
            </button>
          </p>
        ) : null}
        {!auth.isLoading && !auth.isAuthenticated ? (
          <p>
            <Link to="/sign-in" role="button">
              Sign in
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
