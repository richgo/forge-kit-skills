import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const architecture = new URL('../packages/architecture/', import.meta.url);
const snapshot = {
  requirements: { schemaVersion: 1, epics: [] },
  calm: {
    $schema: 'https://calm.finos.org/release/1.2/meta/calm.json',
    nodes: [{ 'unique-id': 'probe', 'node-type': 'service', name: 'Probe', description: 'Reports readiness.' }],
    relationships: [],
  },
  view: [
    'specification {', '  element service', '}', 'model {', '  probe = service "Probe"', '}',
    'views {', '  view landscape {', '    include *', '  }', '}',
  ].join('\n'),
};

test('the published architecture package exports an impact planner that runs independently', async () => {
  const { exports } = JSON.parse(await readFile(new URL('exports.json', architecture), 'utf8'));
  const entry = exports.find(item => item.kind === 'impact-planner');
  assert.ok(entry, 'The architecture package does not export an impact planner');
  const { planImpact } = await import(new URL(entry.path, architecture));
  const after = structuredClone(snapshot);
  after.calm.nodes[0].description = 'Reports liveness and readiness.';

  const plan = planImpact(snapshot, after);
  assert.deepEqual(plan.changes.nodes, [{ id: 'probe', change: 'changed' }]);
  assert.deepEqual(plan.scope.architectureSeeds, ['probe']);
  assert.deepEqual(plan.scope.acceptanceToRun, []);
});
