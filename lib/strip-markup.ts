/**
 * Strips markup the visitor would otherwise see raw.
 *
 * The chat surface renders plain text, so every markdown construct the
 * model emits reaches the visitor literally — "**lifetime warranty**"
 * arrives with the asterisks showing. The prompt forbids markdown, and
 * the prompt forbidding things is precisely what this codebase has
 * learned not to depend on: it also forbade image placeholders, and the
 * model still wrote `![Before and after ( dental implants )]` from a
 * title it had been shown.
 *
 * Emphasis is unwrapped rather than deleted, so the words survive and
 * only the punctuation around them goes. Image embeds ARE deleted, since
 * a caption for an image that was never sent is worse than nothing.
 */
import { ENDS_WITH_QUESTION, SENTENCE_CHUNK } from "./punctuation";

export function stripMarkup(text: string): string {
  return (
    text
      // Image embeds: caption and all.
      .replace(/!\[[^\]\n]*\](?:\([^)\n]*\))?/g, "")
      .replace(/\[\[[^\]\n]*\]\]/g, "")
      // Links: keep the words, drop the target.
      .replace(/\[([^\]\n]+)\]\([^)\n]*\)/g, "$1")
      // Emphasis. Doubles first, so ** is never seen as two singles.
      .replace(/\*\*([^*\n]+)\*\*/g, "$1")
      .replace(/__([^_\n]+)__/g, "$1")
      // Singles, only when hugging the text, so "5 * 3" and file_name
      // are left alone.
      .replace(/(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/g, "$1")
      .replace(/(?<![\w_])_(?!\s)([^_\n]+?)(?<!\s)_(?![\w_])/g, "$1")
      // Inline code.
      .replace(/`([^`\n]+)`/g, "$1")
      // Headings and quote markers at the start of a line.
      .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
      .replace(/^[ \t]*>[ \t]?/gm, "")
      // List markers: keep the item, lose the bullet.
      .replace(/^[ \t]*[-*+•][ \t]+/gm, "")
      .replace(/^[ \t]*\d+\.[ \t]+/gm, "")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * Reduces a reply to a single question.
 *
 * "Never ask more than one question in a message" has been a prompt rule
 * throughout, and the assistant still asks two. The count is objective,
 * so it can be enforced rather than requested.
 *
 * The enforcement is deliberately narrow, because prose is not markup and
 * cutting it is not free. It applies ONLY when the reply ends on a
 * question, which is the shape of the failure — two asks stacked, the
 * real one last ("Would you be comfortable sharing a photo? But first,
 * could I get your name?"). Earlier questions are dropped and the closing
 * one is kept.
 *
 * A reply that does NOT end on a question is left completely alone. That
 * is what protects the rhetorical device — "What makes the difference?
 * The Swiss precision." — where the question is not an ask at all and
 * removing it would take the answer's subject with it.
 */
export function enforceSingleQuestion(text: string): string {
  // ENDS_WITH_QUESTION rather than /\?$/: Arabic closes a question with
  // ؟ and CJK with ？, so this never fired outside Latin at all,
  // which is how an Arabic reply came to ask two questions at once.
  if (!ENDS_WITH_QUESTION.test(text.trim())) return text;

  const paragraphs = text.split(/\n\n+/).map((paragraph) => {
    const sentences = paragraph.match(SENTENCE_CHUNK);
    return sentences ?? [paragraph];
  });

  const flat = paragraphs.flat();
  const questionCount = flat.filter((s) => ENDS_WITH_QUESTION.test(s.trim())).length;
  if (questionCount < 2) return text;

  let seen = 0;
  const kept = paragraphs.map((sentences) =>
    sentences
      .filter((s) => {
        if (!ENDS_WITH_QUESTION.test(s.trim())) return true;
        seen += 1;
        return seen === questionCount; // keep only the final question
      })
      .join("")
      .trim()
  );

  return kept.filter(Boolean).join("\n\n").trim();
}
