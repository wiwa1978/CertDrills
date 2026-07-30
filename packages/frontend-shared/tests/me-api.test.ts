import { describe, expect, it, vi } from "vitest";

import { createMeApi } from "../src/me-api";

describe("createMeApi data export helpers", () => {
  it("calls the data export endpoints with encoded ids and tokens", async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => ({ path, init }));
    const me = createMeApi(request);

    await expect(me.listDataExports()).resolves.toEqual({ path: "/me/data-exports", init: undefined });
    await expect(me.createDataExport()).resolves.toEqual({ path: "/me/data-exports", init: { method: "POST" } });
    await expect(me.cancelDataExport("export/1")).resolves.toEqual({
      path: "/me/data-exports/export%2F1",
      init: { method: "DELETE" },
    });
    await expect(me.downloadDataExport("export/1", "token&value")).resolves.toEqual({
      path: "/me/data-exports/export%2F1/download?token=token%26value",
      init: undefined,
    });
  });
});
