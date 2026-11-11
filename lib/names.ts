/**
 * A neighbor's first name, or a stand-in that still reads as a sentence when
 * the name is missing. Members only ever see first names.
 *
 *   neighborName("Ada")                                   -> "Ada"
 *   neighborName("")                                      -> "your neighbor"  ("Request sent to …")
 *   neighborName("", { capitalize: true })                -> "Your neighbor"  ("… gets an email")
 *   neighborName("", { article: "a" })                   -> "a neighbor"     ("Lent by …", "From …")
 *   neighborName("", { article: "a", capitalize: true })  -> "A neighbor"     (a label on its own)
 */
export function neighborName(
  firstName: string | null | undefined,
  { article = "your", capitalize = false }: { article?: "your" | "a"; capitalize?: boolean } = {},
): string {
  const name = firstName?.trim();
  if (name) return name;
  const stand = `${article} neighbor`;
  return capitalize ? stand.charAt(0).toUpperCase() + stand.slice(1) : stand;
}
