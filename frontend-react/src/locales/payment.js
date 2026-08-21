// src/locales/payment.js

export const paymentEn = {
  title: "Payment",
  subtitle_plan: "Plan",

  expires_in: "Invoice expires in",
  expired: "Expired",
  calculating: "Calculating…",
  loading_invoice: "Loading your invoice…",

  step1: "Select payment method",
  currency: "Currency",
  network: "Network",

  step2: "Transfer payment",
  amount: "Amount",
  wallet_address: "Wallet address",
  copy: "Copy",
  copied: "Copied",

  warning_bsc:
    "Use BNB Smart Chain (BEP-20) only. Sending on another network will lose the funds.",
  warning_erc20:
    "Use Ethereum (ERC-20) only. Sending on another network will lose the funds.",
  warning_trc20:
    "Use TRON (TRC-20) only. Sending on another network will lose the funds.",
  warning_btc: "Send Bitcoin only to this address. Other tokens will be lost.",

  step3: "Submit transaction hash",
  tx_desc: "After you send, paste the transaction hash from your wallet or exchange.",
  tx_placeholder: "0x…",
  tx_placeholder_btc: "Enter transaction ID…",
  verify_btn: "Verify payment",
  verifying: "Verifying on-chain…",

  success_title: "Payment confirmed",
  success_active: "active",
  success_until: "until",
  success_lifetime: "— Lifetime",
  redirecting: "Opening the terminal…",
  failed_title: "Verification failed",
  pending_title: "Still confirming",
  can_retry: "You can try again with the correct hash",

  help: "Need help? Message us on Telegram",
  back_pricing: "← Back to pricing",

  currency_usdt: "USDT",
  currency_usdc: "USDC",
  currency_btc: "Bitcoin",

  network_bsc: "BSC (BEP-20)",
  network_erc20: "Ethereum (ERC-20)",
  network_trc20: "TRON (TRC-20)",
  network_btc: "Bitcoin",

  recommended: "Recommended",
  lowest_fee: "Lowest fee",

  // Checkout page
  invoice_eyebrow: "Checkout",
  hero_title: "Send USDT to finish",
  awaiting: "Awaiting payment",
  amount_due: "Amount due",
  expires_label: "Expires in",
  payment_window: "{{hours}}h window",
  payment_window_generic: "Payment window",

  other_way_title: "Don’t have USDT, or prefer a bank transfer?",
  other_way_body: "We’ll arrange another method by hand. Same plan, same price.",
  other_way_cta: "Pay another way",

  transfer_label: "Transfer",
  transfer_title: "Send to this address",
  unique_address:
    "This address was issued for this invoice only. That’s how we match the transfer to your account — don’t reuse it later.",
  exact_amount: "Exact amount",
  network_warn_title: "USDT on BNB Smart Chain (BEP-20) only.",
  network_warn_body:
    "Other tokens or networks (ERC-20, TRC-20) will not credit this invoice and cannot be recovered.",
  never_dm:
    "We never send a wallet address by message. Copy it here after you sign in. Anyone messaging you an address is not us.",

  verify_label: "Confirm",
  verify_title: "Paste the transaction hash",
  verify_intro:
    "After the transfer, paste the hash from your wallet or exchange. We check it on-chain and open access when it confirms.",
  tx_hash: "Transaction hash",
  confirmed: "Payment confirmed",
  confirmed_body: "{{plan}} is now active. Opening the terminal…",
  looking: "We’re still looking for it",
  funds_safe: "Your funds are safe. We saved the hash — nothing is lost.",
  why_title: "Usually one of three things:",
  why_confirming_title: "The network is still confirming.",
  why_confirming_body: "Give it a few minutes. We’ll keep checking.",
  why_internal_title: "The exchange settled it internally.",
  why_internal_body:
    "Some exchanges never create a chain transaction when the destination is one of their own addresses. Retrying won’t help — send us the withdrawal ID instead.",
  why_network_title: "It went to a different network or amount.",
  why_network_body: "We only receive USDT on BNB Smart Chain (BEP-20).",
  auto_checking: "Checking again automatically — you can leave this page open.",
  send_to_us: "Send this to us",
  or_repaste: "or paste the hash again in a few minutes",
  technical: "Detail: {{message}}",

  after_title: "After you send",
  after_1: "Paste the hash. Most payments confirm automatically in under a minute.",
  after_2: "Access opens the moment it confirms — no waiting for a person.",
  after_3_before: "If it does not confirm, the hash is kept and a person will match it —",
  after_3_cta: "message us",
  footer_verify: "Verified on-chain via BscScan. Access opens on confirm.",
};

export const paymentZh = {
  title: "支付",
  subtitle_plan: "方案",

  expires_in: "发票到期时间",
  expired: "已过期",
  calculating: "计算中…",
  loading_invoice: "正在加载发票…",

  step1: "选择支付方式",
  currency: "货币",
  network: "网络",

  step2: "转账支付",
  amount: "金额",
  wallet_address: "钱包地址",
  copy: "复制",
  copied: "已复制",

  warning_bsc: "请仅使用 BNB 智能链 (BEP-20)。通过其他网络发送将导致资金丢失。",
  warning_erc20: "请仅使用以太坊 (ERC-20)。通过其他网络发送将导致资金丢失。",
  warning_trc20: "请仅使用 TRON (TRC-20)。通过其他网络发送将导致资金丢失。",
  warning_btc: "请仅向此地址发送比特币。发送其他代币将导致资金丢失。",

  step3: "提交交易哈希",
  tx_desc: "转账后，粘贴来自钱包或交易所的交易哈希。",
  tx_placeholder: "0x…",
  tx_placeholder_btc: "输入交易 ID…",
  verify_btn: "验证支付",
  verifying: "正在链上验证…",

  success_title: "支付已确认",
  success_active: "已激活",
  success_until: "有效期至",
  success_lifetime: "— 终身",
  redirecting: "正在打开终端…",
  failed_title: "验证失败",
  pending_title: "仍在确认",
  can_retry: "可以使用正确的哈希重试",

  help: "需要帮助？通过 Telegram 联系我们",
  back_pricing: "← 返回定价",

  currency_usdt: "USDT",
  currency_usdc: "USDC",
  currency_btc: "比特币",

  network_bsc: "BSC (BEP-20)",
  network_erc20: "以太坊 (ERC-20)",
  network_trc20: "TRON (TRC-20)",
  network_btc: "比特币",

  recommended: "推荐",
  lowest_fee: "最低费用",

  invoice_eyebrow: "结账",
  hero_title: "发送 USDT 以完成",
  awaiting: "等待付款",
  amount_due: "应付金额",
  expires_label: "剩余时间",
  payment_window: "{{hours}} 小时窗口",
  payment_window_generic: "付款窗口",

  other_way_title: "没有 USDT，或更想银行转账？",
  other_way_body: "我们会人工安排其他方式。同一方案，同一价格。",
  other_way_cta: "其他支付方式",

  transfer_label: "转账",
  transfer_title: "发送到此地址",
  unique_address:
    "此地址仅用于本张发票。我们据此把转账匹配到你的账户 — 请勿用于之后的付款。",
  exact_amount: "精确金额",
  network_warn_title: "仅限 BNB 智能链 (BEP-20) 上的 USDT。",
  network_warn_body: "其他代币或网络（ERC-20、TRC-20）无法计入本发票，且无法追回。",
  never_dm:
    "我们绝不会通过私信发送钱包地址。请在登录后从此页复制。任何人私信给你地址，都不是我们。",

  verify_label: "确认",
  verify_title: "粘贴交易哈希",
  verify_intro: "转账后，粘贴钱包或交易所中的哈希。我们在链上核验，确认后即开通访问。",
  tx_hash: "交易哈希",
  confirmed: "支付已确认",
  confirmed_body: "{{plan}} 现已生效。正在打开终端…",
  looking: "仍在查找这笔交易",
  funds_safe: "资金是安全的。我们已保存哈希 — 不会丢失。",
  why_title: "通常是以下三种情况之一：",
  why_confirming_title: "网络仍在确认。",
  why_confirming_body: "稍等几分钟。我们会继续检查。",
  why_internal_title: "交易所进行了内部结算。",
  why_internal_body:
    "当目标地址属于同一交易所时，有些平台不会生成链上交易。重试无效 — 请把提现 ID 发给我们。",
  why_network_title: "发到了不同网络或金额不符。",
  why_network_body: "我们只接收 BNB 智能链 (BEP-20) 上的 USDT。",
  auto_checking: "正在自动再次检查 — 可以保持此页打开。",
  send_to_us: "发给我们",
  or_repaste: "或过几分钟再粘贴一次哈希",
  technical: "详情：{{message}}",

  after_title: "发送之后",
  after_1: "粘贴哈希。大多数支付会在一分钟内自动确认。",
  after_2: "确认后立即开通 — 无需等待人工。",
  after_3_before: "若未确认，哈希会被保留并由人工匹配 —",
  after_3_cta: "联系我们",
  footer_verify: "通过 BscScan 链上验证。确认后即开通。",
};
