import { readFile } from 'node:fs/promises';
import { checkCandidate } from './acceptance.mjs';
import { validateArchitecture } from './architecture.mjs';

const [artifact, requirements, architecture, view] = await Promise.all(
  ['candidate.json', 'requirements.json', 'architecture.json', 'architecture.c4'].map(name => readFile(name))
);
const inputs = { requirements, architecture, view };
validateArchitecture(inputs);
checkCandidate(artifact, inputs);
