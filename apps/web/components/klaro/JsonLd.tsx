/**
 * Server-rendered JSON-LD script tag. The `</` escape prevents stray closing
 * tags in nested string values from terminating the surrounding <script>.
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
