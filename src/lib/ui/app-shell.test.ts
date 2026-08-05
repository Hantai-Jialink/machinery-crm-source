import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function navItemsBlock(input: string) {
  const match = input.match(/(?:export )?const navItems: NavItem\[\] = \[[\s\S]*?\n\];/);
  if (!match) throw new Error("navItems block not found");
  return match[0].replace(/^export /, "").replace(/\r\n/g, "\n");
}

function navigationFilterBlock(input: string) {
  const match = input.match(
    /const canViewErpModule = canViewERP\(userRole \|\| ""\);[\s\S]*?\n  \}\);/,
  );
  if (!match) throw new Error("navigation filter block not found");
  return match[0].replace(/\r\n/g, "\n");
}

describe("UI-M1 app shell contracts", () => {
  it("copies the complete legacy navigation contract without changing it", () => {
    const legacy = source("src/components/layout/sidebar.tsx");
    const floating = source("src/components/layout/floating-sidebar.tsx");

    expect(navItemsBlock(floating)).toBe(navItemsBlock(legacy));
    expect((navItemsBlock(floating).match(/^  \{ href:/gm) || [])).toHaveLength(7);
    expect(floating).toContain("canViewERP(userRole || \"\")");
    expect(navigationFilterBlock(floating)).toBe(navigationFilterBlock(legacy));
  });

  it("delegates responsive offsets and mobile navigation to AppShell", () => {
    const layout = source("src/app/(app)/layout.tsx");
    const shell = source("src/components/layout/app-shell.tsx");
    const mobile = source("src/components/layout/mobile-navigation.tsx");

    expect(layout).toContain("<AppShell>");
    expect(layout).not.toContain("lg:pl-60");
    expect(shell).toContain('"dachuan.sidebar.collapsed"');
    expect(shell).toContain("<MobileNavigation");
    expect(mobile).not.toContain("localStorage");
  });

  it("uses existing task and health endpoints without adding search behavior", () => {
    const topbar = source("src/components/layout/topbar.tsx");
    const sidebar = source("src/components/layout/floating-sidebar.tsx");

    expect(topbar).toContain('fetch("/api/system/tasks?view=inbox"');
    expect(topbar).toContain('href="/tasks"');
    expect(topbar).toContain('type="search"');
    expect(topbar).not.toContain('href: `/${segments');
    expect(topbar).toContain('"master-data": "基础资料中心"');
    expect(sidebar).toContain('fetch("/api/system/health"');
    expect(sidebar).not.toContain("{statusText}</p>");
  });

  it("connects theme controls to the M0 theme utility", () => {
    const control = source("src/components/layout/theme-control.tsx");

    expect(control).toContain("getStoredTheme");
    expect(control).toContain("setStoredTheme");
    expect(control).toContain("applyTheme");
    expect(control).toContain("SegmentedControl");
  });
});
