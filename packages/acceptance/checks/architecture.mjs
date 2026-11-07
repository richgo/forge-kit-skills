import assert from 'node:assert/strict';

export function project(calm) {
  assert.equal(calm.$schema, 'https://calm.finos.org/release/1.2/meta/calm.json');
  assert.ok(Array.isArray(calm.nodes) && calm.nodes.length > 0);
  assert.ok(Array.isArray(calm.relationships));
  const ids = new Set();
  const nodes = calm.nodes.map(node => {
    const id = node['unique-id'];
    assert.match(id, /^[a-z][a-z0-9_]*$/);
    assert.ok(!ids.has(id), 'Duplicate CALM node');
    ids.add(id);
    assert.equal(node['node-type'], 'service', 'Reference projection supports CALM service nodes');
    assert.match(node.name, /^[a-zA-Z0-9 ]+$/);
    assert.ok(typeof node.description === 'string' && node.description.trim());
    return "  " + id + " = service '" + node.name + "'";
  });
  const edgeIds = new Set();
  const edges = calm.relationships.map(relationship => {
    const id = relationship['unique-id'];
    assert.ok(typeof id === 'string' && id.trim() && !edgeIds.has(id), 'Invalid CALM relationship ID');
    edgeIds.add(id);
    const type = relationship['relationship-type'];
    assert.deepEqual(Object.keys(type), ['connects']);
    const { source, destination } = type.connects;
    assert.ok(ids.has(source.node) && ids.has(destination.node), 'Unknown CALM relationship endpoint');
    return '  ' + source.node + ' -> ' + destination.node;
  });
  return [
    'specification {', '  element service', '}', 'model {', ...nodes, ...edges,
    '}', 'views {', '  view index {', '    include *', '  }', '}', '',
  ].join('\n');
}

export function validateArchitecture({ requirements, architecture, view }) {
  const calm = JSON.parse(architecture);
  const acceptance = JSON.parse(requirements);
  assert.equal(view.toString(), project(calm), 'LikeC4 view differs from the CALM projection');
  assert.ok(Array.isArray(acceptance) && acceptance.length === 1, 'Expected one reference requirement');
  const [requirement] = acceptance;
  assert.match(requirement.id, /^REQ-[0-9]+$/);
  assert.ok(calm.nodes.some(node => node['unique-id'] === requirement.node), 'Unknown requirement target');
}
