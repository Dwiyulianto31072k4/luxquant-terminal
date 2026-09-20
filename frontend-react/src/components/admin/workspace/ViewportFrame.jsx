// ════════════════════════════════════════════════════════════════════
// ViewportFrame — render live React children at a real viewport size.
//
// A preview box sized with CSS cannot show what a phone shows. Tailwind's
// `sm:` is `@media (min-width: 640px)`, which asks the WINDOW, not the
// element — so a 390px-wide div inside a desktop admin page still renders
// every `sm:` rule. The campaign card differs on seven of them (sheet vs
// floating card, corner radius, grabber, title size, three paddings), so an
// inline preview would have shown the desktop card twice and called one of
// them "mobile".
//
// An iframe has its own viewport. Media queries, `dvh`, `vh` and safe-area
// insets all resolve against the frame, so the card inside behaves exactly
// as it would on a device of that size. Children are portalled into the
// frame's document, which keeps them part of this React tree: the form's
// state still drives them with no postMessage and no re-navigation.
// ════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const ViewportFrame = ({ width, height, scale = 1, theme, children }) => {
  const ref = useRef(null);
  const [body, setBody] = useState(null);

  useEffect(() => {
    const frame = ref.current;
    const doc = frame?.contentDocument;
    if (!doc) return;

    // Cleared first so this is idempotent — StrictMode runs effects twice,
    // and the theme change below re-runs it.
    doc.head.innerHTML = "";

    // The frame is about:blank, so root-relative urls in the stylesheet
    // (`/fonts/...`) have no origin to resolve against and every @font-face
    // would silently fail — the preview would render in a fallback face.
    const base = doc.createElement("base");
    base.setAttribute("href", `${window.location.origin}/`);
    doc.head.appendChild(base);

    // Dev serves injected <style> tags, production a single <link>. Clone
    // whatever this page actually has rather than guessing.
    document
      .querySelectorAll('link[rel="stylesheet"], style')
      .forEach((node) => doc.head.appendChild(node.cloneNode(true)));

    doc.documentElement.setAttribute(
      "data-theme",
      theme || document.documentElement.getAttribute("data-theme") || "",
    );
    doc.body.style.margin = "0";
    doc.body.style.background = "transparent";
    setBody(doc.body);
  }, [theme]);

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{
        width: width * scale,
        height: height * scale,
        border: "1px solid rgb(var(--ink) / 0.10)",
      }}
    >
      <iframe
        ref={ref}
        title="preview"
        width={width}
        height={height}
        style={{
          border: 0,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          display: "block",
        }}
      />
      {body && createPortal(children, body)}
    </div>
  );
};

export default ViewportFrame;
