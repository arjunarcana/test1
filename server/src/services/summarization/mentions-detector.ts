/**
 * MentionsDetector - detects when configured names appear in transcript
 * segments and classifies the intent using simple keyword heuristics.
 *
 * Intent classification:
 *   - "action_request" : contains "can you", "please", "need to", "should", "could you"
 *   - "question"       : contains "?"
 *   - "fyi"            : default / informational
 */

export interface MentionEvent {
  /** The matched name. */
  name: string;
  /** The full segment text as context. */
  context: string;
  /** Timestamp of the segment. */
  timestamp: number;
  /** Classified intent / sentiment. */
  sentiment: string;
}

/** Keywords that signal an action request. */
const ACTION_KEYWORDS = [
  "can you",
  "could you",
  "please",
  "need to",
  "needs to",
  "should",
  "make sure",
  "follow up",
  "take care of",
  "handle",
  "own this",
  "assigned to",
];

export class MentionsDetector {
  private names: string[];

  /**
   * @param names List of names to watch for (case-insensitive).
   */
  constructor(names: string[]) {
    this.names = names.map((n) => n.trim()).filter(Boolean);
  }

  /**
   * Update the list of watched names (e.g., from user settings).
   */
  setNames(names: string[]): void {
    this.names = names.map((n) => n.trim()).filter(Boolean);
  }

  /**
   * Check a transcript segment for mentions.
   * Returns an array of MentionEvents (may be empty).
   */
  detect(text: string, timestamp: number): MentionEvent[] {
    if (this.names.length === 0) return [];

    const lowerText = text.toLowerCase();
    const events: MentionEvent[] = [];

    for (const name of this.names) {
      if (lowerText.includes(name.toLowerCase())) {
        events.push({
          name,
          context: text,
          timestamp,
          sentiment: classifyIntent(text),
        });
      }
    }

    return events;
  }
}

/**
 * Classify the intent of a transcript segment using keyword heuristics.
 */
function classifyIntent(text: string): string {
  const lower = text.toLowerCase();

  // Check for action request keywords
  for (const kw of ACTION_KEYWORDS) {
    if (lower.includes(kw)) {
      return "action_request";
    }
  }

  // Check for question
  if (text.includes("?")) {
    return "question";
  }

  return "fyi";
}
