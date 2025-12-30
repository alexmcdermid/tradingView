import { request } from "./client";
import type { AdminUser } from "./types";

export async function fetchUsers() {
  return request<AdminUser[]>("/admin/users");
}
