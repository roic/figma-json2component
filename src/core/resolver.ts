// src/core/resolver.ts
import type { Schema, ChildNode, ComponentDefinition, ComponentSetDefinition } from '../types/schema';

export interface ResolveResult {
  success: boolean;
  order: string[];
  error?: string;
}

export function resolveDependencies(schema: Schema): ResolveResult {
  const allIds = new Set<string>();
  const dependencies = new Map<string, Set<string>>();

  // Collect all component/componentSet ids
  schema.components?.forEach(c => allIds.add(c.id));
  schema.componentSets?.forEach(c => allIds.add(c.id));

  // Initialize dependency sets
  allIds.forEach(id => dependencies.set(id, new Set()));

  // Find dependencies from children
  schema.components?.forEach(comp => {
    const deps = findDependencies(comp.children || []);
    deps.forEach(dep => {
      if (allIds.has(dep)) {
        dependencies.get(comp.id)!.add(dep);
      }
    });
  });

  schema.componentSets?.forEach(set => {
    const deps = findDependencies(set.base.children || []);
    deps.forEach(dep => {
      if (allIds.has(dep)) {
        dependencies.get(set.id)!.add(dep);
      }
    });
  });

  // Topological sort using Kahn's algorithm
  const graph = new Map<string, Set<string>>(); // node -> nodes that depend on it
  allIds.forEach(id => graph.set(id, new Set()));

  dependencies.forEach((deps, dependentId) => {
    deps.forEach(dependencyId => {
      graph.get(dependencyId)!.add(dependentId);
    });
  });

  // Now recalculate in-degree
  const inDeg = new Map<string, number>();
  allIds.forEach(id => inDeg.set(id, 0));
  graph.forEach((dependents, _node) => {
    dependents.forEach(dep => {
      inDeg.set(dep, (inDeg.get(dep) || 0) + 1);
    });
  });

  // Kahn's algorithm
  const queue: string[] = [];
  inDeg.forEach((deg, id) => {
    if (deg === 0) queue.push(id);
  });

  const order: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);

    graph.get(node)!.forEach(dependent => {
      const newDeg = inDeg.get(dependent)! - 1;
      inDeg.set(dependent, newDeg);
      if (newDeg === 0) {
        queue.push(dependent);
      }
    });
  }

  if (order.length !== allIds.size) {
    // Find cycle
    const remaining = [...allIds].filter(id => !order.includes(id));
    const cycle = findCycle(dependencies, remaining[0], new Set(), []);
    return {
      success: false,
      order: [],
      error: `Circular dependency detected: ${cycle.join(' → ')}`,
    };
  }

  return { success: true, order };
}

function findDependencies(children: ChildNode[]): string[] {
  const deps: string[] = [];

  for (const child of children) {
    if (child.nodeType === 'instance') {
      deps.push(child.ref);
    } else if (child.nodeType === 'frame' && child.children) {
      deps.push(...findDependencies(child.children));
    }
  }

  return deps;
}

function findCycle(
  dependencies: Map<string, Set<string>>,
  start: string,
  visited: Set<string>,
  path: string[]
): string[] {
  if (visited.has(start)) {
    const cycleStart = path.indexOf(start);
    return [...path.slice(cycleStart), start];
  }

  visited.add(start);
  path.push(start);

  const deps = dependencies.get(start) || new Set();
  for (const dep of deps) {
    const cycle = findCycle(dependencies, dep, visited, path);
    if (cycle.length > 0) return cycle;
  }

  path.pop();
  return [];
}
