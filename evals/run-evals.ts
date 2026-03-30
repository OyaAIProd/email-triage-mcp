import { runClassifyEvals } from './eval-classify.js';
import { runExtractEvals } from './eval-extract.js';

console.log('========================================');
console.log('  Email Triage MCP — Evaluation Suite');
console.log('========================================\n');

// ── Classification Evals ─────────────────────────────────────────────

console.log('--- Classification Evals ---\n');

const classifyResults = runClassifyEvals();

for (const r of classifyResults.results) {
  const icon = r.passed ? 'PASS' : 'FAIL';
  const detail = r.passed
    ? `(${r.got}, confidence: ${r.confidence})`
    : `(expected: ${r.expected}, got: ${r.got}, confidence: ${r.confidence})`;
  console.log(`  [${icon}] ${r.name} ${detail}`);
}

console.log(`\n  Classification: ${classifyResults.passed}/${classifyResults.passed + classifyResults.failed} passed\n`);

// ── Extraction Evals ─────────────────────────────────────────────────

console.log('--- Extraction Evals ---\n');

const extractResults = runExtractEvals();

for (const r of extractResults.results) {
  const icon = r.passed ? 'PASS' : 'FAIL';
  console.log(`  [${icon}] ${r.name}`);
  console.log(`         ${r.details}`);
}

console.log(`\n  Extraction: ${extractResults.passed}/${extractResults.passed + extractResults.failed} passed\n`);

// ── Summary ──────────────────────────────────────────────────────────

const totalPassed = classifyResults.passed + extractResults.passed;
const totalFailed = classifyResults.failed + extractResults.failed;
const total = totalPassed + totalFailed;

console.log('========================================');
console.log(`  TOTAL: ${totalPassed}/${total} passed`);

if (totalFailed > 0) {
  console.log(`  ${totalFailed} failure(s)`);
}

console.log('========================================');

process.exit(totalFailed > 0 ? 1 : 0);
