/** Shows `text` with every case-insensitive occurrence of `query` in blue, like the sidebar folder search. */
export function HighlightedText({ className = "text-blue-700 dark:text-blue-400", query, text }: { className?: string; query: string; text: string }) {
  const needle = query.trim();
  if (!needle) return <>{text}</>;
  const escapedQuery = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    <>
      {text.split(new RegExp(`(${escapedQuery})`, "giu")).map((part, index) => (
        index % 2 === 1
          ? <mark key={index} className={`bg-transparent ${className}`}>{part}</mark>
          : part
      ))}
    </>
  );
}
