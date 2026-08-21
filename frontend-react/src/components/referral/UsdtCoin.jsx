// Official Tether USDT mark (green circle, white T).
// Path from the public cryptocurrency-icons set.
const USDT_GREEN = "#26A17B";

export function UsdtCoin({ size = 40, className = "" }) {
  const s = Number(size);
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="16" fill={USDT_GREEN} />
      <path
        fill="#fff"
        d="M17.922 17.383v-.002c-.11.008-.677.042-1.942.042-1.01 0-1.721-.03-1.977-.042v.003c-3.888-.171-6.79-.848-6.79-1.658 0-.809 2.902-1.486 6.79-1.66v2.644c.258.018.982.061 1.988.061 1.207 0 1.812-.05 1.931-.06v-2.643c3.88.173 6.775.85 6.775 1.658 0 .81-2.895 1.485-6.775 1.66m0-3.59v-2.366h5.414V7.819H8.595v3.608h5.414v2.365c-4.4.202-7.709 1.074-7.709 2.118 0 1.044 3.309 1.915 7.709 2.118v7.582h3.913v-7.584c4.39-.202 7.694-1.073 7.694-2.116 0-1.043-3.305-1.914-7.694-2.117"
      />
    </svg>
  );
}

export function UsdtCoinStack({ className = "" }) {
  return (
    <div className={`relative h-[120px] w-[140px] ${className}`} aria-hidden="true">
      <div className="absolute left-9 top-6 rotate-[-16deg] opacity-55">
        <UsdtCoin size={68} />
      </div>
      <div className="absolute left-[50px] top-1 rotate-[12deg] opacity-80">
        <UsdtCoin size={76} />
      </div>
      <div className="absolute left-1 top-8">
        <UsdtCoin size={92} />
      </div>
    </div>
  );
}
