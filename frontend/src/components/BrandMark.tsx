// Знак «Анемо»: ветротурбина — ротор из трёх изогнутых лопастей под 120° на тонкой мачте. Без кольца вокруг ротора,
// чтобы знак не напоминал чужие эмблемы. Цвет — currentColor (в шапке — var(--primary)); та же геометрия — в public/favicon.svg.

const BLADE = 'M24 18 C20.6 13.6 20.9 8.6 24 4.5'

export function BrandMark(props: { size?: number; title?: string }) {
  const s = props.size ?? 24
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 48 48"
      fill="none"
      role={props.title ? 'img' : undefined}
      aria-hidden={props.title ? undefined : true}
      aria-label={props.title}
    >
      <path d="M24 21 L24 44" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" opacity="0.55" />
      <g stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
        <path d={BLADE} />
        <path d={BLADE} transform="rotate(120 24 18)" />
        <path d={BLADE} transform="rotate(240 24 18)" />
      </g>
      <circle cx="24" cy="18" r="3.2" fill="currentColor" />
    </svg>
  )
}
