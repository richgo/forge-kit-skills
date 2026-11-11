const title = '# Product requirements';
const headings = [
  { name: 'Epic', pattern: /^## Epic (EPIC-[0-9]+) — (\S.*)$/ },
  { name: 'Feature', pattern: /^### Feature (FEAT-[0-9]+) — (\S.*)$/ },
  { name: 'Story', pattern: /^#### Story (STORY-[0-9]+) — (\S.*)$/ },
  { name: 'Acceptance', pattern: /^##### Acceptance (AC-[0-9]+) — (\S.*)$/ },
];
const nodeId = /^`([A-Za-z_][A-Za-z0-9_-]*)`$/;
const checkId = /^- Check: `([a-z][a-z0-9]*(?:[._-][a-z0-9]+)*)`$/;

function fail(line, message) {
  throw new SyntaxError('Product requirements line ' + line + ': ' + message);
}

function sourceText(raw) {
  if (typeof raw === 'string') return raw;
  if (!(raw instanceof Uint8Array)) throw new TypeError('Expected Markdown text or UTF-8 bytes');
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw);
  } catch {
    throw new SyntaxError('Product requirements must be valid UTF-8');
  }
}

function sections(raw) {
  const lines = sourceText(raw).replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines[0].trimEnd() !== title) fail(1, 'Expected ' + title);

  const result = [];
  let current;
  for (let index = 1; index < lines.length; index++) {
    const line = index + 1;
    const value = lines[index].trimEnd();
    if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(lines[index])) fail(line, 'Invalid control character');
    if (value.includes('<!--')) fail(line, 'Unsupported Markdown comment');
    if (/^\s*#/.test(value)) {
      const level = headings.findIndex(({ pattern }) => pattern.test(value));
      if (level === -1 || /\s+#+$/.test(value)) {
        fail(line, 'Invalid heading. Use the Epic, Feature, Story, or Acceptance heading format');
      }
      const [, id, title] = headings[level].pattern.exec(value);
      current = { level, line, id, title, body: [] };
      result.push(current);
    } else if (value && !current) {
      fail(line, 'Expected an Epic heading');
    } else if (current) {
      // These constructs could hide a structural heading in rendered Markdown.
      if (/^(?:\t| {4}| {0,3}(?:\x60{3,}|~{3,}|>|<[!/?A-Za-z]|=+$|-+$))/.test(value)) {
        fail(line, 'Unsupported Markdown block');
      }
      current.body.push({ line, value });
    }
  }
  return result;
}

function bodyOf(section) {
  const first = section.body.findIndex(({ value }) => value);
  if (first === -1) return [];
  const last = section.body.findLastIndex(({ value }) => value);
  return section.body.slice(first, last + 1);
}

function field(row, pattern, label, fallback) {
  const match = row && pattern.exec(row.value);
  if (!match) fail(row?.line ?? fallback, 'Expected ' + label);
  return match[1];
}

function readOutcome(section, body) {
  const outcome = field(body[0], /^Outcome: (\S.*)$/, 'one Outcome: line', section.line);
  if (body.length > 1) fail(body[1].line, 'Unexpected content after Outcome');
  return outcome;
}

function readStory(section, body) {
  const owner = body[0];
  const references = field(owner, /^Architecture owner: (\S.*)$/, 'Architecture owner: followed by backtick-quoted node IDs', section.line);
  const nodes = references.split(',').map(reference => {
    const match = nodeId.exec(reference.trim());
    if (!match) fail(owner.line, 'Invalid Architecture owner node ID');
    return match[1];
  });
  if (new Set(nodes).size !== nodes.length) fail(owner.line, 'Duplicate Architecture owner node ID');
  if (body.length === 1) fail(owner.line, 'Expected a story description');
  if (body[1].value) fail(body[1].line, 'Expected a blank line before the story description');
  const narrative = body.slice(2);
  for (const row of narrative) {
    if (/^\s*(?:Architecture owner:|Outcome:|[-*+]\s|[0-9]+[.)]\s)/.test(row.value)) {
      fail(row.line, 'Expected story description prose');
    }
  }
  return { description: narrative.map(({ value }) => value).join('\n').trim(), nodes };
}

function readCriterion(section, body) {
  const given = field(body[0], /^- Given (\S.*)$/, '- Given followed by the setup', section.line);
  const when = field(body[1], /^- When (\S.*)$/, '- When followed by the action', section.line);
  const then = field(body[2], /^- Then (\S.*)$/, '- Then followed by the observable outcome', section.line);
  const check = field(body[3], checkId, '- Check: followed by a backtick-quoted check ID', section.line);
  if (body.length > 4) fail(body[4].line, 'Unexpected content after Check');
  return { given, when, then, check };
}

export function parseMarkdownRequirements(raw) {
  const source = sections(raw);
  const seen = new Set();
  let next = 0;

  function children(level, parentLine) {
    const items = [];
    while (source[next]?.level === level) {
      const section = source[next++];
      const { id, title, line } = section;
      if (seen.has(id)) fail(line, 'Duplicate requirements ID ' + id);
      seen.add(id);
      const body = bodyOf(section);
      switch (level) {
        case 0:
          items.push({ id, title, outcome: readOutcome(section, body), features: children(1, line) });
          break;
        case 1:
          items.push({ id, title, outcome: readOutcome(section, body), stories: children(2, line) });
          break;
        case 2:
          items.push({ id, title, ...readStory(section, body), acceptanceCriteria: children(3, line) });
          break;
        case 3:
          items.push({ id, title, ...readCriterion(section, body) });
          break;
      }
    }
    if (items.length === 0) fail(source[next]?.line ?? parentLine, 'Expected a ' + headings[level].name + ' heading');
    return items;
  }

  const epics = children(0, 1);
  if (next < source.length) fail(source[next].line, 'Unexpected heading at this level');
  return { schemaVersion: 1, epics };
}
