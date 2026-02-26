function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function levenshtein(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  const m = left.length;
  const n = right.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];
}

export function similarity(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  const maxLen = Math.max(left.length, right.length);
  if (maxLen === 0) return 1;
  const distance = levenshtein(left, right);
  return 1 - distance / maxLen;
}

export function nearMatch(input, candidates, threshold = 0.84) {
  const normalized = normalize(input);
  if (!normalized) return { matched: false, score: 0, candidate: null };

  let bestScore = 0;
  let best = null;
  (candidates || []).forEach((candidate) => {
    const score = similarity(normalized, candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  });

  return {
    matched: bestScore >= threshold,
    score: Number(bestScore.toFixed(3)),
    candidate: best,
  };
}
