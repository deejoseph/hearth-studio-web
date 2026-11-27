/**
 * 复盘规则层的变异测试：故意改坏 review.js 的十处关键逻辑，看测试能不能抓到。
 *
 *   node tools/review-mutate.mjs
 *
 * 和 PHP 那边的 chess_room_core_mutate.php / chess_class_core_mutate.php 同一个道理：
 * 一份"全绿"既可能说明代码对，也可能说明测试压根没在看。每处变异只改一行，
 * 改的就是复盘层里一条独立规则（阈值、方向、公式、排序、分类计数）。
 * 抓到就说明那条规则真的在被测试覆盖；漏了就是要补测试用例。
 *
 * 退出码：0 = 十处全变红且控制组全绿；1 = 有一处没抓到或控制组不干净。
 */

import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const srcDir = join(root, 'src');
const reviewSrc = join(srcDir, 'game', 'review.js');
const testDir = join(root, 'tests');
const reviewTest = join(testDir, 'review.test.js');

// Verify source files exist
for (const path of [reviewSrc, reviewTest]) {
  if (!existsSync(path)) {
    console.error(`missing: ${path}`);
    process.exit(2);
  }
}

// Create a temp directory for mutations
const scratch = join(root, '.mutation-scratch');
if (existsSync(scratch)) {
  execSync(`rm -rf "${scratch}"`);
}
mkdirSync(join(scratch, 'game'), { recursive: true });
mkdirSync(join(scratch, 'tests'), { recursive: true });

const clean = readFileSync(reviewSrc, 'utf8');
const mutatedReview = join(scratch, 'game', 'review.js');

// Define mutations: [label, needle, replacement]
const mutations = [
  [
    'M1 错着阈值改大',
    'blunder: 200,',
    'blunder: 300,',
  ],
  [
    'M2 漏着阈值改大',
    'mistake: 100,',
    'mistake: 150,',
  ],
  [
    'M3 黑方损失方向反',
    `const loss = turn === 'w'
    ? evalBefore - evalAfter
    : evalAfter - evalBefore;`,
    `const loss = turn === 'w'
    ? evalAfter - evalBefore
    : evalBefore - evalAfter;`,
  ],
  [
    'M4 最佳走法检查去掉',
    `if (playedMove && bestMove && playedMove === bestMove) {
    return { classification: 'best', loss: Math.max(0, loss) };
  }`,
    `if (false) {
    return { classification: 'best', loss: Math.max(0, loss) };
  }`,
  ],
  [
    'M5 准确率公式改错',
    'const score = Math.max(0, 100 - r.loss / 2);',
    'const score = Math.max(0, 100 - r.loss);',
  ],
  [
    'M6 黑白方判定反',
    `if (turn === 'w') {
      whiteScores.push(score);
    } else {
      blackScores.push(score);
    }`,
    `if (turn === 'b') {
      whiteScores.push(score);
    } else {
      blackScores.push(score);
    }`,
  ],
  [
    'M7 不精确阈值改大',
    'inaccuracy: 50,',
    'inaccuracy: 75,',
  ],
  [
    'M8 损失下限钳位去掉',
    `return { classification: 'good', loss: Math.max(0, loss) };`,
    `return { classification: 'good', loss };`,
  ],
  [
    'M9 转折点排序反',
    '.sort((a, b) => b.swing - a.swing);',
    '.sort((a, b) => a.swing - b.swing);',
  ],
  [
    'M10 分类计数不过滤无效键',
    `if (r.classification && counts[r.classification] !== undefined) {
      counts[r.classification]++;
    }`,
    `counts[r.classification]++;`,
  ],
  ['控制：一个字都不改', null, null],
];

/**
 * Parse vitest output to extract test results.
 */
function parseVitestOutput(output, exitCode) {
  const result = {
    passed: 0,
    failed: 0,
    crash: null,
    failureSamples: [],
  };

  // Check for crash
  if (output.includes('SyntaxError') || output.includes('ReferenceError') ||
      output.includes('TypeError') || output.includes('Error:')) {
    const match = output.match(/(?:SyntaxError|ReferenceError|TypeError|Error):[^\n]+/);
    if (match) result.crash = match[0];
  }

  // Parse test counts
  const passedMatch = output.match(/Tests\s+(\d+)\s+passed/);
  const failedMatch = output.match(/Tests\s+(\d+)\s+failed/);
  const totalPassedMatch = output.match(/(\d+)\s+passed/);

  if (passedMatch) result.passed = parseInt(passedMatch[1], 10);
  if (failedMatch) result.failed = parseInt(failedMatch[1], 10);

  // Extract failure messages
  const failLines = output.split('\n').filter(line =>
    line.includes('FAIL') || line.includes('AssertionError') || line.includes('×')
  );
  result.failureSamples = failLines.slice(0, 5);

  return result;
}

let allPassed = true;
const results = [];

console.log('复盘规则层变异测试');
console.log('='.repeat(60));
console.log('');

for (const [label, needle, replacement] of mutations) {
  const isControl = needle === null;

  if (isControl) {
    // Control: use the original file
    writeFileSync(mutatedReview, clean);
  } else if (!clean.includes(needle)) {
    console.log(`!! ${label}: 规则层里找不到要改的那一行，这条结论作废`);
    results.push({ label, status: 'skip', reason: '改不动' });
    allPassed = false;
    continue;
  } else {
    // Apply mutation
    const mutated = clean.replace(needle, replacement);
    writeFileSync(mutatedReview, mutated);
  }

  // Run vitest with the mutated file
  // We need to temporarily replace the source file
  const backupPath = reviewSrc + '.backup';
  writeFileSync(backupPath, readFileSync(reviewSrc));

  try {
    writeFileSync(reviewSrc, readFileSync(mutatedReview));

    let output = '';
    let exitCode = 0;
    try {
      output = execSync(`npm test -- tests/review.test.js --reporter=verbose 2>&1`, {
        cwd: root,
        encoding: 'utf8',
        timeout: 30000,
      });
    } catch (e) {
      output = e.stdout || e.stderr || e.message;
      exitCode = e.status || 1;
    }

    const parsed = parseVitestOutput(output, exitCode);

    if (isControl) {
      // Control must pass all tests
      const controlOk = exitCode === 0 && parsed.failed === 0;
      const status = controlOk ? 'pass' : 'fail';
      const detail = controlOk
        ? `全绿（${parsed.passed} 条断言）`
        : `不干净：${parsed.failed} 条失败`;

      console.log(`${label.padEnd(24)} ${detail}`);
      results.push({ label, status, detail, parsed });

      if (!controlOk) {
        allPassed = false;
        if (parsed.failureSamples.length > 0) {
          console.log(`    ${parsed.failureSamples[0]}`);
        }
      }
    } else {
      // Mutation should be caught (tests should fail)
      const caught = exitCode !== 0 || parsed.failed > 0;
      const status = caught ? 'caught' : 'missed';
      const detail = caught
        ? `抓到 ${parsed.failed} 条`
        : '没抓到 —— 用例里没有能暴露它的输入';

      console.log(`${label.padEnd(24)} ${detail}`);
      results.push({ label, status, detail, parsed });

      if (!caught) {
        allPassed = false;
      } else if (parsed.failureSamples.length > 0) {
        // Show first failure sample
        const sample = parsed.failureSamples.find(s => s.includes('×')) || parsed.failureSamples[0];
        if (sample) console.log(`    ${sample.trim().substring(0, 70)}`);
      }
    }
  } finally {
    // Restore original file
    writeFileSync(reviewSrc, readFileSync(backupPath));
    unlinkSync(backupPath);
  }
}

// Cleanup
execSync(`rm -rf "${scratch}"`);

console.log('');
console.log('='.repeat(60));

if (allPassed) {
  console.log('十处变异全部变红，控制组全绿 —— 复盘规则确实逐条在被测试覆盖。');
  process.exit(0);
} else {
  const missed = results.filter(r => r.status === 'missed');
  const skipped = results.filter(r => r.status === 'skip');
  const controlFail = results.find(r => r.label === '控制：一个字都不改' && r.status === 'fail');

  console.log('');
  console.log('反向验证不成立：');
  if (controlFail) console.log('  - 控制组不干净');
  for (const r of missed) console.log(`  - ${r.label}（漏了）`);
  for (const r of skipped) console.log(`  - ${r.label}（${r.reason}）`);
  process.exit(1);
}
