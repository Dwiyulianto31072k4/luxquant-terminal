// src/locales/payment.js

export const paymentEn = {
  title: "Payment",
  subtitle_plan: "Plan",

  // Timer
  expires_in: "Invoice expires in",
  expired: "Expired",
  calculating: "Calculating...",

  // Step 1 - Select payment method
  step1: "Select Payment Method",
  currency: "Currency",
  network: "Network",

  // Step 2 - Transfer
  step2: "Transfer Payment",
  amount: "Amount",
  wallet_address: "Wallet Address",
  copy: "Copy",
  copied: "Copied",

  // Network warnings
  warning_bsc: "Make sure to use BNB Smart Chain (BEP-20) network. Sending via other networks will result in loss of funds.",
  warning_erc20: "Make sure to use Ethereum (ERC-20) network. Sending via other networks will result in loss of funds.",
  warning_trc20: "Make sure to use TRON (TRC-20) network. Sending via other networks will result in loss of funds.",
  warning_btc: "Make sure to send Bitcoin only to this address. Sending other tokens will result in loss of funds.",

  // Step 3 - Verify
  step3: "Submit TX Hash",
  tx_desc: "After transfer, paste the Transaction Hash from your wallet or exchange",
  tx_placeholder: "0x . . .",
  tx_placeholder_btc: "Enter transaction ID...",
  verify_btn: "Verify Payment",
  verifying: "Verifying...",

  // Results
  success_title: "Payment Confirmed!",
  success_active: "active",
  success_until: "until",
  success_lifetime: "— Lifetime ∞",
  redirecting: "Redirecting to dashboard...",
  failed_title: "Verification Failed",
  pending_title: "Awaiting Confirmation",
  can_retry: "You can try again with the correct TX hash",

  // Help
  help: "Need help? Contact admin via Telegram",
  back_pricing: "← Back to Pricing",

  // Currency labels
  currency_usdt: "USDT",
  currency_usdc: "USDC",
  currency_btc: "Bitcoin",

  // Network labels
  network_bsc: "BSC (BEP-20)",
  network_erc20: "Ethereum (ERC-20)",
  network_trc20: "TRON (TRC-20)",
  network_btc: "Bitcoin",

  // Fees hint
  recommended: "Recommended",
  lowest_fee: "Lowest Fee",
};

export const paymentZh = {
  title: "支付",
  subtitle_plan: "计划",

  // Timer
  expires_in: "发票到期时间",
  expired: "已过期",
  calculating: "计算中...",

  // Step 1 - Select payment method
  step1: "选择支付方式",
  currency: "货币",
  network: "网络",

  // Step 2 - Transfer
  step2: "转账支付",
  amount: "金额",
  wallet_address: "钱包地址",
  copy: "复制",
  copied: "已复制",

  // Network warnings
  warning_bsc: "请确保使用 BNB 智能链 (BEP-20) 网络。通过其他网络发送将导致资金丢失。",
  warning_erc20: "请确保使用以太坊 (ERC-20) 网络。通过其他网络发送将导致资金丢失。",
  warning_trc20: "请确保使用 TRON (TRC-20) 网络。通过其他网络发送将导致资金丢失。",
  warning_btc: "请确保仅向此地址发送比特币。发送其他代币将导致资金丢失。",

  // Step 3 - Verify
  step3: "提交交易哈希",
  tx_desc: "转账后，粘贴来自钱包或交易所的交易哈希",
  tx_placeholder: "0x . . .",
  tx_placeholder_btc: "输入交易 ID...",
  verify_btn: "验证支付",
  verifying: "验证中...",

  // Results
  success_title: "支付确认！",
  success_active: "已激活",
  success_until: "有效期至",
  success_lifetime: "— 终身 ∞",
  redirecting: "正在跳转到仪表盘...",
  failed_title: "验证失败",
  pending_title: "等待确认",
  can_retry: "您可以使用正确的交易哈希重试",

  // Help
  help: "需要帮助？通过 Telegram 联系管理员",
  back_pricing: "← 返回定价",

  // Currency labels
  currency_usdt: "USDT",
  currency_usdc: "USDC",
  currency_btc: "比特币",

  // Network labels
  network_bsc: "BSC (BEP-20)",
  network_erc20: "以太坊 (ERC-20)",
  network_trc20: "TRON (TRC-20)",
  network_btc: "比特币",

  // Fees hint
  recommended: "推荐",
  lowest_fee: "最低费用",
};