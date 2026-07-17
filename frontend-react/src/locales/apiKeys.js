// src/locales/apiKeys.js
// Translations untuk halaman API Keys (namespace: apiKeys)

export const apiKeysEn = {
  eyebrow: "Developer",
  title: "API Keys",
  subtitle:
    "Generate keys to pull LuxQuant data into your own bots, agents, or autotrade systems. Each key is long-lived and works only while your subscription is active.",

  // Locked / upsell
  locked_title: "API access requires an active subscription",
  locked_desc:
    "You can create keys, but they will only return data while your subscription is active. Upgrade to start using the data API.",
  upgrade_cta: "Upgrade Plan",

  // Create
  create_title: "Create a new key",
  active: "active",
  name_placeholder: "Key name (e.g. autotrade bot)",
  create_btn: "Generate Key",
  creating: "Generating…",
  limit_warn: "You have reached the maximum of 2 active keys. Revoke one to create another.",

  // Just created
  created_title: "Key created",
  created_warn: "Copy it now — it will not be shown again.",
  copy: "Copy",
  copied: "Copied!",
  dismiss: "Done, I saved it",

  // List
  your_keys: "Your keys",
  empty: "No API keys yet. Generate one above to get started.",
  untitled: "Untitled key",
  status_active: "Active",
  status_revoked: "Revoked",
  created: "Created",
  last_used: "last used",
  never: "never",
  just_now: "just now",
  ago: "ago",
  revoke: "Revoke",
  revoking: "Revoking…",
  confirm_revoke: "Revoke this key? Any bot using it will immediately lose access.",

  // Usage
  usage_title: "How to use",
  usage_desc: "Send your key as a Bearer token on every request:",
  ep_signals: "List / poll signals",
  ep_updates: "TP/SL event feed",
  ep_journey: "Price-action journey",
  ep_enrichment: "Multi-TF analysis",
  ep_corr: "BTC correlation",
  ep_pulse: "Realtime market pulse",
  usage_note:
    "Data starts from the API launch date. Rate limit applies per account. Keep your key secret — treat it like a password.",

  // Errors
  err_load: "Failed to load your keys. Please try again.",
  err_create: "Failed to create key. Please try again.",
  err_revoke: "Failed to revoke key. Please try again.",
};

export const apiKeysZh = {
  eyebrow: "开发者",
  title: "API 密钥",
  subtitle:
    "生成密钥，将 LuxQuant 数据接入您自己的机器人、智能体或自动交易系统。每个密钥长期有效，仅在订阅有效期内可用。",

  locked_title: "API 访问需要有效订阅",
  locked_desc: "您可以创建密钥，但只有在订阅有效期内才能返回数据。升级后即可使用数据 API。",
  upgrade_cta: "升级套餐",

  create_title: "创建新密钥",
  active: "个有效",
  name_placeholder: "密钥名称（例如：自动交易机器人）",
  create_btn: "生成密钥",
  creating: "生成中…",
  limit_warn: "已达到 2 个有效密钥上限。请先撤销一个再创建。",

  created_title: "密钥已创建",
  created_warn: "请立即复制——此密钥不会再次显示。",
  copy: "复制",
  copied: "已复制！",
  dismiss: "完成，我已保存",

  your_keys: "您的密钥",
  empty: "还没有 API 密钥。在上方生成一个开始使用。",
  untitled: "未命名密钥",
  status_active: "有效",
  status_revoked: "已撤销",
  created: "创建于",
  last_used: "最后使用",
  never: "从未",
  just_now: "刚刚",
  ago: "前",
  revoke: "撤销",
  revoking: "撤销中…",
  confirm_revoke: "确定撤销此密钥？正在使用它的机器人将立即失去访问权限。",

  usage_title: "使用方法",
  usage_desc: "在每个请求中以 Bearer 令牌方式发送您的密钥：",
  ep_signals: "列出 / 轮询信号",
  ep_updates: "TP/SL 事件流",
  ep_journey: "价格行为历程",
  ep_enrichment: "多周期分析",
  ep_corr: "BTC 相关性",
  ep_pulse: "实时市场脉动",
  usage_note: "数据从 API 上线日期开始提供。速率限制按账户计算。请妥善保管密钥——像对待密码一样。",

  err_load: "加载密钥失败，请重试。",
  err_create: "创建密钥失败，请重试。",
  err_revoke: "撤销密钥失败，请重试。",
};
