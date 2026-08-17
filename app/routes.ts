import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("admin", "routes/admin.tsx"),
  route("pro", "routes/pro.tsx"),
  route("privacy-policy", "routes/privacy-policy.tsx"),
  route("share/:code?", "routes/share.tsx"),
  route("share-image/:code?", "routes/share-image.tsx"),
  route("terms-of-service", "routes/terms-of-service.tsx"),
] satisfies RouteConfig;
