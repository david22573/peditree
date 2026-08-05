import { Dog, Parentage, VisNode, VisEdge } from '../types';
import { calculateGenerations } from './algorithms';

/**
 * Pure function to transform normalized dog and parentage records into Vis Network nodes and edges.
 * Derived graph model only - never persisted.
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

  // 1. Generate Dog Nodes
  for (const dog of activeDogs) {
    const level = levelMap.get(dog.id) ?? 0;
    let bgColor = '#4A5568'; // Default dark grey
    let borderColor = '#A0AEC0';
    let shape = 'box';

    if (dog.sex === 'M') {
      bgColor = '#2B6CB0'; // Blue for Male
      borderColor = '#63B3ED';
      shape = 'box';
    } else if (dog.sex === 'F') {
      bgColor = '#B83280'; // Pink/Magenta for Female
      borderColor = '#F687B3';
      shape = 'ellipse';
    } else {
      bgColor = '#742A2A'; // Dark Amber/Red for Unknown
      borderColor = '#F6AD55';
      shape = 'diamond';
    }

    const regLabel = dog.registration_number ? `\n[${dog.registration_number}]` : '';
    const label = `${dog.name}${regLabel}`;
    const tooltip = `<b>${escapeHTML(dog.name)}</b><br/>
      Sex: ${dog.sex}<br/>
      Breed: ${escapeHTML(dog.breed || 'N/A')}<br/>
      Reg #: ${escapeHTML(dog.registration_number || 'N/A')}<br/>
      Birth: ${escapeHTML(dog.birth_date || 'N/A')}`;

    nodes.push({
      id: dog.id,
      label,
      shape,
      level,
      dogId: dog.id,
      title: tooltip,
      color: {
        background: bgColor,
        border: borderColor,
        highlight: { background: '#D69E2E', border: '#ECC94B' },
      },
      font: { color: '#FFFFFF', size: 14 },
    });
  }

  // 2. Group parent combinations into parental union nodes
  // Map childId -> { sireId?: string, damId?: string, otherRels: Parentage[] }
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

  // Map unionKey -> { unionNodeId, sireId, damId, children: string[], sireRel, damRel }
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

    // Handle extra non-sire/dam or multiple parentage relationships as direct edges
    for (const otherRel of pair.others) {
      const isUncertain = otherRel.confidence !== 'CONFIRMED' || otherRel.relationship_type !== 'BIOLOGICAL';
      edges.push({
        id: `edge:${otherRel.id}`,
        from: otherRel.parent_id,
        to: otherRel.child_id,
        dashes: isUncertain,
        color: { color: isUncertain ? '#ED8936' : '#A0AEC0' },
        arrows: 'to',
        label: `${otherRel.role} (${otherRel.relationship_type})`,
      });
    }
  }

  // 3. Create Union Nodes and connect parents -> union -> children
  for (const group of unionGroups.values()) {
    let maxParentLevel = 0;
    if (group.sireId && levelMap.has(group.sireId)) {
      maxParentLevel = Math.max(maxParentLevel, levelMap.get(group.sireId)!);
    }
    if (group.damId && levelMap.has(group.damId)) {
      maxParentLevel = Math.max(maxParentLevel, levelMap.get(group.damId)!);
    }
    const unionLevel = maxParentLevel + 0.5;

    // Add union dot node
    nodes.push({
      id: group.unionId,
      label: '•',
      shape: 'dot',
      level: unionLevel,
      isUnionNode: true,
      color: {
        background: '#CBD5E0',
        border: '#4A5568',
      },
    });

    // Sire -> Union Edge
    if (group.sireId) {
      const isUncertain = group.sireRel && (group.sireRel.confidence !== 'CONFIRMED' || group.sireRel.relationship_type !== 'BIOLOGICAL');
      edges.push({
        id: `edge:${group.unionId}_sire`,
        from: group.sireId,
        to: group.unionId,
        dashes: isUncertain,
        color: { color: isUncertain ? '#ED8936' : '#63B3ED' },
        arrows: 'to',
      });
    }

    // Dam -> Union Edge
    if (group.damId) {
      const isUncertain = group.damRel && (group.damRel.confidence !== 'CONFIRMED' || group.damRel.relationship_type !== 'BIOLOGICAL');
      edges.push({
        id: `edge:${group.unionId}_dam`,
        from: group.damId,
        to: group.unionId,
        dashes: isUncertain,
        color: { color: isUncertain ? '#ED8936' : '#F687B3' },
        arrows: 'to',
      });
    }

    // Union -> Children Edges
    for (const childId of group.children) {
      edges.push({
        id: `edge:${group.unionId}_child_${childId}`,
        from: group.unionId,
        to: childId,
        color: { color: '#CBD5E0' },
        arrows: 'to',
      });
    }
  }

  return { nodes, edges };
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
