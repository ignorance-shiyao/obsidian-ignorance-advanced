import { describe, it, expect, vi } from "vitest";
import { installAppearanceControls } from "./appearance";

describe("palette entry points on desktop", () => {
  it("registers a ribbon icon so the palette is reachable without the vault-profile button", () => {
    const el = () => ({ dataset: {}, style: { setProperty() {}, removeProperty() {} }, classList: { contains: () => false, add() {}, remove() {}, toggle() {} } });
    vi.stubGlobal("document", { querySelectorAll: () => [], documentElement: el(), body: el() });
    vi.stubGlobal("MutationObserver", class { observe() {} disconnect() {} });
    vi.stubGlobal("window", { setTimeout, dispatchEvent() {} });
    vi.stubGlobal("CustomEvent", class {});
    vi.stubGlobal("Event", class {});
    const addRibbonIcon = vi.fn(() => ({ addClass() {} }));
    const plugin = {
      app: { workspace: { on: () => ({}) }, vault: { getConfig: () => undefined } },
      state: { appearance: {}, accent: "azure" },
      addCommand: vi.fn(), addRibbonIcon, registerEvent: vi.fn(), register: vi.fn(), registerDomEvent: vi.fn(), saveStoredState: vi.fn()
    };
    try { installAppearanceControls(plugin as never); } catch (e) { throw new Error(`install failed before the ribbon call: ${String(e)}`); }
    expect(addRibbonIcon).toHaveBeenCalledWith("lucide-palette", expect.any(String), expect.any(Function));
  });
});
