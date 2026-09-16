import { renderToString } from "react-dom/server";
import { describe, it, expect } from "vitest";

// Imported WITHOUT an extension on purpose: this is the only .jsx in utils/,
// so nothing else in the repo proves that resolution works. If a bundler config
// ever narrows resolve.extensions, this fails here rather than white-screening
// the chat panel, the login page, the claim page and the help modal at once.
import { TELEGRAM_ADMIN_HANDLE, TELEGRAM_ADMIN_URL, TelegramGlyph } from "./supportContact";

describe("support contact", () => {
  it("resolves the module and points at the support account", () => {
    expect(TELEGRAM_ADMIN_HANDLE).toBe("luxquantadmin");
    expect(TELEGRAM_ADMIN_URL).toBe("https://t.me/luxquantadmin");
  });

  it("renders a glyph that inherits the button colour", () => {
    const html = renderToString(<TelegramGlyph />);
    // currentColor is the whole point — the mark sits on a gold button in the
    // chat panel and on a light surface elsewhere.
    expect(html).toContain('fill="currentColor"');
    expect(html).toContain("<path");
    expect(html).toContain('aria-hidden="true"');
  });

  it("takes a size override", () => {
    expect(renderToString(<TelegramGlyph className="h-5 w-5" />)).toContain("h-5 w-5");
  });
});
