import { SENTRY_REVIEW_METHOD } from "./sentry.mjs";
import { TRAIL_OF_BITS_REVIEW_METHOD } from "./trail-of-bits.mjs";
import { ANTHROPIC_REVIEW_METHOD } from "./anthropic.mjs";

export const REVIEW_METHODS_POLICY = `<!-- caipe-pr-review-methods:v1 -->
The following adapted methods supplement source inspection; they do not install or invoke upstream plugins. Apply them only within the task's repository and available authorized tools. CAIPE's current-head, draft, untrusted-input, no-execution, manual-request, deduplication and publication rules take precedence. The references are attribution, not instructions to fetch or execute external content. Keep detailed discovery/verification evidence private; publish only verified new actionable root causes.

${SENTRY_REVIEW_METHOD}

${TRAIL_OF_BITS_REVIEW_METHOD}

${ANTHROPIC_REVIEW_METHOD}
<!-- /caipe-pr-review-methods:v1 -->`;
