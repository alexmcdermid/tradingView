import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("admin", "routes/admin.tsx"),
  route("share/:code?", "routes/share.tsx"),
  route("share-image/:code?", "routes/share-image.tsx"),
] satisfies RouteConfig;
