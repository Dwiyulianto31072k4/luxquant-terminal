// src/locales/pricing.js
// Calm, precise — Claude / ChatGPT / Kimi tone. No staff jargon.
// Paid plans are the same product; only billing and support differ.
// Do not promise refunds (T&C: non-refundable except where required by law).
// Do not invent auto-renewal — each cycle is a new on-chain payment.

export const pricingEn = {
  premium_access: "Premium access",
  upgrade_to: "Upgrade to",
  switch: "Switch",
  premium: "Premium",
  subtitle: "Live signal levels, the full terminal, and research.",
  subscribing_to: "Currently on",
  days_remaining: "days remaining",
  lifetime_label: "Lifetime",

  hero_eyebrow: "Pricing",
  // Written from the reader's side. Someone landing here is asking, in this
  // order: what do I get for paying, can I trust these people, and is there a
  // catch. "The same terminal on every paid plan" answered a question that
  // only matters AFTER they want it, so it moved down to the facts row.
  //
  // The headline leads with the thing no screenshot-signal group offers: every
  // call carries its levels AND its proof — "proof" is the product's own word,
  // the same one the Signals board uses, so the page and the app agree.
  // One line, so the headline reads as a sentence instead of a narrow block
  // stacked in the middle of a wide page.
  hero_title_line1: "Every call, with its proof.",
  hero_title_line2: "",
  // The subtitle has two audiences in the same two lines. Someone new needs to
  // be told what a "call" even is — it is the word the whole product uses and
  // nowhere on this page defined it. Someone experienced needs the specifics:
  // entry, targets, stop, and a record that keeps the losses. Saying it in
  // plain words costs the expert nothing; leaving it out costs the beginner
  // the whole page.
  hero_subtitle:
    "A call is a trade we publish. You see the coin, where to enter, where to take profit and where to stop, the moment it prints. Every call stays on the public record, win or lose.",

  monthly: "Monthly",
  yearly: "Annual",
  lifetime: "Lifetime",

  monthly_desc: "Each cycle. No auto-renewal.",
  yearly_desc: "Twelve months. Best value.",
  // 500 against 12 x 50 = 600. Keep this in step with the plan prices in
  // the database — an overstated saving is a claim we cannot support.
  yearly_save: "Save 17%",
  lifetime_desc: "Pay once. Keep access.",
  best_value: "Best value",

  per_month: "/ month",
  per_year: "/ year",
  one_time: "one-time",
  billed_yearly: "billed annually",
  equiv_month: "≈ ${{price}} / mo",
  free_forever: "Free forever",

  // One sentence per benefit: what the reader actually gets, not a label.
  featd_signals: "Entry, targets and stop on every call, the moment it prints.",
  featd_market: "See which of today's movers we called, marked on the chart.",
  featd_onchain_ai: "Flows, risk and written research in the same workspace.",
  featd_basic_support: "A person answers, usually the same day.",
  featd_support: "Your messages go to the front of the queue.",
  featd_requests: "Ask for a coin, a screen, or Agent access, and we build around it.",
  featd_vip_support: "A direct line, with your account already in front of us.",
  featd_lifetime: "Every feature we ship from here, at no extra cost.",
  free_featd_1: "Live prices, the market tables, and today's movers.",
  free_featd_2: "Every call we have published, with the chart it was called on.",
  free_featd_3: "Market news and your own trade journal.",
  inherits_monthly: "Everything in Monthly, plus",
  inherits_yearly: "Everything in Annual, plus",
  cta_note_paid: "No auto-renewal. No card on file.",
  cta_note_free: "No card. Upgrade whenever.",

  feat_signals: "Live signal levels",
  feat_analytics: "Full charts and analytics",
  feat_performance: "Performance tools",
  feat_market: "Called overlay on Pulse",
  feat_support: "Priority support",
  feat_basic_support: "Standard support",
  feat_lifetime: "Ongoing product updates",
  feat_autotrade: "Agent, on request",
  feat_onchain: "On-chain intelligence",
  feat_ai: "AI research",
  feat_onchain_ai: "On-chain & AI research",
  feat_everything_free: "Everything on Free",
  feat_everything_monthly: "Everything in Monthly",
  feat_everything_yearly: "Everything in Annual",
  feat_requests: "Special requests, including Agent",
  feat_vip_support: "Dedicated support",

  free_name: "Free",
  free_desc: "Look around. Audit the record.",
  free_price: "0",
  free_cta: "Continue free",
  free_feat_1: "Pulse, Bitcoin & Markets",
  free_feat_2: "Public track record",
  free_feat_3: "News and journal",
  free_feat_4: "Product updates",

  select_plan: "Get started",
  continue_payment: "Continue to payment",
  current_plan: "Your plan",
  upgrade: "Upgrade",
  downgrade: "Switch plan",
  switch_plan: "Switch plan",
  processing: "Creating invoice…",
  upgrade_pay: "Upgrade",
  switch_pay: "Switch plan",
  get_monthly: "Get Monthly",
  get_yearly: "Get Annual",
  get_lifetime: "Get Lifetime",
  subscribe_via_admin: "Pay another way",
  or: "or",
  active: "Active",
  youre_subscribed: "Active subscription",

  same_product: "Paid plans are the same product. Billing and support differ.",

  // Four facts, each answering a doubt a reader actually arrives with:
  // are they new, do I get a lesser product on the cheap plan, will this
  // charge me again, and how long until I am in.
  trust_record: "Public record since 2023",
  trust_same: "Same terminal on every plan",
  trust_norenew: "No auto-renewal",
  trust_speed: "Access in about a minute",
  trust_since: "Since 2023",
  trust_since_body: "Timestamped calls you can audit.",
  trust_pay: "On-chain USDT",
  trust_pay_body: "Unique address. Opens on confirm.",
  trust_keys: "No auto-renewal",
  trust_keys_body: "No card on file.",

  agent_note: "Need automation? Agent comes on request with Annual or Lifetime. Tell us what you want it to do and we will set it up with you.",
  agent_note_cta: "Request Agent",
  agent_yearly_only: "Annual & Lifetime",
  compare_requests_yes: "On request",

  how_title: "How payment works",
  how_subtitle: "No card. No auto-charge. You send USDT; the chain confirms; access opens.",
  how_1_title: "Choose a plan",
  how_1_body: "We open an invoice with a unique receiving address, issued for this payment only.",
  how_2_title: "Send the exact USDT",
  how_2_body: "BNB Smart Chain (BEP-20) only. Copy the address from this site after you sign in, never from a message.",
  how_3_title: "Paste the transaction hash",
  how_3_body: "We verify it on-chain. Most payments confirm in under a minute. Access opens immediately.",

  pay_other_title: "Prefer a bank transfer or another network?",
  pay_other_body: "We’ll match the payment by hand. Same plan, same price.",
  pay_other_cta: "Message us on Telegram",

  compare_title: "What’s included",
  compare_subtitle: "One look. Free vs paid vs Annual extras.",
  compare_note:
    "Monthly, Annual, and Lifetime unlock the same terminal. Special requests (including Agent) start at Annual. Nothing auto-renews.",
  compare_feature: "Capability",
  compare_signals: "Live signal levels",
  compare_signals_hint: "Entry, targets, and stop as each call prints.",
  compare_called: "Called overlay on Pulse",
  compare_called_hint: "See which movers we actually called.",
  compare_autotrade: "Agent (automation)",
  compare_autotrade_hint: "On request, with Annual and Lifetime. If you need it, we can help.",
  compare_analytics: "Charts and analytics",
  compare_analytics_hint: "Full terminal on paid. Public views on Free.",
  compare_onchain: "On-chain intelligence",
  compare_onchain_hint: "Flows and risk in the same workspace.",
  compare_ai: "AI research",
  compare_ai_hint: "Research next to the call.",
  compare_performance: "Performance tools",
  compare_performance_hint: "Public record on Free. Full tools on paid.",
  compare_support: "Support",
  compare_support_std: "Standard",
  compare_support_prio: "Priority",
  compare_support_vip: "Dedicated",
  compare_updates: "Updates",
  compare_updates_sub: "While active",
  compare_updates_life: "Ongoing",

  payment_title: "Payment",
  payment_desc: "USDT on BNB Smart Chain (BEP-20). Verified on-chain. Activated automatically.",
  auto_verify: "On-chain verification",
  usdt_bep20: "USDT · BEP-20",
  instant_act: "Opens on confirm",
  trust_cancel: "No auto-renewal. No card on file.",
  trust_secure: "Unique address per invoice",
  trust_support: "A person if the chain cannot match it",

  // "Not ready yet" block — the free ways to keep watching the record.
  notready_title: "Not ready to pay yet?",
  notready_sub: "Watch the record for a while. Nothing here asks for a card.",
  notready_free_t: "Open a free account",
  notready_free_b:
    "Pulse, Bitcoin, the market tables, and the full public record of every call we have published.",
  notready_free_c: "Create free account",
  notready_tg_t: "Follow the free channel",
  notready_tg_b:
    "A share of the calls, posted as they print, with the chart each one was called on.",
  notready_tg_c: "Open on Telegram",
  notready_x_t: "Follow on X",
  notready_x_b: "Results as they resolve, including the ones that did not work.",
  notready_x_c: "Open on X",
  faq_title: "Questions",
  faq_subtitle: "",
  faq_q1: "What’s free, and what do I pay for?",
  faq_a1:
    "Free gives you the market and the history. Pulse, Bitcoin, the market tables, News, your own journal, and every call we have ever published with the chart it was called on. What free does not give you is the live part. Paying opens the levels on each new call as it prints, the Called overlay that marks which of today\u2019s movers were ours, on-chain flows, AI research, and the rest of the terminal.",
  faq_q2: "What’s the difference between Monthly, Annual, and Lifetime?",
  faq_a2:
    "Only the billing and the support. Every paid plan opens exactly the same terminal, so nobody gets a smaller product for paying less. Monthly is one payment for 30 days, and you decide each time whether to pay again. Annual is one payment for twelve months and works out about 17% cheaper. Lifetime is one payment and the access stays. Support goes from standard to priority to dedicated as you move up, and special requests, including Agent, start at Annual.",
  faq_q3: "How do I pay, and why USDT?",
  faq_a3:
    "You pay with USDT on BNB Smart Chain (BEP-20). Every invoice gets its own receiving address, we read the transfer straight off the chain, and access opens by itself once it confirms. USDT holds the price you agreed to, which a volatile coin would not, and the chain is what lets us verify a payment without ever touching your card. One rule worth remembering: we never send a wallet address in a message. The only address we issue appears on this site after you sign in, so if an address reaches you by Telegram, email or chat, it did not come from us. If you would rather send a bank transfer or use another network, choose to pay another way and a person matches it by hand.",
  faq_q4: "Does anything charge me automatically?",
  faq_a4:
    "No. There is no card on file, no stored payment method, and no subscription quietly renewing in the background. Each payment buys one period and nothing more. When that period ends, access stops until you decide to open a new invoice. Nothing needs cancelling, because there is nothing running. You can upgrade, switch plan, or extend early from this page whenever you want.",
  faq_q5: "When does access start, and what if verification fails?",
  faq_a5:
    "Access opens the moment the chain confirms your transfer, usually under a minute after you paste the transaction hash. Sometimes a hash never appears on-chain at all. That normally means the exchange you withdrew from settled it internally and handed you an internal reference instead of a real transaction. Your money is not lost. Keep the page open, or send us the withdrawal ID, and a person matches the payment by hand and opens your access.",
  faq_q6: "What is Agent? Do I have to use it?",
  faq_a6:
    "Agent is optional automation, and most members never switch it on. It places calls on your own exchange account through API keys you create yourself, so your funds stay where they are and we never hold them. It comes on request with Annual or Lifetime, because setting it up is a conversation rather than a switch. If you would rather read the calls and place them yourself, nothing else about the product changes.",
  faq_q7: "Is this financial advice?",
  faq_a7:
    "No, and we are careful about this. LuxQuant is a market-intelligence terminal. The calls and the research tell you what we see and what we published at that moment. They do not tell you what to do with your money, and nobody here knows your position size, your risk, or your situation. Every past call carries a timestamp so you can check it yourself, and none of them promise the next one will work.",
  faq_q8: "Can I look around before I pay?",
  faq_a8:
    "Yes, and we would rather you did. A free account asks for no card and no payment details. Read the whole public record, open any call and see the chart it was called on, and use Pulse, News and the journal for as long as you like. Plenty of people watch for weeks before paying. Upgrade when the live levels are worth it to you, not before.",
  faq_q9: "What does the 85.9% actually count?",
  faq_a9:
    "It counts how many published calls reached at least one of their targets, TP1 or better. It is not a profit figure, and it is not what any one person made, because when you close a trade is your decision. A call that touches TP1 and then turns around still counts as reached. Read it as how often a call goes our way at least once, then open the record and check the rest yourself. Every call is there, including the ones that did not work.",
  faq_q10: "What if I send the wrong amount, or use the wrong network?",
  faq_a10:
    "Message us on Telegram with the transaction hash and we will sort it out. BEP-20 is the only address we issue, so a transfer sent on another network never arrives at it and nothing matches automatically. The same goes for an amount that lands short or arrives late. A person reads the chain, matches what you sent, and opens your access. Your invoice stays open for 72 hours, and being late does not cost you the payment.",

  cta_title: "",
  cta_subtitle: "",
  cta_secondary: "Back to the terminal",

  back: "← Back to Terminal",
  modal_subtitle: "Live levels and the full terminal, the same product on every paid plan.",
  called_context:
    "{{pair}} was just called. Subscribers see the entry, the targets and the stop as they print.",
  most_popular: "Recommended",

  load_error: "Plans could not be loaded. Please try again.",
  retry: "Retry",
  recommended: "Recommended",
  limited: "Limited",

  seo_title: "Pricing | LuxQuant Terminal",
  seo_desc:
    "Free Pulse, Bitcoin, and public track record. Paid plans unlock live signal levels, on-chain intelligence, and research. Agent on request with Annual or Lifetime. USDT on-chain, no auto-renewal.",

  included: "Included",
  not_included: "Not included",

  admin_eyebrow: "Another way to pay",
  admin_title: "Bank transfer or another network",
  admin_sub: "Same plan, same price. We’ll send instructions and match the payment by hand.",
  admin_plan: "Plan",
  admin_price: "Amount",
  admin_message: "Message",
  admin_copy: "Copy",
  admin_copied: "Copied",
  admin_open: "Open Telegram",
  admin_wait: "We usually reply the same day.",
  admin_prefill: "This text is pre-filled in Telegram. Edit it before sending if you need to.",
  admin_duration_days: "{{days}}-day access",
  admin_duration_life: "lifetime access",
  admin_msg:
    "Hi LuxQuant,\n\nI'd like to pay for the {{plan}} plan ({{price}} USDT, {{duration}}).\n\nAccount: @{{username}}\nEmail: {{email}}\n{{extra}}Please send payment instructions.\n\nThank you.",
  agent_msg:
    "Hi LuxQuant,\n\nI'd like to request Agent (automation) on the {{plan}} plan.\n\nAccount: @{{username}}\nEmail: {{email}}\n{{extra}}Please tell me how to proceed.\n\nThank you.",
  admin_invoice_line: "Invoice ID: #{{id}}\n",
  admin_referral_line: "Referral: {{code}}\n",
  agent_eyebrow: "On request",
  agent_title: "Request Agent",
  agent_sub: "Annual or Lifetime. If you need automation, we can help.",

  status_title: "Subscription",
  status_upgrade_body: "Upgrade for live signal levels and the full terminal.",
  status_upgrade_cta: "See plans",
  status_plan: "Plan",
  status_remaining: "{{days}} days remaining",
  status_lifetime: "Lifetime access",
};

export const pricingZh = {
  premium_access: "高级访问",
  upgrade_to: "升级到",
  switch: "切换",
  premium: "Premium",
  subtitle: "实时信号档位、完整终端与研究。",
  subscribing_to: "当前方案",
  days_remaining: "天剩余",
  lifetime_label: "终身",

  hero_eyebrow: "定价",
  hero_title_line1: "实时档位。",
  hero_title_line2: "选择付费方式。",
  hero_subtitle:
    "免费：Pulse、Bitcoin 与公开战绩。付费：实时入场、目标与止损，以及完整终端。所有付费方案产品相同。",

  monthly: "月度",
  yearly: "年度",
  lifetime: "终身",

  monthly_desc: "按周期支付。无自动续费。",
  yearly_desc: "十二个月。更划算。",
  yearly_save: "节省 17%",
  lifetime_desc: "一次支付，持续访问。",
  best_value: "最佳价值",

  per_month: "/ 月",
  per_year: "/ 年",
  one_time: "一次性",
  billed_yearly: "按年计费",
  equiv_month: "约 ${{price}} / 月",
  free_forever: "永久免费",

  feat_signals: "实时信号档位",
  feat_analytics: "完整图表与分析",
  feat_performance: "绩效工具",
  feat_market: "Pulse 上的 Called 叠加",
  feat_support: "优先支持",
  feat_basic_support: "标准支持",
  feat_lifetime: "持续产品更新",
  feat_autotrade: "Agent — 按需申请",
  feat_onchain: "链上情报",
  feat_ai: "AI 研究",
  feat_onchain_ai: "链上情报与 AI 研究",
  feat_everything_free: "包含免费版全部内容",
  feat_everything_monthly: "包含月度全部内容",
  feat_everything_yearly: "包含年度全部内容",
  feat_requests: "特殊需求（含 Agent）",
  feat_vip_support: "专属支持",

  free_name: "免费",
  free_desc: "先看市场，核验战绩。",
  free_price: "0",
  free_cta: "继续免费使用",
  free_feat_1: "Pulse、Bitcoin 与 Markets",
  free_feat_2: "公开战绩",
  free_feat_3: "新闻与交易日志",
  free_feat_4: "产品更新",

  select_plan: "开始",
  continue_payment: "继续支付",
  current_plan: "当前方案",
  upgrade: "升级",
  downgrade: "切换方案",
  switch_plan: "切换方案",
  processing: "正在创建发票…",
  upgrade_pay: "升级",
  switch_pay: "切换方案",
  get_monthly: "获取月度",
  get_yearly: "获取年度",
  get_lifetime: "获取终身",
  subscribe_via_admin: "其他支付方式",
  or: "或",
  active: "生效中",
  youre_subscribed: "订阅中",

  same_product: "付费方案产品相同。计费与支持不同。",

  trust_since: "自 2023 年",
  trust_since_body: "带时间戳、可核验的信号。",
  trust_pay: "链上 USDT",
  trust_pay_body: "独立地址，确认即开通。",
  trust_keys: "无自动续费",
  trust_keys_body: "不保存银行卡。",

  agent_note: "需要自动化？Agent 可在年度或终身方案中按需申请 — 如果你需要，我们可以协助。",
  agent_note_cta: "申请 Agent",
  agent_yearly_only: "年度与终身",
  compare_requests_yes: "按需申请",

  how_title: "如何支付",
  how_subtitle: "无需银行卡，不会自动扣款。你发送 USDT，链上确认后即开通。",
  how_1_title: "选择方案",
  how_1_body: "我们会开具发票，并为此次付款签发唯一收款地址。",
  how_2_title: "发送精确金额的 USDT",
  how_2_body: "仅限 BNB 智能链 (BEP-20)。登录后从本站复制地址 — 切勿使用私信中的地址。",
  how_3_title: "粘贴交易哈希",
  how_3_body: "我们在链上核验。大多数支付在一分钟内确认，访问立即开通。",

  pay_other_title: "更想银行转账或其他网络？",
  pay_other_body: "我们会人工匹配。同一方案，同一价格。",
  pay_other_cta: "通过 Telegram 联系我们",

  compare_title: "包含内容",
  compare_subtitle: "一眼看清：免费、付费与年度额外项。",
  compare_note:
    "月付、年付与终身解锁相同终端。特殊需求（含 Agent）从年度开始。不会自动续费。",
  compare_feature: "能力",
  compare_signals: "实时信号档位",
  compare_signals_hint: "每笔信号打印时即可看到入场、目标与止损。",
  compare_called: "Pulse 上的 Called 叠加",
  compare_called_hint: "看到我们实际发出的标的。",
  compare_autotrade: "Agent（自动化）",
  compare_autotrade_hint: "按需申请 — 年度与终身。如果你需要，我们可以协助。",
  compare_analytics: "图表与分析",
  compare_analytics_hint: "付费含完整终端。免费保留公开视图。",
  compare_onchain: "链上情报",
  compare_onchain_hint: "资金流与风险，集中在同一工作区。",
  compare_ai: "AI 研究",
  compare_ai_hint: "研究就在信号旁边。",
  compare_performance: "绩效工具",
  compare_performance_hint: "免费含公开战绩。付费含完整工具。",
  compare_support: "支持",
  compare_support_std: "标准",
  compare_support_prio: "优先",
  compare_support_vip: "专属",
  compare_updates: "更新",
  compare_updates_sub: "订阅期内",
  compare_updates_life: "持续",

  payment_title: "支付",
  payment_desc: "BNB 智能链 (BEP-20) 上的 USDT。链上验证，自动开通。",
  auto_verify: "链上验证",
  usdt_bep20: "USDT · BEP-20",
  instant_act: "确认即开通",
  trust_cancel: "无自动续费，不保存银行卡。",
  trust_secure: "每张发票独立地址",
  trust_support: "链上无法匹配时由人工处理",

  faq_title: "常见问题",
  faq_subtitle: "",
  faq_q1: "免费包含什么？付费解锁什么？",
  faq_a1:
    "免费包含 Pulse、Bitcoin、Markets、新闻、交易日志与公开战绩 — 付费前即可核验信号。付费解锁实时信号档位（入场、目标、止损）、Pulse 上的 Called 叠加、链上情报、AI 研究与完整终端。",
  faq_q2: "月付、年付和终身有何区别？",
  faq_a2:
    "终端相同。月付每 30 天在你选择再次支付时计费。年付一次支付覆盖十二个月（约节省 17%）。终身一次支付，持续访问。支持：月付标准，年付优先，终身专属。特殊需求（含 Agent）从年度开始。",
  faq_q3: "如何支付 — 为什么是 USDT？",
  faq_a3:
    "使用 BNB 智能链 (BEP-20) 上的 USDT。我们为你的发票签发唯一地址，在链上验证转账并自动开通。我们绝不通过 Telegram、邮件或聊天发送钱包地址。若有人私信给你地址，那不是我们。若你更想银行转账或其他网络，使用「其他支付方式」，我们会人工匹配。",
  faq_q4: "会自动扣款吗？",
  faq_a4:
    "不会。不保存银行卡，也无自动续费。访问期覆盖你已支付的周期。到期后若要继续，再开一张新发票即可。可随时在本页升级、切换或续期。",
  faq_q5: "何时开通？验证失败怎么办？",
  faq_a5:
    "粘贴交易哈希后，大多数支付在一分钟内确认。若哈希未出现在链上 — 例如交易所内部结算 — 资金仍是你的。保持页面打开，或把提现 ID 发给我们，我们会人工匹配。",
  faq_q6: "什么是 Agent？必须使用吗？",
  faq_a6:
    "不必。Agent 是可选的交易所自动化 — 仅在你需要时。可在年度或终身方案中按需申请。你连接自己的密钥；我们不托管资金。若你需要，告诉我们，我们会协助开通。",
  faq_q7: "这是投资建议吗？",
  faq_a7:
    "不是。LuxQuant 是市场情报终端。信号与研究用于提供信息 — 不会替你做决定。执行与风险由你负责。历史信号带有时间戳供核验；不构成对未来结果的保证。",
  faq_q8: "付费前可以先看看吗？",
  faq_a8:
    "可以。创建免费账户 — 无需银行卡。使用 Pulse、公开战绩、新闻与日志。需要实时档位和完整终端时再升级。",

  cta_title: "",
  cta_subtitle: "",
  cta_secondary: "返回终端",

  back: "← 返回终端",
  modal_subtitle: "实时档位与完整终端 — 所有付费方案产品相同。",
  called_context: "刚刚发出 {{pair}} 信号 — 订阅者可实时看到入场、目标与止损。",
  most_popular: "推荐",
  load_error: "无法加载方案，请重试。",
  retry: "重试",
  recommended: "推荐",
  limited: "有限",

  seo_title: "定价 — LuxQuant Terminal",
  seo_desc:
    "免费 Pulse、Bitcoin 与公开战绩。付费解锁实时信号档位、链上情报与研究。Agent 可在年度或终身方案中按需申请。链上 USDT，无自动续费。",

  included: "包含",
  not_included: "不包含",

  admin_eyebrow: "其他支付方式",
  admin_title: "银行转账或其他网络",
  admin_sub: "同一方案，同一价格。我们会发送说明并人工匹配付款。",
  admin_plan: "方案",
  admin_price: "金额",
  admin_message: "消息",
  admin_copy: "复制",
  admin_copied: "已复制",
  admin_open: "打开 Telegram",
  admin_wait: "通常当天回复。",
  admin_prefill: "这段文字会预填到 Telegram。发送前可自行修改。",
  admin_duration_days: "{{days}} 天访问",
  admin_duration_life: "终身访问",
  admin_msg:
    "你好 LuxQuant，\n\n我想支付 {{plan}} 方案（{{price}} USDT，{{duration}}）。\n\n账户：@{{username}}\n邮箱：{{email}}\n{{extra}}请发送付款说明。\n\n谢谢。",
  agent_msg:
    "你好 LuxQuant，\n\n我想在 {{plan}} 方案下申请 Agent（自动化）。\n\n账户：@{{username}}\n邮箱：{{email}}\n{{extra}}请告知如何开通。\n\n谢谢。",
  admin_invoice_line: "发票编号：#{{id}}\n",
  admin_referral_line: "推荐码：{{code}}\n",
  agent_eyebrow: "按需申请",
  agent_title: "申请 Agent",
  agent_sub: "年度或终身。若你需要自动化，我们可以协助。",

  status_title: "订阅",
  status_upgrade_body: "升级以解锁实时信号档位与完整终端。",
  status_upgrade_cta: "查看方案",
  status_plan: "方案",
  status_remaining: "剩余 {{days}} 天",
  status_lifetime: "终身访问",
};
