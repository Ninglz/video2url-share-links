export interface ParsedShareUrl {
  slug: string;
  url: string;
}

/**
 * Parses a Video2URL share URL.
 * Returns { slug, url } if valid, or null if input is invalid or not a recognized share URL.
 */
export function parseShareUrl(input: unknown): ParsedShareUrl | null;

/**
 * Builds a standard Video2URL share URL from a slug.
 * Throws TypeError if the slug is invalid.
 */
export function buildShareUrl(slug: string): string;

/**
 * Builds a direct resource access URL from a slug.
 * Throws TypeError if the slug is invalid.
 */
export function buildDirectUrl(slug: string): string;

/**
 * Generates a safe Markdown link with escaped label.
 * Throws TypeError if slug or label is invalid.
 */
export function toMarkdownLink(slug: string, label: string): string;
