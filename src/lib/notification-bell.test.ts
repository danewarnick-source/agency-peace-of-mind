import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function read(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

describe("Admin notification bell", () => {
  it("portals the list out of the clipped Admin chrome header", () => {
    const bell = read("../components/NotificationBell.tsx");
    assert.match(bell, /from ["']@\/components\/ui\/popover["']/);
    assert.match(bell, /<Popover/);
    assert.match(bell, /<PopoverTrigger asChild>/);
    assert.match(bell, /<PopoverContent/);
    assert.doesNotMatch(bell, /absolute right-0 top-11/);
    assert.match(bell, /pointer-events-auto/);
    assert.match(bell, /\[&_svg\]:pointer-events-none/);
  });

  it("keeps the Admin-only mount and the chrome conditions that clip in-tree panels", () => {
    const shell = read("../routes/dashboard.tsx");
    assert.match(
      shell,
      /isAdminCapable && effectiveView === "admin" && \(\s*<NotificationBell/,
    );
    assert.match(shell, /backdropFilter: "blur\(12px\)"/);
    assert.match(
      shell,
      /<div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">/,
    );
    assert.doesNotMatch(shell, /effectiveView === "staff" && <NotificationBell/);
  });
});
