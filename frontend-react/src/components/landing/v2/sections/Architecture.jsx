import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { loginUrl } from "../../../../utils/postLoginRedirect";
import { trackFunnel } from "../../../../utils/funnelAnalytics";
import { PrimaryButton, BtnArrow } from "./shared/LandingButtons";

const STEPS = [
  {
    n: "01",
    title: "The market moves",
    body: "Price, the order book, derivatives, and on-chain flows come in. This is just data — not a trade yet.",
    chips: ["Price", "Order book", "On-chain"],
  },
  {
    n: "02",
    title: "We write the plan",
    body: "LuxQuant turns that into one call you can follow: where to enter, where to take profit, and where to stop.",
    chips: ["Entry", "TP1–TP4", "Stop"],
  },
  {
    n: "03",
    title: "It lands on your desk",
    body: "The same levels show up in the terminal and in alerts. Agent can place the order for you — only if you turn it on.",
    chips: ["Terminal", "Alerts", "Agent optional"],
  },
  {
    n: "04",
    title: "You can check it later",
    body: "Every call stays on the public record — winners and losers, with the time it was published. No hidden book.",
    chips: ["Timestamped", "Winners + losers"],
  },
];

function Arrow() {
  return (
    <div className="lq-step-arrow" aria-hidden="true">
      <svg width="28" height="12" viewBox="0 0 28 12" fill="none">
        <path
          d="M0 6h25M20 1l6 5-6 5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export default function Architecture() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const goVerify = () => {
    trackFunnel("cta_click", { source: "how_it_works", path: "/" });
    if (isAuthenticated) {
      navigate("/performance");
      return;
    }
    navigate(loginUrl("/performance", { source: "how_it_works" }));
  };

  return (
    <section
      id="how-it-works"
      data-lq-self=""
      className="relative z-10 mx-auto w-full max-w-7xl scroll-mt-32 overflow-hidden px-4 py-16 lg:px-8 lg:py-24"
    >
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-[12px] font-medium tracking-wide text-text-muted sm:text-[13px]">
          How LuxQuant thinks
        </p>
        <h2 className="mt-5 text-[30px] font-extrabold leading-[1.27] tracking-[-0.025em] text-text-primary sm:text-[38px] lg:text-[48px]">
          Four steps.{" "}
          <span className="bg-gradient-to-r from-accent via-ink to-accent-dark bg-clip-text text-transparent">
            That&apos;s the whole product.
          </span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[14px] font-medium leading-[1.64] text-text-muted sm:text-[17px] lg:text-[19px]">
          We watch the market, publish a plan with entry and a stop, send it to your desk, and leave the result where you can audit it.
        </p>
      </div>

      <ol className="lq-steps mx-auto mt-12 max-w-6xl lg:mt-16">
        {STEPS.map((step, i) => (
          <li key={step.n} className="lq-step">
            {i > 0 ? <Arrow /> : null}
            <article className="lq-step-card">
              <span className="lq-step-n">{step.n}</span>
              <h3 className="lq-step-title">{step.title}</h3>
              <p className="lq-step-body">{step.body}</p>
              <ul className="lq-step-chips">
                {step.chips.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </article>
          </li>
        ))}
      </ol>

      <p className="mx-auto mt-8 max-w-2xl text-center text-[13px] font-medium leading-[1.7] text-text-muted sm:text-[14.5px] lg:mt-10">
        Read left to right. If a call is not on the public record, we do not claim it.
      </p>

      <div className="mt-6 flex flex-col items-center gap-2.5 lg:mt-8">
        <PrimaryButton size="md" width="fullMobile" onClick={goVerify} className="group">
          {isAuthenticated ? "See the full record" : "Verify the track record"}
          <BtnArrow />
        </PrimaryButton>
        <p className="text-center text-[10.5px] leading-relaxed text-text-muted">
          Every call preserved. No selective screenshots.
        </p>
      </div>

      <style>{`
        .lq-steps {
          display: flex;
          flex-direction: column;
          gap: 12px;
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .lq-step { position: relative; }
        .lq-step-arrow {
          display: none;
          color: rgb(var(--accent) / 0.55);
        }
        .lq-step-card {
          height: 100%;
          padding: 22px 22px 20px;
          border-radius: 18px;
          border: 1px solid rgb(var(--ink) / 0.08);
          background: rgb(var(--surface-raised) / 0.55);
        }
        .lq-step-n {
          display: block;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.16em;
          color: rgb(var(--accent));
        }
        .lq-step-title {
          margin: 10px 0 0;
          font-size: 20px;
          font-weight: 750;
          letter-spacing: -0.03em;
          line-height: 1.2;
          color: rgb(var(--ink) / 0.94);
        }
        .lq-step-body {
          margin: 10px 0 0;
          font-size: 14px;
          line-height: 1.6;
          color: rgb(var(--ink) / 0.52);
        }
        .lq-step-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin: 16px 0 0;
          padding: 0;
          list-style: none;
        }
        .lq-step-chips li {
          padding: 5px 10px;
          border-radius: 999px;
          background: rgb(var(--accent));
          color: #171304;
          font-size: 11.5px;
          font-weight: 700;
          letter-spacing: -0.01em;
        }
        @media (min-width: 1024px) {
          .lq-steps {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 0;
            align-items: stretch;
          }
          .lq-step {
            display: grid;
            grid-template-columns: auto 1fr;
            align-items: stretch;
          }
          .lq-step:first-child { grid-template-columns: 1fr; }
          .lq-step-arrow {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            flex: 0 0 36px;
          }
          .lq-step-card { padding: 24px 20px 22px; }
          .lq-step-title { font-size: 18px; }
          .lq-step-body { font-size: 13.5px; }
        }
      `}</style>
    </section>
  );
}
