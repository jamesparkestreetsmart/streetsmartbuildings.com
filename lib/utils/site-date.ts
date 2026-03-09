/**
 * Returns YYYY-MM-DD in the given site timezone.
 *
 * Uses Intl.DateTimeFormat with explicit year/month/day parts to guarantee
 * the YYYY-MM-DD format regardless of Node locale configuration.
 */
export function siteLocalDate(date: Date, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA Intl.DateTimeFormat produces "YYYY-MM-DD"
  return fmt.format(date);
}
