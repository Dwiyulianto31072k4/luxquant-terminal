// ════════════════════════════════════════════════════════════════
// LuxQuant — global stacking ladder for overlays / modals.
// Keep nested dialogs ABOVE their parent shell so CTAs stay visible.
// ════════════════════════════════════════════════════════════════
//
// 50–100 App chrome (side nav mobile, landing CTA bar)
// 9_000–10k Page-level light overlays (tips, resources)
// 100_000 Standard page modals (Modal default, AutoTrade, Pulse)
// 150_000 Large drawers that can host SignalModal (EdgeLab drill)
// 200_000 SignalModal / Called status sheet (full-screen shells)
// 210_000 Nested on top of SignalModal (Deep Analysis, Coin Utility…)
// 300_000 Lightbox / absolute top (fullscreen image)
//
// Never put a nested modal BELOW its parent. Production bug class:
// SignalModal @ 200k hid DeepAnalysis @ 150k → "button does nothing".

export const Z = {
  chrome: 50,
  pageOverlay: 9999,
  modal: 100_000,
  drawer: 150_000,
  signalShell: 200_000,
  nestedModal: 210_000,
  lightbox: 300_000,
};

export default Z;
