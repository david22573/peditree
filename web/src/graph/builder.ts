import { Dog, Parentage, VisNode, VisEdge } from '../types';
import { calculateGenerations } from './algorithms';

/**
 * Pure function to transform normalized dog and parentage records into Vis Network nodes and edges.
 * Inspired by root index.html pedigree layout and styling.
 */
export function buildPedigreeGraph(
  dogs: readonly Dog[],
  relationships: readonly Parentage[]
): { nodes: VisNode[]; edges: VisEdge[] } {
  const nodes: VisNode[] = [];
  const edges: VisEdge[] = [];

  const activeDogs = dogs.filter(d => !d.deleted_at);
  const dogMap = new Map(activeDogs.map(d => [d.id, d]));
  const levelMap = calculateGenerations(activeDogs, relationships);

  // Helper to retrieve sire/dam names for tooltips
  const getParentName = (childId: string, role: 'SIRE' | 'DAM'): string => {
    const rel = relationships.find(r => r.child_id === childId && r.role === role);
    if (!rel) return 'Unknown';
    const parent = dogMap.get(rel.parent_id);
    return parent ? parent.name : 'Unknown';
  };

  // 1. Generate Dog Nodes
  for (const dog of activeDogs) {
    const rawGen = levelMap.get(dog.id) ?? 0;
    const nodeLevel = rawGen * 2; // Even levels for dog nodes (0, 2, 4...)

    const colorScheme = getDogColorScheme(dog.sex);

    const regLabel = dog.registration_number ? `\n[${dog.registration_number}]` : '';
    const sexLabel = dog.sex === 'M' ? 'Male' : dog.sex === 'F' ? 'Female' : 'Unknown';
    const label = `${dog.name}\n${sexLabel}${regLabel}`;

    const sireName = getParentName(dog.id, 'SIRE');
    const damName = getParentName(dog.id, 'DAM');

    const tooltip = [
      `<b>${escapeHTML(dog.name)}</b>`,
      `Sex: ${escapeHTML(sexLabel)}`,
      `Breed: ${escapeHTML(dog.breed || 'N/A')}`,
      `Reg #: ${escapeHTML(dog.registration_number || 'N/A')}`,
      `Microchip: ${escapeHTML(dog.microchip_number || 'N/A')}`,
      `Birth: ${escapeHTML(dog.birth_date || 'N/A')}`,
      `Sire: ${escapeHTML(sireName)}`,
      `Dam: ${escapeHTML(damName)}`,
    ].join('<br/>');

    nodes.push({
      id: dog.id,
      label,
      shape: 'box',
      level: nodeLevel,
      dogId: dog.id,
      title: tooltip,
      margin: {
        top: 10,
        right: 14,
        bottom: 10,
        left: 14,
      },
      color: colorScheme,
      font: {
        color: '#ffffff',
        face: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        size: 14,
      },
      borderWidth: 1,
      borderWidthSelected: 2,
      shadow: {
        enabled: true,
        color: 'rgba(0, 0, 0, 0.25)',
        size: 8,
        x: 0,
        y: 3,
      },
    });
  }

  // 2. Group parent combinations into parental union nodes
  type ParentPair = {
    sireId?: string;
    damId?: string;
    sireRel?: Parentage;
    damRel?: Parentage;
    others: Parentage[];
  };

  const childPairMap = new Map<string, ParentPair>();

  for (const rel of relationships) {
    if (!dogMap.has(rel.child_id) || !dogMap.has(rel.parent_id)) continue;

    const pair = childPairMap.get(rel.child_id) || { others: [] };
    if (rel.role === 'SIRE' && !pair.sireId) {
      pair.sireId = rel.parent_id;
      pair.sireRel = rel;
    } else if (rel.role === 'DAM' && !pair.damId) {
      pair.damId = rel.parent_id;
      pair.damRel = rel;
    } else {
      pair.others.push(rel);
    }
    childPairMap.set(rel.child_id, pair);
  }

  type UnionGroup = {
    unionId: string;
    sireId?: string;
    damId?: string;
    sireRel?: Parentage;
    damRel?: Parentage;
    children: string[];
  };

  const unionGroups = new Map<string, UnionGroup>();

  for (const [childId, pair] of childPairMap.entries()) {
    if (pair.sireId || pair.damId) {
      const sirePart = pair.sireId || 'none';
      const damPart = pair.damId || 'none';
      const unionKey = `union:${sirePart}_${damPart}`;

      let group = unionGroups.get(unionKey);
      if (!group) {
        group = {
          unionId: unionKey,
          sireId: pair.sireId,
          damId: pair.damId,
          sireRel: pair.sireRel,
          damRel: pair.damRel,
          children: [],
        };
        unionGroups.set(unionKey, group);
      }
      group.children.push(childId);
    }

    // Direct edges for extra / custom non-sire/dam relationships
    for (const otherRel of pair.others) {
      const isUncertain = otherRel.confidence !== 'CONFIRMED' || otherRel.relationship_type !== 'BIOLOGICAL';
      edges.push({
        id: `edge:${otherRel.id}`,
        from: otherRel.parent_id,
        to: otherRel.child_id,
        dashes: isUncertain,
        color: {
          color: isUncertain ? '#f59e0b' : '#94a3b8',
          highlight: '#f8fafc',
          hover: '#cbd5e1',
        },
        arrows: {
          to: {
            enabled: true,
            scaleFactor: 0.55,
          },
        },
        label: `${otherRel.role} (${otherRel.relationship_type})`,
      });
    }
  }

  // 3. Create Union Nodes (odd levels 1, 3, 5...) and connect parents -> union -> children
  for (const group of unionGroups.values()) {
    const childLevels = group.children.map(cId => levelMap.get(cId) ?? 0);
    const minChildGen = Math.min(...childLevels);
    const unionLevel = minChildGen * 2 - 1; // Odd level between parents and children

    nodes.push({
      id: group.unionId,
      level: Math.max(1, unionLevel),
      shape: 'dot',
      size: 6,
      label: '',
      isUnionNode: true,
      color: {
        background: '#94a3b8',
        border: '#cbd5e1',
        highlight: {
          background: '#f8fafc',
          border: '#ffffff',
        },
        hover: {
          background: '#cbd5e1',
          border: '#ffffff',
        },
      },
      borderWidth: 1,
      chosen: false,
    });

    // Sire -> Union Edge (line running down into union node)
    if (group.sireId) {
      const isUncertain = group.sireRel && (group.sireRel.confidence !== 'CONFIRMED' || group.sireRel.relationship_type !== 'BIOLOGICAL');
      edges.push({
        id: `edge:${group.unionId}_sire`,
        from: group.sireId,
        to: group.unionId,
        relation: 'sire',
        dashes: isUncertain,
        color: {
          color: isUncertain ? '#f59e0b' : '#94a3b8',
          highlight: '#f8fafc',
          hover: '#cbd5e1',
        },
        arrows: '',
      });
    }

    // Dam -> Union Edge (line running down into union node)
    if (group.damId) {
      const isUncertain = group.damRel && (group.damRel.confidence !== 'CONFIRMED' || group.damRel.relationship_type !== 'BIOLOGICAL');
      edges.push({
        id: `edge:${group.unionId}_dam`,
        from: group.damId,
        to: group.unionId,
        relation: 'dam',
        dashes: isUncertain,
        color: {
          color: isUncertain ? '#f59e0b' : '#94a3b8',
          highlight: '#f8fafc',
          hover: '#cbd5e1',
        },
        arrows: '',
      });
    }

    // Union -> Children Edges (arrow pointing to child)
    for (const childId of group.children) {
      edges.push({
        id: `edge:${group.unionId}_child_${childId}`,
        from: group.unionId,
        to: childId,
        relation: 'child',
        color: {
          color: '#94a3b8',
          highlight: '#f8fafc',
          hover: '#cbd5e1',
        },
        arrows: {
          to: {
            enabled: true,
            scaleFactor: 0.55,
          },
        },
      });
    }
  }

  return { nodes, edges };
}

function getDogColorScheme(sex: string) {
  if (sex === 'M') {
    return {
      background: '#1e40af',
      border: '#60a5fa',
      highlight: {
        background: '#2563eb',
        border: '#f8fafc',
      },
      hover: {
        background: '#1d4ed8',
        border: '#bfdbfe',
      },
    };
  }

  if (sex === 'F') {
    return {
      background: '#be185d',
      border: '#f472b6',
      highlight: {
        background: '#db2777',
        border: '#f8fafc',
      },
      hover: {
        background: '#be185d',
        border: '#fbcfe8',
      },
    };
  }

  return {
    background: '#742a2a',
    border: '#f6ad55',
    highlight: {
      background: '#9b2c2c',
      border: '#f8fafc',
    },
    hover: {
      background: '#742a2a',
      border: '#feebc8',
    },
  };
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
