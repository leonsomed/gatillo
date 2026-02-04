import { useEffect } from "react";
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
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <h1 className="mb-3 text-3xl font-semibold">Welcome to gatillo</h1>
      {auth.isLoading ? (
        <p className="text-slate-300">Checking sign-in status...</p>
      ) : auth.isAuthenticated ? (
        <p className="text-slate-300">
          Signed in{auth.user?.email ? ` as ${auth.user.email}` : ""}
        </p>
      ) : (
        <p className="text-slate-300">Not signed in.</p>
      )}
      {auth.error ? <p className="mt-3 text-red-300">{auth.error}</p> : null}
    </div>
  );
}
