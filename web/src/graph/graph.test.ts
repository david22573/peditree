import { describe, it, expect } from 'vitest';
import { Dog, Parentage } from '../types';
import {
  detectCycle,
  getAncestors,
  getDescendants,
  calculateConnectedComponents,
  calculateGenerations,
  filterGraph,
} from './algorithms';
import { buildPedigreeGraph } from './builder';

const sampleDogs: Dog[] = [
  {
    id: 'dog-sire',
    workspace_id: 'ws-1',
    name: 'Apollo',
    registered_name: 'Apollo of Olympus',
    sex: 'M',
    breed: 'German Shepherd',
    birth_date: '2018-01-01',
    death_date: null,
    registration_number: 'REG100',
    microchip_number: 'CHIP100',
    color: 'Black & Tan',
    notes: '',
    version: 1,
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
    deleted_at: null,
  },
  {
    id: 'dog-dam',
    workspace_id: 'ws-1',
    name: 'Athena',
    registered_name: 'Athena of Olympus',
    sex: 'F',
    breed: 'German Shepherd',
    birth_date: '2019-01-01',
    death_date: null,
    registration_number: 'REG101',
    microchip_number: 'CHIP101',
    color: 'Sable',
    notes: '',
    version: 1,
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
    deleted_at: null,
  },
  {
    id: 'dog-child1',
    workspace_id: 'ws-1',
    name: 'Ares',
    registered_name: 'Ares of Olympus',
    sex: 'M',
    breed: 'German Shepherd',
    birth_date: '2021-05-01',
    death_date: null,
    registration_number: 'REG102',
    microchip_number: 'CHIP102',
    color: 'Black & Tan',
    notes: '',
    version: 1,
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
    deleted_at: null,
  },
  {
    id: 'dog-child2',
    workspace_id: 'ws-1',
    name: 'Artemis',
    registered_name: 'Artemis of Olympus',
    sex: 'F',
    breed: 'German Shepherd',
    birth_date: '2021-05-01',
    death_date: null,
    registration_number: 'REG103',
    microchip_number: 'CHIP103',
    color: 'Sable',
    notes: '',
    version: 1,
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
    deleted_at: null,
  },
  {
    id: 'dog-standalone',
    workspace_id: 'ws-1',
    name: 'Lone Wolf',
    registered_name: '',
    sex: 'UNKNOWN',
    breed: 'Mixed',
    birth_date: null,
    death_date: null,
    registration_number: '',
    microchip_number: '',
    color: '',
    notes: '',
    version: 1,
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
    deleted_at: null,
  },
];

const sampleRels: Parentage[] = [
  {
    id: 'rel-1',
    workspace_id: 'ws-1',
    child_id: 'dog-child1',
    parent_id: 'dog-sire',
    role: 'SIRE',
    relationship_type: 'BIOLOGICAL',
    confidence: 'CONFIRMED',
    source_note: '',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  },
  {
    id: 'rel-2',
    workspace_id: 'ws-1',
    child_id: 'dog-child1',
    parent_id: 'dog-dam',
    role: 'DAM',
    relationship_type: 'BIOLOGICAL',
    confidence: 'CONFIRMED',
    source_note: '',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  },
  {
    id: 'rel-3',
    workspace_id: 'ws-1',
    child_id: 'dog-child2',
    parent_id: 'dog-sire',
    role: 'SIRE',
    relationship_type: 'BIOLOGICAL',
    confidence: 'CONFIRMED',
    source_note: '',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  },
  {
    id: 'rel-4',
    workspace_id: 'ws-1',
    child_id: 'dog-child2',
    parent_id: 'dog-dam',
    role: 'DAM',
    relationship_type: 'BIOLOGICAL',
    confidence: 'CONFIRMED',
    source_note: '',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  },
];

describe('Graph Algorithms', () => {
  it('detects cycles correctly', () => {
    expect(detectCycle(sampleDogs, sampleRels)).toBe(false);

    const cycleRels: Parentage[] = [
      ...sampleRels,
      {
        id: 'rel-cycle',
        workspace_id: 'ws-1',
        child_id: 'dog-sire',
        parent_id: 'dog-child1',
        role: 'SIRE',
        relationship_type: 'BIOLOGICAL',
        confidence: 'CONFIRMED',
        source_note: '',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
      },
    ];

    expect(detectCycle(sampleDogs, cycleRels)).toBe(true);
  });

  it('traverses ancestors and descendants', () => {
    const ancestors = getAncestors('dog-child1', sampleRels);
    expect(ancestors.has('dog-sire')).toBe(true);
    expect(ancestors.has('dog-dam')).toBe(true);
    expect(ancestors.size).toBe(2);

    const descendants = getDescendants('dog-sire', sampleRels);
    expect(descendants.has('dog-child1')).toBe(true);
    expect(descendants.has('dog-child2')).toBe(true);
    expect(descendants.size).toBe(2);
  });

  it('groups disconnected components including standalone dogs', () => {
    const components = calculateConnectedComponents(sampleDogs, sampleRels);
    expect(components.size).toBe(2); // Family component + Standalone dog component
  });

  it('calculates generation levels', () => {
    const levels = calculateGenerations(sampleDogs, sampleRels);
    expect(levels.get('dog-sire')).toBe(0);
    expect(levels.get('dog-dam')).toBe(0);
    expect(levels.get('dog-child1')).toBe(1);
    expect(levels.get('dog-child2')).toBe(1);
  });
});

describe('Graph Builder', () => {
  it('builds vis network nodes and edges with union nodes for siblings', () => {
    const { nodes, edges } = buildPedigreeGraph(sampleDogs, sampleRels);

    const dogNodes = nodes.filter(n => !n.isUnionNode);
    const unionNodes = nodes.filter(n => n.isUnionNode);

    expect(dogNodes.length).toBe(5);
    expect(unionNodes.length).toBe(1); // Apollo + Athena parental union node

    expect(unionNodes[0].id).toBe('union:dog-sire_dog-dam');

    // Edges: Sire->Union, Dam->Union, Union->Child1, Union->Child2 = 4 edges
    expect(edges.length).toBe(4);
  });

  it('escapes special characters safely in node labels and tooltips', () => {
    const dogWithXSS: Dog = {
      ...sampleDogs[0],
      id: 'xss-dog',
      name: '<script>alert("xss")</script>',
    };
    const { nodes } = buildPedigreeGraph([dogWithXSS], []);
    const xssNode = nodes.find(n => n.id === 'xss-dog');
    expect(xssNode).toBeDefined();
    expect(xssNode?.title).toContain('&lt;script&gt;');
  });
});
