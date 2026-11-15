import type { SVGProps } from 'react'

/** Original line emblem, intentionally simple enough to work at favicon size. */
export function CatMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
      <path d="M9 24 8 8l13 9a23 23 0 0 1 7 0L40 8l-1 16c3 13-5 18-15 18S6 37 9 24Z" stroke="currentColor" strokeWidth="2.3" strokeLinejoin="round" />
      <path d="m15 26 4 1m10 0 4-1m-11 5 2 2 2-2m-2 2v3m-11-3-9-2m9 6-8 2m30-6 9-2m-9 6 8 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default CatMark
