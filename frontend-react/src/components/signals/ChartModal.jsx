// ChartModal — a flow chart, opened up.
//
// The panels live above a signal table, so their plots have to stay short
// enough not to push it off the screen. That is the right call inline and the
// wrong one when somebody actually wants to read the chart: at 640x320 with 223
// points, most dots are three pixels and only thirty can carry a name.
//
// Expanding is not a zoom. The large geometry is nearly four times the area, so
// the marks grow, the logos appear, and the label placer — which only keeps
// what fits without colliding — finds room for two or three times as many
// names. The same component draws both; only the geometry changes.

import Modal from "../ui/Modal";

export default function ChartModal({ isOpen, onClose, eyebrow, title, subtitle, controls, children, footer }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="desk"
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
    >
      <div className="space-y-3">
        {controls ? <div className="flex flex-wrap items-center gap-2">{controls}</div> : null}
        {children}
        {footer}
      </div>
    </Modal>
  );
}
