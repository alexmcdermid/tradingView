import { clearAuthToken, getAuthToken, setAuthToken } from "../auth/authToken";
import { describe, it, expect, beforeEach } from "vitest";

describe("authToken storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("stores auth tokens in localStorage", () => {
    setAuthToken("token-1");

    expect(window.localStorage.getItem("auth_id_token")).toBe("token-1");
    expect(getAuthToken()).toBe("token-1");
  });

  it("clears tokens from localStorage", () => {
    window.localStorage.setItem("auth_id_token", "persisted");

    clearAuthToken();

    expect(window.localStorage.getItem("auth_id_token")).toBeNull();
  });
});
