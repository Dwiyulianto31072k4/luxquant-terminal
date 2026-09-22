import api from "./api";

// Can @LuxQuantTerminalBot write to the signed-in account right now?
// { linked, ready, unknown } — see TelegramConnectModal.
export async function telegramCheck() {
  const { data } = await api.post("/signal-filters/telegram-check");
  return data;
}
