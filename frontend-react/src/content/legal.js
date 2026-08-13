// Public legal copy — landing footer, /terms, /privacy, and the login modal.
// Keep in one file so the login sheet and the public pages cannot drift.

export const LEGAL_UPDATED = "August 2026";

export const TERMS_SECTIONS = [
  {
    title: "1. Acceptance of Terms",
    body: 'By accessing or using LuxQuant Terminal ("the Platform"), you agree to be bound by these Terms & Conditions. If you do not agree with any part of these terms, you must not use the Platform. We may update these terms from time to time; continued use of the Platform after changes constitutes acceptance of the revised terms.',
  },
  {
    title: "2. Nature of the Service",
    body: "LuxQuant Terminal is a data and analytics platform. We surface market data, algorithmic signals, on-chain metrics, and AI-generated analysis for informational purposes. The Platform informs — it does not decide for you. Nothing on the Platform constitutes financial, investment, legal, or tax advice, and no content should be interpreted as a recommendation to buy, sell, or hold any digital asset.",
  },
  {
    title: "3. Risk Disclosure",
    body: "Trading cryptocurrency involves substantial risk and may result in the loss of part or all of your capital. Digital asset markets are highly volatile and operate 24/7. Past performance of any signal, strategy, or analysis is not indicative of future results. You are solely responsible for your own trading decisions and should never trade with funds you cannot afford to lose. Consider consulting a licensed financial advisor before making investment decisions.",
  },
  {
    title: "4. Eligibility",
    body: "You must be at least 18 years old and legally permitted to use cryptocurrency-related services in your jurisdiction. You are responsible for ensuring that your use of the Platform complies with all laws and regulations applicable to you. The Platform is not directed at any jurisdiction where its use would be unlawful.",
  },
  {
    title: "5. Accounts & Security",
    body: "You sign in through third-party identity providers (Google, Telegram, or Discord). You are responsible for maintaining the security of those accounts. You must notify us promptly of any unauthorized access. We reserve the right to suspend or terminate accounts that violate these terms or that we reasonably believe are compromised.",
  },
  {
    title: "6. Subscriptions & Payments",
    body: "Certain features require a paid subscription. Subscription fees, billing periods, and included features are described at the point of purchase. Fees are non-refundable except where required by law. We may modify pricing or features with reasonable notice; changes apply from your next billing cycle. Access tied to community membership (e.g., VIP groups) may be re-verified periodically.",
  },
  {
    title: "7. Agent (optional execution assistance)",
    body: "If you enable Agent, you do so entirely at your own risk. Agent is optional assistance, not a managed account, not a fund, and not a promise of profit. You connect your own exchange API keys — withdraw permission is never requested — one venue at a time, and you retain control of size, markets, dry-run versus live, and on/off. Execution can be affected by exchange outages, network latency, slippage, skipped trades, rejected protective orders, and market conditions. Pause Agent when you cannot supervise it. We are not liable for losses arising from assisted or automated execution.",
  },
  {
    title: "8. Data & Privacy",
    body: "We collect only the information necessary to operate the Platform: your authentication profile (email, username, avatar), subscription status, and usage data. Exchange API keys are stored encrypted and are never shared with third parties. We do not sell your personal data. You may request deletion of your account and associated data by contacting support. See the Privacy Policy for the same points in one place.",
  },
  {
    title: "9. Acceptable Use",
    body: "You agree not to: (a) redistribute, resell, or publicly share signals, data, or analysis from the Platform without written permission; (b) reverse-engineer, scrape, or abuse the Platform or its APIs; (c) use the Platform for unlawful activity, including market manipulation; (d) share your account access with others. Violation may result in immediate termination without refund.",
  },
  {
    title: "10. Intellectual Property",
    body: "All content, branding, algorithms, software, and design on the Platform are the property of LuxQuant or its licensors and are protected by applicable intellectual property laws. Your subscription grants you a limited, non-exclusive, non-transferable license for personal use only.",
  },
  {
    title: "11. Limitation of Liability",
    body: 'To the maximum extent permitted by law, LuxQuant and its operators shall not be liable for any direct, indirect, incidental, consequential, or exemplary damages — including trading losses, lost profits, or data loss — arising from your use of, or inability to use, the Platform. The Platform is provided "as is" and "as available" without warranties of any kind, including accuracy, completeness, or uninterrupted availability of data and signals.',
  },
  {
    title: "12. Termination",
    body: "You may stop using the Platform at any time. We may suspend or terminate your access if you breach these terms, with or without notice. Sections relating to risk, intellectual property, and limitation of liability survive termination.",
  },
  {
    title: "13. Contact",
    body: "For questions about these Terms & Conditions, account issues, or data requests, contact us through the official LuxQuant Telegram channel or the support contact listed on the Platform.",
  },
];

export const PRIVACY_SECTIONS = [
  {
    title: "1. What we collect",
    body: "We collect the information needed to run the Platform: your authentication profile from Google, Telegram, or Discord (typically email, username, and avatar), subscription and billing status, and product usage that helps us operate and improve the service. If you connect Agent, we store the exchange API credentials you submit.",
  },
  {
    title: "2. How we use it",
    body: "We use this information to authenticate you, deliver the product you paid for or the free tools you opened, send transactional notices, prevent abuse, and improve reliability. We do not sell your personal data. We do not share exchange API keys with third parties.",
  },
  {
    title: "3. Exchange keys",
    body: "Agent keys are stored encrypted at rest. Withdraw permission is never requested. You can disconnect a venue at any time. You remain responsible for the permissions you grant on the exchange and for pausing Agent when you cannot supervise it.",
  },
  {
    title: "4. Processors",
    body: "Sign-in is handled by the identity provider you choose. Payments are handled by our payment processors. Those parties receive only what they need to complete that job, under their own terms.",
  },
  {
    title: "5. Retention and deletion",
    body: "We keep account and usage records for as long as the account is active and as needed to operate the Platform, meet legal duties, and resolve disputes. You may request deletion of your account and associated data by contacting support through the official LuxQuant channel.",
  },
  {
    title: "6. Contact",
    body: "Privacy questions go to the same support contact as the rest of the Platform — the official LuxQuant Telegram channel or the support address listed in the product.",
  },
];
