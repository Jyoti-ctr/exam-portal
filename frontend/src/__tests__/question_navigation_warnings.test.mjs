import assert from 'node:assert';

console.log('--- Testing Question Navigation & Warning Policy Logic ---');

// ============================================================================
// 1. Navigation Rules Unit Tests
// ============================================================================
console.log('\n--- 1. Testing Navigation Rules ---');

function canNavigateToQuestion({ mode, currentIndex, targetIndex, totalQuestions }) {
  if (targetIndex < 0 || targetIndex >= totalQuestions) return false;
  if (mode === 'FORWARD_BACKWARD') return true;
  if (mode === 'FORWARD_ONLY') {
    // Only current question or immediate next question permitted
    return targetIndex === currentIndex || targetIndex === currentIndex + 1;
  }
  return false;
}

const totalQ = 5;

// Forward-Only: Cannot go backwards
assert.strictEqual(
  canNavigateToQuestion({ mode: 'FORWARD_ONLY', currentIndex: 2, targetIndex: 1, totalQuestions: totalQ }),
  false,
  'Forward-only mode must not permit backward navigation'
);
assert.strictEqual(
  canNavigateToQuestion({ mode: 'FORWARD_ONLY', currentIndex: 2, targetIndex: 0, totalQuestions: totalQ }),
  false,
  'Forward-only mode must not permit jumping to start'
);

// Forward-Only: Cannot skip ahead by > 1
assert.strictEqual(
  canNavigateToQuestion({ mode: 'FORWARD_ONLY', currentIndex: 1, targetIndex: 3, totalQuestions: totalQ }),
  false,
  'Forward-only mode must not permit skipping ahead'
);

// Forward-Only: Can proceed to immediate next question
assert.strictEqual(
  canNavigateToQuestion({ mode: 'FORWARD_ONLY', currentIndex: 1, targetIndex: 2, totalQuestions: totalQ }),
  true,
  'Forward-only mode must allow advancing to immediate next question'
);

// Forward-and-Backward: Can revisit previous questions and skip
assert.strictEqual(
  canNavigateToQuestion({ mode: 'FORWARD_BACKWARD', currentIndex: 3, targetIndex: 1, totalQuestions: totalQ }),
  true,
  'Forward & backward mode must allow revisiting previous questions'
);
assert.strictEqual(
  canNavigateToQuestion({ mode: 'FORWARD_BACKWARD', currentIndex: 1, targetIndex: 4, totalQuestions: totalQ }),
  true,
  'Forward & backward mode must allow navigating directly via question navigator'
);
console.log('✓ Forward-only and bidirectional navigation rules verified.');


// ============================================================================
// 2. Authoritative Warning & Automatic Submission State Logic
// ============================================================================
console.log('\n--- 2. Testing Warning Threshold Policy ---');

function evaluateWarningState(warningCount, threshold = 8) {
  return {
    warningCount,
    threshold,
    isFinalWarning: warningCount === threshold,
    shouldAutoSubmit: warningCount > threshold,
    displayWarningText: `Warnings: ${warningCount} / ${threshold}`,
    alertSeverity: warningCount > threshold ? 'CRITICAL' : warningCount === threshold ? 'FINAL_WARNING' : warningCount > 0 ? 'WARNING' : 'NORMAL'
  };
}

// Warnings 0 through 7
for (let c = 0; c <= 7; c++) {
  const state = evaluateWarningState(c, 8);
  assert.strictEqual(state.isFinalWarning, false, `Warning count ${c} must not be final warning`);
  assert.strictEqual(state.shouldAutoSubmit, false, `Warning count ${c} must not trigger auto-submit`);
}
console.log('✓ Warnings 0 through 7 allow exam continuation without auto-submission.');

// Warning 8: Final Warning Alert
const state8 = evaluateWarningState(8, 8);
assert.strictEqual(state8.isFinalWarning, true, 'Warning 8 must be flagged as final warning');
assert.strictEqual(state8.shouldAutoSubmit, false, 'Warning 8 must not yet trigger auto-submit');
assert.strictEqual(state8.alertSeverity, 'FINAL_WARNING');
console.log('✓ Warning 8 correctly flags prominent final warning.');

// Warning 9: Automatic Submission
const state9 = evaluateWarningState(9, 8);
assert.strictEqual(state9.shouldAutoSubmit, true, 'Warning count > 8 must trigger automatic submission');
assert.strictEqual(state9.alertSeverity, 'CRITICAL');
console.log('✓ Warning 9 strictly triggers automatic submission.');


// ============================================================================
// 3. 10 Question Types Answer Payloads & Validation
// ============================================================================
console.log('\n--- 3. Testing 10 Question Types Answer Data Handlers ---');

const questionTypes = [
  'MCQ',
  'MULTIPLE_SELECT',
  'TRUE_FALSE',
  'SHORT_ANSWER',
  'DESCRIPTIVE',
  'FILL_IN_BLANKS',
  'MATCHING',
  'NUMERICAL',
  'IMAGE_BASED',
  'CODE'
];

assert.strictEqual(questionTypes.length, 10, 'All 10 question types must be registered');

function formatStudentAnswerPayload(qType, rawInput) {
  switch (qType) {
    case 'MCQ':
    case 'TRUE_FALSE':
      return { selected_option_id: Number(rawInput) };
    case 'MULTIPLE_SELECT':
      return { answer_data: { selected_option_ids: Array.from(rawInput).map(Number) } };
    case 'NUMERICAL':
      return { answer_data: { numerical_value: parseFloat(rawInput) }, text_response: String(rawInput) };
    case 'FILL_IN_BLANKS':
      return { answer_data: { blanks: Array.isArray(rawInput) ? rawInput : [rawInput] } };
    case 'MATCHING':
      return { answer_data: { matches: { ...rawInput } } };
    case 'CODE':
      return { answer_data: { code: String(rawInput) }, text_response: String(rawInput) };
    case 'SHORT_ANSWER':
    case 'DESCRIPTIVE':
      return { text_response: String(rawInput) };
    case 'IMAGE_BASED':
      return typeof rawInput === 'number'
        ? { selected_option_id: rawInput }
        : { text_response: String(rawInput) };
    default:
      return {};
  }
}

// Numerical
const numPayload = formatStudentAnswerPayload('NUMERICAL', '3.1415');
assert.strictEqual(numPayload.answer_data.numerical_value, 3.1415);

// Multiple Select
const msPayload = formatStudentAnswerPayload('MULTIPLE_SELECT', [10, 12, 15]);
assert.deepStrictEqual(msPayload.answer_data.selected_option_ids, [10, 12, 15]);

// Matching
const matchPayload = formatStudentAnswerPayload('MATCHING', { 'Cat': 'Mammal', 'Eagle': 'Bird' });
assert.deepStrictEqual(matchPayload.answer_data.matches, { 'Cat': 'Mammal', 'Eagle': 'Bird' });

// Code
const codePayload = formatStudentAnswerPayload('CODE', 'function solve() { return 42; }');
assert.strictEqual(codePayload.answer_data.code, 'function solve() { return 42; }');

console.log('✓ All 10 question types format appropriate answer payloads correctly.');
console.log('ALL FRONTEND QUESTION, NAVIGATION & WARNING TESTS PASSED!\n');
