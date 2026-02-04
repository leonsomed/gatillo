import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("sign-in", "routes/sign-in.tsx"),
  route("triggers", "routes/triggers.tsx"),
  route("triggers/claim", "routes/triggers.claim.file.tsx"),
  route("triggers/claim/:triggerId", "routes/triggers.claim.$triggerId.tsx"),
] satisfies RouteConfig;
