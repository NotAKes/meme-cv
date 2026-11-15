import type { SVGProps } from 'react'

type IconName = 'arrow-up-right' | 'arrow-down' | 'arrow-right' | 'asterisk' | 'plus' | 'check' | 'stop'
type IconProps = Omit<SVGProps<SVGSVGElement>, 'name'> & { name: IconName }

const paths: Record<Exclude<IconName, 'stop'>, string> = {
  'arrow-up-right': 'M5 19 19 5M5 5h14v14',
  'arrow-down': 'M12 3v18m-7-7 7 7 7-7',
  'arrow-right': 'M3 12h18m-7-7 7 7-7 7',
  asterisk: 'M12 2v20M2 12h20M5 5l14 14M5 19 19 5',
  plus: 'M12 4v16M4 12h16',
  check: 'm5 12 4 4L19 6',
}

/** Paths, not Unicode glyphs: iOS cannot substitute a color emoji font. */
export function Icon({ name, className = '', ...props }: IconProps) {
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props} className={`ui-icon ${className}`.trim()} aria-hidden="true" focusable="false" data-icon={name}>
    {name === 'stop' ? <rect x="6" y="6" width="12" height="12" fill="currentColor" stroke="none" /> : <path d={paths[name]} />}
  </svg>
}
