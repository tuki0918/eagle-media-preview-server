/** Shows `text` with every case-insensitive occurrence of `query` in blue, like the sidebar folder search. */
export function HighlightedText({ query, text }: { query: string; text: string }) {
  const needle = query.trim();
  if (!needle) return <>{text}</>;
  const escapedQuery = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    <>
      {text.split(new RegExp(`(${escapedQuery})`, "giu")).map((part, index) => (
        index % 2 === 1
          ? <mark key={index} className="bg-transparent text-blue-700 dark:text-blue-400">{part}</mark>
          : part
      ))}
    </>
  );
}
