import { Dog, Parentage } from '../types';

/**
 * Returns true if adding or existing parentage has any ancestry cycle.
 */
export function detectCycle(dogs: readonly Dog[], relationships: readonly Parentage[]): boolean {
  const activeDogIds = new Set(dogs.filter(d => !d.deleted_at).map(d => d.id));
  const parentMap = new Map<string, string[]>();

  for (const rel of relationships) {
    if (!activeDogIds.has(rel.child_id) || !activeDogIds.has(rel.parent_id)) continue;
    const parents = parentMap.get(rel.child_id) || [];
    parents.push(rel.parent_id);
    parentMap.set(rel.child_id, parents);
  }

  const visited = new Map<string, number>(); // 0: unvisited, 1: visiting, 2: visited

  const dfs = (node: string): boolean => {
    visited.set(node, 1);
    const parents = parentMap.get(node) || [];
    for (const parent of parents) {
      const state = visited.get(parent) || 0;
      if (state === 1) return true; // cycle!
      if (state === 0 && dfs(parent)) return true;
    }
    visited.set(node, 2);
    return false;
  };

  for (const dogId of activeDogIds) {
    if ((visited.get(dogId) || 0) === 0) {
      if (dfs(dogId)) return true;
    }
  }

  return false;
}

/**
 * Traverses upwards to find all ancestor dog IDs for a target dog.
 */
export function getAncestors(targetDogId: string, relationships: readonly Parentage[]): Set<string> {
  const ancestors = new Set<string>();
  const parentMap = new Map<string, string[]>();

  for (const rel of relationships) {
    const list = parentMap.get(rel.child_id) || [];
    list.push(rel.parent_id);
    parentMap.set(rel.child_id, list);
  }

  const queue = [targetDogId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const parents = parentMap.get(current) || [];
    for (const p of parents) {
      ancestors.add(p);
      queue.push(p);
    }
  }

  return ancestors;
}

/**
 * Traverses downwards to find all descendant dog IDs for a target dog.
 */
export function getDescendants(targetDogId: string, relationships: readonly Parentage[]): Set<string> {
  const descendants = new Set<string>();
  const childMap = new Map<string, string[]>();

  for (const rel of relationships) {
    const list = childMap.get(rel.parent_id) || [];
    list.push(rel.child_id);
    childMap.set(rel.parent_id, list);
  }

  const queue = [targetDogId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const children = childMap.get(current) || [];
    for (const c of children) {
      descendants.add(c);
      queue.push(c);
    }
  }

  return descendants;
}

/**
 * Groups dogs into disconnected family components (undirected graph component search).
 */
export function calculateConnectedComponents(
  dogs: readonly Dog[],
  relationships: readonly Parentage[]
): Map<string, Dog[]> {
  const activeDogs = dogs.filter(d => !d.deleted_at);
  const dogMap = new Map(activeDogs.map(d => [d.id, d]));
  const adj = new Map<string, Set<string>>();

  for (const d of activeDogs) {
    adj.set(d.id, new Set());
  }

  for (const rel of relationships) {
    if (dogMap.has(rel.child_id) && dogMap.has(rel.parent_id)) {
      adj.get(rel.child_id)?.add(rel.parent_id);
      adj.get(rel.parent_id)?.add(rel.child_id);
    }
  }

  const visited = new Set<string>();
  const components = new Map<string, Dog[]>();
  let compCount = 1;

  for (const d of activeDogs) {
    if (visited.has(d.id)) continue;

    const compDogs: Dog[] = [];
    const queue = [d.id];
    visited.add(d.id);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const dogObj = dogMap.get(curr);
      if (dogObj) compDogs.push(dogObj);

      const neighbors = adj.get(curr) || new Set();
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      }
    }

    const compId = `family-${compCount++}`;
    components.set(compId, compDogs);
  }

  return components;
}

/**
 * Calculates generation levels for top-to-bottom visualization.
 * Oldest ancestors = level 0, children = max(parent_level) + 1.
 */
export function calculateGenerations(
  dogs: readonly Dog[],
  relationships: readonly Parentage[]
): Map<string, number> {
  const activeDogIds = new Set(dogs.filter(d => !d.deleted_at).map(d => d.id));
  const parentMap = new Map<string, string[]>();

  for (const rel of relationships) {
    if (!activeDogIds.has(rel.child_id) || !activeDogIds.has(rel.parent_id)) continue;
    const list = parentMap.get(rel.child_id) || [];
    list.push(rel.parent_id);
    parentMap.set(rel.child_id, list);
  }

  const levels = new Map<string, number>();

  const getLevel = (dogId: string, visitedInPath = new Set<string>()): number => {
    if (levels.has(dogId)) return levels.get(dogId)!;
    if (visitedInPath.has(dogId)) return 0; // fallback if cycle

    const parents = parentMap.get(dogId) || [];
    if (parents.length === 0) {
      levels.set(dogId, 0);
      return 0;
    }

    visitedInPath.add(dogId);
    let maxParentLevel = 0;
    for (const p of parents) {
      const pLevel = getLevel(p, new Set(visitedInPath));
      if (pLevel > maxParentLevel) maxParentLevel = pLevel;
    }

    const level = maxParentLevel + 1;
    levels.set(dogId, level);
    return level;
  };

  for (const dogId of activeDogIds) {
    getLevel(dogId);
  }

  return levels;
}

/**
 * Filters dogs and parentage relationships based on user filters.
 */
export function filterGraph(
  dogs: readonly Dog[],
  relationships: readonly Parentage[],
  options: {
    search?: string;
    showDeleted?: boolean;
    incompleteOnly?: boolean;
    familyDogs?: Set<string>;
    selectedDogId?: string;
    focusMode?: 'all' | 'ancestors' | 'descendants';
  }
): { filteredDogs: Dog[]; filteredRelationships: Parentage[] } {
  let resultDogs = dogs.filter(d => options.showDeleted || !d.deleted_at);

  if (options.familyDogs && options.familyDogs.size > 0) {
    resultDogs = resultDogs.filter(d => options.familyDogs!.has(d.id));
  }

  if (options.incompleteOnly) {
    const parentCountMap = new Map<string, { sire: boolean; dam: boolean }>();
    for (const rel of relationships) {
      const item = parentCountMap.get(rel.child_id) || { sire: false, dam: false };
      if (rel.role === 'SIRE') item.sire = true;
      if (rel.role === 'DAM') item.dam = true;
      parentCountMap.set(rel.child_id, item);
    }
    resultDogs = resultDogs.filter(d => {
      const p = parentCountMap.get(d.id);
      return !p || !p.sire || !p.dam;
    });
  }

  if (options.search && options.search.trim() !== '') {
    const term = options.search.toLowerCase().trim();
    resultDogs = resultDogs.filter(d =>
      d.name.toLowerCase().includes(term) ||
      d.registered_name.toLowerCase().includes(term) ||
      d.breed.toLowerCase().includes(term) ||
      d.registration_number.toLowerCase().includes(term) ||
      d.microchip_number.toLowerCase().includes(term)
    );
  }

  if (options.selectedDogId && options.focusMode && options.focusMode !== 'all') {
    const focusSet = new Set<string>([options.selectedDogId]);
    if (options.focusMode === 'ancestors') {
      const ancestors = getAncestors(options.selectedDogId, relationships);
      ancestors.forEach(a => focusSet.add(a));
    } else if (options.focusMode === 'descendants') {
      const descendants = getDescendants(options.selectedDogId, relationships);
      descendants.forEach(d => focusSet.add(d));
    }
    resultDogs = resultDogs.filter(d => focusSet.has(d.id));
  }

  const validDogIds = new Set(resultDogs.map(d => d.id));
  const resultRels = relationships.filter(
    r => validDogIds.has(r.child_id) && validDogIds.has(r.parent_id)
  );

  return { filteredDogs: resultDogs, filteredRelationships: resultRels };
}
