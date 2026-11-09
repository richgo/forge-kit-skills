import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const kinds = ['connects', 'interacts', 'deployed-in', 'composed-of'];
const directions = ['source-to-destination', 'destination-to-source'];
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const sorted = values => [...new Set(values)].sort(compare);
const ordered = map => [...map.keys()].sort(compare).map(id => map.get(id));

function record(value, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), label + ' must be an object');
  return value;
}

function string(value, label) {
  assert.ok(typeof value === 'string' && value.trim().length > 0, label + ' must be a nonempty string');
  return value;
}

function list(value, label, minimum = 0) {
  assert.ok(Array.isArray(value) && value.length >= minimum, label + ' must be an array with at least ' + minimum + ' entries');
  return value;
}

function index(items, label, normalize) {
  const result = new Map();
  for (const item of list(items, label)) {
    const id = string(record(item, label)['unique-id'], label + ' unique-id');
    assert.ok(!result.has(id), 'Duplicate ' + label + ' ID ' + id);
    result.set(id, normalize(item, id));
  }
  return result;
}

function references(values, label, check, minimum = 0) {
  const items = list(values, label, minimum).map(check);
  assert.equal(new Set(items).size, items.length, 'Duplicate reference in ' + label);
  return sorted(items);
}

function readArchitecture(calm) {
  const { nodes, relationships, flows = [], ...global } = record(calm, 'CALM architecture');
  const interfaces = new Map();
  const components = index(nodes, 'node', (value, node) => {
    const { interfaces: exposed = [], ...details } = value;
    string(value['node-type'], 'Node type');
    string(value.name, 'Node name');
    string(value.description, 'Node description');
    const byId = index(exposed, 'interface on ' + node, (definition, id) => {
      interfaces.set(JSON.stringify([node, id]), { id, node, definition });
      return definition;
    });
    return { details, interfaces: byId };
  });
  assert.ok(components.size, 'CALM architecture requires at least one node');

  const nodeId = value => {
    assert.ok(components.has(value), 'Unknown node ' + value);
    return value;
  };
  const endpoint = (value, label) => {
    const { node, interfaces = [], ...other } = record(value, label);
    nodeId(node);
    const ids = references(interfaces, label + ' interfaces', id => {
      assert.ok(components.get(node).interfaces.has(id), 'Unknown interface ' + id + ' on ' + node);
      return id;
    });
    return { node, interfaces: ids, ...other };
  };
  const links = index(relationships, 'relationship', (value, id) => {
    const { 'relationship-type': type, ...details } = value;
    const [kind, ...other] = Object.keys(record(type, 'Relationship type'));
    assert.ok(kinds.includes(kind) && other.length === 0, 'Unsupported relationship type in ' + id);
    const detail = record(type[kind], kind);
    let contract;
    let edges;
    if (kind === 'connects') {
      const source = endpoint(detail.source, 'Connects source');
      const destination = endpoint(detail.destination, 'Connects destination');
      contract = { ...detail, source, destination };
      edges = [[source.node, destination.node]];
    } else {
      const owner = nodeId(kind === 'interacts' ? detail.actor : detail.container);
      const members = references(detail.nodes, kind + ' nodes', nodeId, 1);
      contract = { ...detail, nodes: members };
      edges = members.map(member => kind === 'deployed-in' ? [member, owner] : [owner, member]);
    }
    return { details, kind, contract, edges };
  });
  const processes = index(flows, 'flow', value => {
    string(value.name, 'Flow name');
    string(value.description, 'Flow description');
    const numbers = new Set();
    const transitions = list(value.transitions, 'Flow transitions', 1).map(transition => {
      const { 'relationship-unique-id': link, 'sequence-number': number,
        direction = directions[0], description } = record(transition, 'Flow transition');
      assert.ok(links.has(link), 'Unknown relationship ' + link);
      assert.ok(Number.isSafeInteger(number) && number > 0, 'Invalid sequence number');
      assert.ok(!numbers.has(number), 'Duplicate sequence number ' + number);
      numbers.add(number);
      assert.ok(directions.includes(direction), 'Unsupported flow direction');
      string(description, 'Transition description');
      return { ...transition, direction };
    });
    transitions.sort((left, right) => left['sequence-number'] - right['sequence-number']);
    return { ...value, transitions };
  });
  return { global, components, interfaces, links, processes };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort(compare).map(key => [key, canonical(value[key])]));
  }
  return value;
}

function viewId(id) {
  return /^[a-zA-Z0-9_-]+$/.test(id)
    ? 'n_' + id.replaceAll('_', '__').replaceAll('-', '_h')
    : 'x_' + Buffer.from(id, 'utf8').toString('hex');
}

function renderView({ global, components, links, processes }) {
  const normalized = {
    ...global,
    nodes: ordered(components).map(({ details, interfaces }) => ({ ...details, interfaces: ordered(interfaces) })),
    relationships: ordered(links).map(({ details, kind, contract }) => ({
      ...details, 'relationship-type': { [kind]: contract },
    })),
    flows: ordered(processes),
  };
  const hash = createHash('sha256').update(JSON.stringify(canonical(normalized))).digest('hex');
  const elements = ordered(components).map(({ details }) =>
    '  ' + viewId(details['unique-id']) + ' = component ' + JSON.stringify(details.name));
  const connections = ordered(links).flatMap(({ details, kind, edges }) => edges.map(([source, destination]) =>
    '  ' + viewId(source) + ' -> ' + viewId(destination) + ' ' + JSON.stringify(details['unique-id'] + ' (' + kind + ')')));
  return [
    '// Generated from CALM sha256:' + hash, 'specification {', '  element component', '}', 'model {',
    ...elements, ...connections, '}', 'views {', '  view index {', '    include *', '  }', '}', '',
  ].join('\n');
}

export function renderLikeC4(calm) {
  return renderView(readArchitecture(calm));
}

function readSnapshot(snapshot) {
  const model = readArchitecture(record(snapshot, 'Architecture snapshot').calm);
  assert.equal(string(snapshot.likec4, 'LikeC4 view').replaceAll('\r\n', '\n'), renderView(model),
    'LikeC4 drift. Regenerate the view from the authoritative CALM document.');
  return model;
}

function diff(before, after, select = value => value) {
  return sorted([...before.keys(), ...after.keys()]).flatMap(id => {
    const old = before.get(id);
    const next = after.get(id);
    if (old === undefined) return [{ id, change: 'added' }];
    if (next === undefined) return [{ id, change: 'removed' }];
    return isDeepStrictEqual(select(old), select(next)) ? [] : [{ id, change: 'changed' }];
  });
}

function impact(model, seeds) {
  const consumers = new Map();
  for (const { edges } of model.links.values()) {
    for (const [consumer, provider] of edges) {
      if (!consumers.has(provider)) consumers.set(provider, new Set());
      consumers.get(provider).add(consumer);
    }
  }
  const affected = new Set([...seeds].filter(id => model.components.has(id)));
  for (const id of affected) {
    for (const consumer of consumers.get(id) ?? []) affected.add(consumer);
  }
  return [...affected];
}

function flowContract(flow) {
  return flow.transitions.map(({ description, ...transition }) => transition);
}

function compatibleRelationship(old, next) {
  if (!next || old.kind !== next.kind || old.details.protocol !== next.details.protocol) return false;
  if (old.kind === 'connects') return isDeepStrictEqual(old.contract, next.contract);
  const { nodes: before, ...oldScope } = old.contract;
  const { nodes: after, ...nextScope } = next.contract;
  return isDeepStrictEqual(oldScope, nextScope) && before.every(node => after.includes(node));
}

function architectureChanges(previous, current) {
  const changes = {
    nodes: diff(previous.components, current.components, value => value.details),
    interfaces: diff(previous.interfaces, current.interfaces),
    relationships: diff(previous.links, current.links),
    flows: diff(previous.processes, current.processes),
  };
  const seeds = new Set(changes.nodes.map(({ id }) => id));
  const breaking = [];
  for (const { id, change } of changes.nodes) {
    if (change === 'removed') breaking.push({ kind: 'node-removed', id });
    if (change === 'changed' &&
        previous.components.get(id).details['node-type'] !== current.components.get(id).details['node-type']) {
      breaking.push({ kind: 'node-type-changed', id });
    }
  }
  changes.interfaces = changes.interfaces.map(({ id: key, change }) => {
    const { id, node } = current.interfaces.get(key) ?? previous.interfaces.get(key);
    seeds.add(node);
    if (change !== 'added') breaking.push({ kind: 'interface-' + change, id, node });
    return { id, node, change };
  });
  for (const { id, change } of changes.relationships) {
    const old = previous.links.get(id);
    const next = current.links.get(id);
    for (const node of [...(old?.edges ?? []).flat(), ...(next?.edges ?? []).flat()]) seeds.add(node);
    if (old && !compatibleRelationship(old, next)) {
      const kind = old.kind === 'deployed-in' || next?.kind === 'deployed-in' ? 'deployment-migration' :
        change === 'removed' ? 'relationship-removed' : 'relationship-contract-changed';
      breaking.push({ kind, id });
    }
  }
  for (const { id, change } of changes.flows) {
    const old = previous.processes.get(id);
    const next = current.processes.get(id);
    if (old && (!next || !isDeepStrictEqual(flowContract(old), flowContract(next)))) {
      breaking.push({ kind: 'flow-contract-changed', id });
    }
    for (const [model, flow] of [[previous, old], [current, next]]) {
      for (const transition of flow?.transitions ?? []) {
        for (const node of model.links.get(transition['relationship-unique-id']).edges.flat()) seeds.add(node);
      }
    }
  }
  return { changes, seeds, breaking };
}

export function planArchitecture(before, after) {
  const current = readSnapshot(after);
  const previous = before == null
    ? { global: current.global, components: new Map(), interfaces: new Map(), links: new Map(), processes: new Map() }
    : readSnapshot(before);
  const { changes, seeds, breaking } = architectureChanges(previous, current);
  const globalChanged = !isDeepStrictEqual(previous.global, current.global);
  if (globalChanged) {
    for (const id of [...previous.components.keys(), ...current.components.keys()]) seeds.add(id);
  }
  const affectedNodes = sorted([...impact(previous, seeds), ...impact(current, seeds)]);
  const affected = new Set(affectedNodes);
  const affectedFlows = sorted([previous, current].flatMap(model =>
    [...model.processes].filter(([, flow]) => flow.transitions.some(transition =>
      model.links.get(transition['relationship-unique-id']).edges.flat().some(id => affected.has(id))))
      .map(([id]) => id)));
  return { changes, affectedNodes, affectedFlows, breaking, globalChanged };
}
