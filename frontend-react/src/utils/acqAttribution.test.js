import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const funnel = vi.hoisted(() => ({ trackFunnel: vi.fn() }));

vi.mock("./funnelAnalytics", () => ({
  trackFunnel: funnel.trackFunnel,
}));

import { captureAcqFromUrl, getStoredAcq } from "./acqAttribution";

function makeStorage() {
  let data = {};

  return {
    getItem: (key) =>
      Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null,
    setItem: (key, value) => {
      data[key] = String(value);
    },
    removeItem: (key) => {
      delete data[key];
    },
    clear: () => {
      data = {};
    },
  };
}

describe("acquisition attribution", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeStorage());
    vi.stubGlobal("sessionStorage", makeStorage());
    vi.stubGlobal("window", {
      location: {
        pathname: "/",
        search:
          "?utm_source=telegram&utm_medium=paid_social&utm_campaign=tg-channel-scale-aug26&utm_content=central-pin-v1",
      },
    });
    vi.stubGlobal("document", { referrer: "" });
    funnel.trackFunnel.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("captures the central Telegram pin as first-touch attribution", () => {
    const acquisition = captureAcqFromUrl();

    expect(acquisition).toEqual({
      source: "telegram",
      medium: "paid_social",
      campaign: "tg-channel-scale-aug26",
      content: "central-pin-v1",
      path: "/",
    });
    expect(getStoredAcq()).toEqual({
      ...acquisition,
      ts: expect.any(String),
    });
    expect(funnel.trackFunnel).toHaveBeenCalledWith("acq_land", {
      source: "telegram",
      path: "/",
      meta: {
        medium: "paid_social",
        campaign: "tg-channel-scale-aug26",
        content: "central-pin-v1",
      },
    });
  });

  it("keeps the original first touch when a later campaign arrives", () => {
    captureAcqFromUrl();
    const firstTouch = getStoredAcq();

    window.location.search =
      "?utm_source=telegram&utm_medium=organic&utm_campaign=later&utm_content=other";

    expect(captureAcqFromUrl()).toEqual(firstTouch);
    expect(getStoredAcq()).toEqual(firstTouch);
    expect(funnel.trackFunnel).toHaveBeenCalledTimes(1);
  });
});
