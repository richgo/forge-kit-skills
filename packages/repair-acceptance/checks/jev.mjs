const jevModel = 'jev-1.13.0';
const jevTimeoutMs = 5000;
const jevResponseBytes = 16_384;
const failures = ['readiness-mismatch', 'unclassified-failure', 'ambiguous-failure'];
const attemptKeys = ['used', 'limit'];
const budgetKeys = [...attemptKeys, 'elapsedMs', 'timeLimitMs', 'spentUnits', 'spendLimitUnits', 'retryCostUnits'];

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function hasKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

async function readJevResponse(response) {
  // Preserve the response.json() transport seam for existing injected callers.
  if (!response.body?.getReader) return response.json();
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('Content-Type') ?? '')) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let json = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return JSON.parse(json + decoder.decode());
      size += value.byteLength;
      if (size > jevResponseBytes) {
        void reader.cancel().catch(() => {});
        return null;
      }
      json += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

export async function requestJevRepair(token, send = fetch, options = {}) {
  const { state, timeoutMs = jevTimeoutMs } = options ?? {};
  let approvedState = 'The fixture readiness check rejected the candidate build.';
  if (state !== undefined) {
    if (!hasKeys(state, ['failure', 'used', 'limit'])) return null;
    const { failure, used, limit } = state;
    if (!failures.includes(failure) || !isCount(used) || !isCount(limit) || used > limit) return null;
    approvedState = { failure, used, limit };
  }

  return askJev(token, send, {
    state: approvedState, timeoutMs, requireModel: state !== undefined,
    instructions: state === undefined ? 'Recommend one bounded retry for this known fixture failure, or escalate.' :
      'Recommend one bounded rebuild from the same approved inputs or escalate for human review.',
    criteria: state === undefined ? { 'retry-build': 'Retry the fixture build', escalate: 'Request human review' } : {
      'retry-build': 'A confirmed readiness-mismatch with used below limit is eligible for one retry.',
      escalate: 'The failure is unclassified or ambiguous, or used has reached limit.',
    },
  });
}

export async function requestJevRuntime(token, send = fetch, state, timeoutMs = jevTimeoutMs) {
  if (!hasKeys(state, ['failure']) ||
      !['confirmed-content-mismatch', 'unconfirmed'].includes(state.failure)) return null;
  return askJev(token, send, {
    state: { failure: state.failure }, timeoutMs, requireModel: true,
    instructions: 'Recommend one bounded response to a Pages runtime observation.',
    criteria: {
      restore: 'The live release is confirmed and its content digest mismatches.',
      'retry-observation': 'Repeat observation once to confirm a potentially transient failure.',
      escalate: 'Request human review when the release identity or cause is uncertain.',
    },
  });
}

async function askJev(token, send, { state, timeoutMs, requireModel, instructions, criteria }) {
  if (typeof token !== 'string' || !/^[\x21-\x7e]+$/.test(token) ||
      !isCount(timeoutMs) || timeoutMs === 0 || timeoutMs > jevTimeoutMs) return null;

  const choices = Object.keys(criteria);
  const controller = new AbortController();
  let timer;
  const deadline = new Promise(resolve => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, timeoutMs);
  });
  const evaluate = async () => {
    const response = await send('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      redirect: 'error',
      signal: controller.signal,
      body: JSON.stringify({
        model: jevModel,
        state,
        questions: { repair: { type: 'choice', instructions, criteria } },
      }),
    });
    if (response.ok !== true || (response.status !== undefined && response.status !== 200)) return null;
    const result = await readJevResponse(response);
    if (!hasKeys(result?.answers, ['repair']) ||
        ((requireModel || result.model !== undefined) && result.model !== jevModel)) return null;
    const answer = result.answers.repair;
    if (answer?.type !== 'choice' || !choices.includes(answer.choice)) return null;
    const probabilities = answer.probabilities;
    if (!hasKeys(probabilities, choices)) return null;
    const scores = Object.values(probabilities);
    if (!scores.every(value => Number.isFinite(value) && value >= 0 && value <= 1) ||
        Math.abs(scores.reduce((sum, value) => sum + value, 0) - 1) > 0.001) {
      return null;
    }
    const selected = probabilities[answer.choice];
    if (choices.some(choice => choice !== answer.choice && selected <= probabilities[choice])) return null;
    return { choice: answer.choice, probability: selected };
  };
  try {
    return await Promise.race([evaluate(), deadline]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

// Attempt-only callers keep their original contract. Budgeted callers must
// supply all time and spend fields together, using their local clock and meter.
export function repairBudgetAllowsRetry(budget) {
  const attemptOnly = hasKeys(budget, attemptKeys);
  const keys = attemptOnly ? attemptKeys : budgetKeys;
  if (!hasKeys(budget, keys) || !keys.every(key => isCount(budget[key])) || budget.used >= budget.limit) return false;
  if (attemptOnly) return true;
  const { elapsedMs, timeLimitMs, spentUnits, spendLimitUnits, retryCostUnits } = budget;
  return elapsedMs < timeLimitMs && retryCostUnits > 0 && retryCostUnits <= spendLimitUnits - spentUnits;
}

export function routeRepair(signal, budget) {
  if (signal?.choice === 'retry-build' && Number.isFinite(signal.probability) &&
      signal.probability >= 0.8 && signal.probability <= 1 &&
      repairBudgetAllowsRetry(budget)) {
    return 'retry-build';
  }
  return 'escalate';
}
