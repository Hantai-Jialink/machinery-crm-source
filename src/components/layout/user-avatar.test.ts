import { describe, expect, it } from "vitest";
import { getUserAvatarColor, getUserInitial } from "./user-avatar";

describe("initial-based user avatar", () => {
  it("uses the first Unicode character of the display name", () => {
    expect(getUserInitial(" 张三 ", "zhang@example.com")).toBe("张");
    expect(getUserInitial("", "sales@example.com")).toBe("S");
  });

  it("maps the same user id to a stable presentation color", () => {
    expect(getUserAvatarColor("user-42")).toBe(getUserAvatarColor("user-42"));
    expect(getUserAvatarColor("user-42")).toMatch(/^bg-/);
  });
});
