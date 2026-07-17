// locales/guide.js
// Guide / info content for the Signals page (InfoTip popovers + GuideModal).
// EN + ZH. Descriptive, accurate to the actual classification/correlation code.

export const guideEn = {
 guide: {
 button: "Guide",
 title: "Signals Guide",
 subtitle: "What each filter, metric, and column means",
 close: "Close",
 disclaimer: "All metrics are descriptive and based on historical data. They are context to inform your own decision — not standalone buy/sell triggers.",

 // section labels
 sec_stats: "Performance Stats",
 sec_intel: "Intelligence Filters",
 sec_pattern: "Pattern Filters",
 sec_table: "Table Columns",

 // stat cards
 today_wr_t: "Today's Win Rate",
 today_wr_d: "Win rate of signals CREATED today that have already closed. Wins ÷ closed signals made today.",
 overall_wr_t: "Overall Win Rate",
 overall_wr_d: "Win rate across all signals ever generated. The long-run track record.",
 today_act_t: "Today's Activity",
 today_act_d: "Signals created today: total, still open, wins (W) and losses (L) so far.",
 this_week_t: "This Week",
 this_week_d: "Total signals generated in the last 7 days — the dataset currently in view.",

 // intelligence filters
 streak_t: "High Win Streak (≥5)",
 streak_d: "Coins currently on a winning streak of 5 or more consecutive closed wins (from Coin Intelligence).",
 decoupled_t: "Decoupled from BTC",
 decoupled_d: "Signals whose price is moving independently of Bitcoin (statistical z-score above 2 and correlation below 0.5). Often a sign of a coin-specific catalyst — news, listing, or partnership.",
 align_t: "High BTC Alignment (≥70)",
 align_d: "Signals moving strongly and consistently in the same direction as Bitcoin (alignment score ≥70). These behave like a BTC proxy.",
 worth_t: "Worth It",
 worth_d: "A favorable verdict: high win rate (≥80% with enough closed trades, or ≥85%), an active hot streak, or positive signals with no red flags.",
 avoid_t: "Avoid",
 avoid_d: "A cautionary verdict: a red flag is present, stop-loss rate is high (≥30%), or win rate is low (below ~65–70%).",

 // pattern filters
 pattern_t: "Pattern Filters",
 pattern_d: "Each tag is an entry-condition the system detected (e.g. RSI overbought, fresh breakout, deep pullback). The percentage is the HISTORICAL win rate of resolved signals that carried that tag, and the small number is how many currently-visible signals carry it.",
 pattern_warn: "Important: tags overlap (one signal carries many) and these are descriptive correlations, not causes. A high win rate next to a tag does NOT mean the tag is a buy trigger. Counter-intuitive example: in this LONG-only system during an up market, 'overbought' tags historically win MORE — because strong momentum persists — while 'deep pullback' wins less. Read it as context, not a rule.",
 pattern_use: "Click a tag to show only currently-visible signals that carry it. Counts and the tag list adjust to the timeline/day you have selected.",

 // table columns
 track_t: "Track Record (WR / Streak)",
 track_d: "The coin's historical win rate and its current win/loss streak (▲ wins, ▼ losses), from Coin Intelligence.",
 btccorr_t: "BTC Corr (ρ / β)",
 btccorr_d: "How the signal relates to Bitcoin. ρ (rho) is correlation (−1 to +1); β (beta) is how much it amplifies BTC moves. ⚡ = decoupled, 🔥 = extended move.",
 verdict_t: "Verdict",
 verdict_d: "The Worth It / Avoid assessment plus a risk score, derived from win rate, streak, stop-loss rate, and flags. Click it for the full breakdown.",
 tagbadge_t: "Pattern Tag Badge",
 tagbadge_d: "The single highest historical-win-rate tag this signal carries, shown as context. Descriptive only — see Pattern Filters above.",
 },
};

export const guideZh = {
 guide: {
 button: "指南",
 title: "信号指南",
 subtitle: "每个筛选器、指标和列的含义",
 close: "关闭",
 disclaimer: "所有指标均为描述性，基于历史数据。它们是帮助你自行决策的参考——并非独立的买入/卖出触发条件。",

 sec_stats: "表现统计",
 sec_intel: "智能筛选",
 sec_pattern: "形态筛选",
 sec_table: "表格列",

 today_wr_t: "今日胜率",
 today_wr_d: "今日创建且已平仓信号的胜率。盈利数 ÷ 今日创建的已平仓信号数。",
 overall_wr_t: "总胜率",
 overall_wr_d: "所有曾生成信号的胜率。长期战绩。",
 today_act_t: "今日活动",
 today_act_d: "今日创建的信号：总数、仍未平仓、目前盈利 (W) 与亏损 (L)。",
 this_week_t: "本周",
 this_week_d: "过去 7 天生成的信号总数——当前视图中的数据集。",

 streak_t: "高连胜 (≥5)",
 streak_d: "当前连续平仓盈利达 5 次或以上的代币（来自代币情报）。",
 decoupled_t: "脱离 BTC",
 decoupled_d: "价格走势独立于比特币的信号（统计 z 分数大于 2 且相关性低于 0.5）。通常意味着该代币有特定催化剂——新闻、上币或合作。",
 align_t: "高 BTC 一致性 (≥70)",
 align_d: "与比特币方向高度且持续一致的信号（一致性分数 ≥70）。其表现类似 BTC 代理。",
 worth_t: "值得",
 worth_d: "有利评级：高胜率（≥80% 且有足够已平仓交易，或 ≥85%）、当前处于热连胜、或有正面信号且无危险标记。",
 avoid_t: "回避",
 avoid_d: "警示评级：存在危险标记、止损率偏高 (≥30%)、或胜率偏低（约 65–70% 以下）。",

 pattern_t: "形态筛选",
 pattern_d: "每个标签是系统检测到的入场条件（如 RSI 超买、新突破、深度回调）。百分比是带有该标签的已平仓信号的历史胜率，旁边的小数字是当前可见信号中带有该标签的数量。",
 pattern_warn: "重要提示：标签会重叠（一个信号带有多个），且这些是描述性的相关性，并非因果。标签旁的高胜率并不意味着该标签是买入触发条件。反直觉示例：在这个只做多的系统中、在上涨行情里，「超买」类标签历史上胜率更高——因为强劲动能会延续——而「深度回调」胜率较低。请将其视为参考，而非规则。",
 pattern_use: "点击标签可仅显示当前可见且带有该标签的信号。数量和标签列表会随你所选的时间线/日期调整。",

 track_t: "战绩 (胜率 / 连胜)",
 track_d: "该代币的历史胜率及当前连胜/连败（▲ 胜，▼ 负），来自代币情报。",
 btccorr_t: "BTC 相关性 (ρ / β)",
 btccorr_d: "信号与比特币的关系。ρ (rho) 是相关性（−1 到 +1）；β (beta) 是它放大 BTC 波动的程度。⚡ = 脱离，🔥 = 过度延伸。",
 verdict_t: "评级",
 verdict_d: "「值得 / 回避」评估加上风险分数，依据胜率、连胜、止损率和标记得出。点击查看完整分解。",
 tagbadge_t: "形态标签徽章",
 tagbadge_d: "该信号所带标签中历史胜率最高的一个，作为参考显示。仅为描述性——见上方形态筛选。",
 },
};
