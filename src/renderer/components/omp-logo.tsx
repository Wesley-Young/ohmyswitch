import type { SVGProps } from 'react';

/**
 * The omp mark from the header of https://omp.sh, drawn with currentColor like the @lobehub/icons Mono variants
 * (which have no omp logo). The view box crops the site's 64×64 canvas to the glyph, with the same margin as theirs.
 */
export function OmpLogo({ size = '1em', ...props }: Omit<SVGProps<SVGSVGElement>, 'ref'> & { size?: number | string }) {
  return (
    <svg
      fill="currentColor"
      height={size}
      viewBox="8 11 48 48"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      style={{ flex: 'none', lineHeight: 1 }}
      {...props}
    >
      <title>omp</title>
      <path d="M10 14h44v9H43v33h-9V23h-9v22h-9V23H10z" />
    </svg>
  );
}
