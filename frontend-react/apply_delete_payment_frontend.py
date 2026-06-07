#!/usr/bin/env python3
"""
Batch: Payment void / restore / permanent-delete (frontend).

Patches (idempotent):
  src/services/financeApi.js                         -> voidPayment / restorePayment / deletePayment
  src/components/admin/workspace/finance/icons-supplement.jsx -> TrashIcon / RotateCcwIcon / ArchiveIcon
  src/components/admin/workspace/finance/FinanceFilterBar.jsx -> 'Voided' status option
  src/components/admin/workspace/PaymentDetailPanel.jsx       -> Void/Delete/Restore buttons + handlers

Usage (run from frontend-react/):
    python3 apply_delete_payment_frontend.py
"""
import os

SRC = "src"
API = os.path.join(SRC, "services", "financeApi.js")
ICONS = os.path.join(SRC, "components", "admin", "workspace", "finance", "icons-supplement.jsx")
FILTER = os.path.join(SRC, "components", "admin", "workspace", "finance", "FinanceFilterBar.jsx")
PANEL = os.path.join(SRC, "components", "admin", "workspace", "PaymentDetailPanel.jsx")

changed = []
skipped = []


def patch(path, old, new, marker):
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()
    if marker in src:
        skipped.append(f"{path}: {marker!r} already present")
        return
    if old not in src:
        raise SystemExit(f"ANCHOR NOT FOUND in {path} for marker {marker!r}\n--- expected anchor ---\n{old}")
    if src.count(old) != 1:
        raise SystemExit(f"ANCHOR NOT UNIQUE ({src.count(old)}x) in {path} for marker {marker!r}")
    src = src.replace(old, new, 1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(src)
    changed.append(f"{path}: {marker}")


# ── 1. financeApi.js: 3 new methods (after addNote) ─────────────────
patch(
    API,
    old=(
        "  addNote: async (paymentId, note) => {\n"
        "    const response = await api.post(\n"
        "      `/api/v1/workspace/finance/payments/${paymentId}/note`,\n"
        "      { note }\n"
        "    );\n"
        "    return response.data;\n"
        "  },\n"
    ),
    new=(
        "  addNote: async (paymentId, note) => {\n"
        "    const response = await api.post(\n"
        "      `/api/v1/workspace/finance/payments/${paymentId}/note`,\n"
        "      { note }\n"
        "    );\n"
        "    return response.data;\n"
        "  },\n"
        "\n"
        "  // ════════════════════════════════════\n"
        "  // VOID (soft) / RESTORE / DELETE (hard)\n"
        "  // ════════════════════════════════════\n"
        "  voidPayment: async (paymentId, note = null) => {\n"
        "    const body = note ? { note } : {};\n"
        "    const response = await api.post(\n"
        "      `/api/v1/workspace/finance/payments/${paymentId}/void`,\n"
        "      body\n"
        "    );\n"
        "    return response.data;\n"
        "  },\n"
        "\n"
        "  restorePayment: async (paymentId, note = null) => {\n"
        "    const body = note ? { note } : {};\n"
        "    const response = await api.post(\n"
        "      `/api/v1/workspace/finance/payments/${paymentId}/restore`,\n"
        "      body\n"
        "    );\n"
        "    return response.data;\n"
        "  },\n"
        "\n"
        "  deletePayment: async (paymentId) => {\n"
        "    const response = await api.delete(\n"
        "      `/api/v1/workspace/finance/payments/${paymentId}`\n"
        "    );\n"
        "    return response.data;\n"
        "  },\n"
    ),
    marker="voidPayment:",
)

# ── 2. icons-supplement.jsx: TrashIcon / RotateCcwIcon / ArchiveIcon ─
patch(
    ICONS,
    old=(
        "export const ChevronLeftIcon = (props) => (\n"
        "  <Svg {...props}>\n"
        '    <polyline points="15 18 9 12 15 6" />\n'
        "  </Svg>\n"
        ");\n"
    ),
    new=(
        "export const ChevronLeftIcon = (props) => (\n"
        "  <Svg {...props}>\n"
        '    <polyline points="15 18 9 12 15 6" />\n'
        "  </Svg>\n"
        ");\n"
        "\n"
        "export const TrashIcon = (props) => (\n"
        "  <Svg {...props}>\n"
        '    <polyline points="3 6 5 6 21 6" />\n'
        '    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />\n'
        '    <path d="M10 11v6M14 11v6" />\n'
        '    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />\n'
        "  </Svg>\n"
        ");\n"
        "\n"
        "export const RotateCcwIcon = (props) => (\n"
        "  <Svg {...props}>\n"
        '    <polyline points="1 4 1 10 7 10" />\n'
        '    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />\n'
        "  </Svg>\n"
        ");\n"
        "\n"
        "export const ArchiveIcon = (props) => (\n"
        "  <Svg {...props}>\n"
        '    <polyline points="21 8 21 21 3 21 3 8" />\n'
        '    <rect x="1" y="3" width="22" height="5" />\n'
        '    <line x1="10" y1="12" x2="14" y2="12" />\n'
        "  </Svg>\n"
        ");\n"
    ),
    marker="TrashIcon",
)

# ── 3. FinanceFilterBar.jsx: 'Voided' status option ─────────────────
patch(
    FILTER,
    old=(
        "  { value: 'refunded',  label: 'Refunded' },\n"
        "];\n"
    ),
    new=(
        "  { value: 'refunded',  label: 'Refunded' },\n"
        "  { value: 'voided',    label: 'Voided (deleted)' },\n"
        "];\n"
    ),
    marker="value: 'voided'",
)

# ── 4. PaymentDetailPanel.jsx ───────────────────────────────────────
# 4a. import icons
patch(
    PANEL,
    old="import { XCircleIcon } from './finance/icons-supplement';",
    new="import { XCircleIcon, TrashIcon, RotateCcwIcon, ArchiveIcon } from './finance/icons-supplement';",
    marker="TrashIcon",
)

# 4b. performAction switch: void / restore cases
patch(
    PANEL,
    old=(
        "        case 'refund':\n"
        "          result = await financeApi.refundPayment(payment.id, note);\n"
        "          break;\n"
        "        default:\n"
    ),
    new=(
        "        case 'refund':\n"
        "          result = await financeApi.refundPayment(payment.id, note);\n"
        "          break;\n"
        "        case 'void':\n"
        "          result = await financeApi.voidPayment(payment.id, note);\n"
        "          break;\n"
        "        case 'restore':\n"
        "          result = await financeApi.restorePayment(payment.id, note);\n"
        "          break;\n"
        "        default:\n"
    ),
    marker="case 'void':",
)

# 4c. handlers (before handleCopy)
patch(
    PANEL,
    old=(
        "  const handleCopy = (text) => {\n"
        "    if (navigator.clipboard) {\n"
        "      navigator.clipboard.writeText(String(text)).catch(() => {});\n"
        "    }\n"
        "  };\n"
    ),
    new=(
        "  const handleVoid = () => {\n"
        "    if (!payment) return;\n"
        "    if (\n"
        "      !window.confirm(\n"
        "        `Void payment #${payment.id} from @${payment.user?.username || 'user'}?\\n\\nIt will be hidden from the list but can be restored later.`\n"
        "      )\n"
        "    )\n"
        "      return;\n"
        "    performAction('void', null);\n"
        "  };\n"
        "\n"
        "  const handleRestore = () => {\n"
        "    if (!payment) return;\n"
        "    if (\n"
        "      !window.confirm(\n"
        "        `Restore payment #${payment.id}?\\n\\nIt will reappear in the finance list with its previous status.`\n"
        "      )\n"
        "    )\n"
        "      return;\n"
        "    performAction('restore', null);\n"
        "  };\n"
        "\n"
        "  const handleDelete = async () => {\n"
        "    if (!payment) return;\n"
        "    if (\n"
        "      !window.confirm(\n"
        "        `PERMANENTLY delete payment #${payment.id} from @${payment.user?.username || 'user'}?\\n\\nThis cannot be undone — the record is removed from the database. The user subscription is not affected.`\n"
        "      )\n"
        "    )\n"
        "      return;\n"
        "    setActionBusy('delete');\n"
        "    setError(null);\n"
        "    try {\n"
        "      await financeApi.deletePayment(payment.id);\n"
        "      if (onActionDone) onActionDone();\n"
        "      if (onClose) onClose();\n"
        "    } catch (e) {\n"
        "      setError(e?.response?.data?.detail || 'Delete failed. Please try again.');\n"
        "      setActionBusy(null);\n"
        "    }\n"
        "  };\n"
        "\n"
        "  const handleCopy = (text) => {\n"
        "    if (navigator.clipboard) {\n"
        "      navigator.clipboard.writeText(String(text)).catch(() => {});\n"
        "    }\n"
        "  };\n"
    ),
    marker="const handleVoid",
)

# 4d. danger-zone buttons inside ACTIONS Section
patch(
    PANEL,
    old=(
        "            {!isPending && !isConfirmed && (\n"
        "              <ActionBtn\n"
        "                Icon={EditIcon}\n"
        '                label="Add Note"\n'
        '                tone="gold"\n'
        "                onClick={() => setShowAddNote(true)}\n"
        "                disabled={actionBusy != null}\n"
        "              />\n"
        "            )}\n"
        "          </Section>\n"
    ),
    new=(
        "            {!isPending && !isConfirmed && (\n"
        "              <ActionBtn\n"
        "                Icon={EditIcon}\n"
        '                label="Add Note"\n'
        '                tone="gold"\n'
        "                onClick={() => setShowAddNote(true)}\n"
        "                disabled={actionBusy != null}\n"
        "              />\n"
        "            )}\n"
        "\n"
        "            {/* Danger zone: void (recoverable) / delete (permanent) / restore */}\n"
        "            <div\n"
        '              className="mt-2 pt-2 grid grid-cols-2 gap-2"\n'
        "              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}\n"
        "            >\n"
        "              {p?.is_deleted ? (\n"
        "                <ActionBtn\n"
        "                  Icon={RotateCcwIcon}\n"
        '                  label="Restore"\n'
        '                  tone="success"\n'
        "                  onClick={handleRestore}\n"
        "                  busy={actionBusy === 'restore'}\n"
        "                  disabled={actionBusy != null}\n"
        "                />\n"
        "              ) : (\n"
        "                <ActionBtn\n"
        "                  Icon={ArchiveIcon}\n"
        '                  label="Void"\n'
        '                  tone="muted"\n'
        "                  onClick={handleVoid}\n"
        "                  busy={actionBusy === 'void'}\n"
        "                  disabled={actionBusy != null}\n"
        "                />\n"
        "              )}\n"
        "              <ActionBtn\n"
        "                Icon={TrashIcon}\n"
        '                label="Delete"\n'
        '                tone="danger"\n'
        "                onClick={handleDelete}\n"
        "                busy={actionBusy === 'delete'}\n"
        "                disabled={actionBusy != null}\n"
        "              />\n"
        "            </div>\n"
        "          </Section>\n"
    ),
    marker="Danger zone: void",
)

# ── Report ──────────────────────────────────────────────────────────
print("─" * 60)
for c in changed:
    print("✓", c)
for s in skipped:
    print("•", s)
print("─" * 60)
print(f"✓ Frontend patches applied. ({len(changed)} changed, {len(skipped)} skipped)")
