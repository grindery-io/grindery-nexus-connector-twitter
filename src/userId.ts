import { apiCall429Aware } from "./api";
import { createCache } from "./cache";
import { UserResponse } from "./types";

const userIdCache = createCache<string>();
export async function getApiUserId(cdsName: string, authToken: string) {
  return userIdCache(
    authToken,
    async () => (await apiCall429Aware<UserResponse>(cdsName, authToken, "2/users/me")).data.id
  );
}
export async function getUserIdByHandle(cdsName: string, authToken: string, handle: string) {
  handle = handle.trim().toLowerCase();
  return userIdCache(
    "/users/by/username/" + encodeURIComponent(handle),
    async () => (await apiCall429Aware<UserResponse>(cdsName, authToken, "2/users/me")).data.id
  );
}
