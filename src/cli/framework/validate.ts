import type { z } from 'zod';

import { ParamError } from './errors.ts';

const unitOf = (origin: string) => {
  if (origin === 'string') return ' characters';
  if (origin === 'array' || origin === 'set') return ' items';
  return '';
};

/**
 * An English description of a validation issue. Core schemas carry messages for the GUI; the CLI words its own
 * from the issue code, so it reads the same in every command.
 */
export function describeIssue(issue: z.core.$ZodIssue) {
  switch (issue.code) {
    case 'too_small':
      if (issue.origin === 'string' && Number(issue.minimum) <= 1) return 'must not be empty';
      return `must be at least ${issue.minimum}${unitOf(issue.origin)}`;
    case 'too_big':
      return `must be at most ${issue.maximum}${unitOf(issue.origin)}`;
    case 'invalid_format':
      return issue.format === 'url' ? 'must be an http or https URL' : `must be a valid ${issue.format}`;
    case 'invalid_type':
      return `must be ${issue.expected === 'array' ? 'a list' : `a ${issue.expected}`}`;
    case 'invalid_value':
      return `must be one of ${issue.values.map(String).join(', ')}`;
    default:
      return 'is invalid';
  }
}

/** Parse one parameter value with a core schema, or throw a ParamError describing the first issue. */
export function parseWith<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const [issue] = result.error.issues;
  throw new ParamError(issue ? describeIssue(issue) : 'is invalid');
}
