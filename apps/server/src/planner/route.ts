/**
 * Shortest open path through a set of nodes (a travelling-salesman path with
 * no return leg). Exact for small inputs, heuristic for larger ones.
 */

export type CostFn = (from: number, to: number) => number;

/** Up to this many nodes we solve exactly with Held-Karp (O(2^n * n^2)). */
const EXACT_LIMIT = 12;

/**
 * Orders `nodes` to minimise total cost of visiting them all.
 * When `start` is given the path begins there (and `start` is not part of the
 * returned order unless it is also in `nodes`).
 */
export function shortestPath(nodes: readonly number[], cost: CostFn, start?: number): number[] {
  if (nodes.length <= 1) return [...nodes];
  return nodes.length <= EXACT_LIMIT ? heldKarp(nodes, cost, start) : heuristic(nodes, cost, start);
}

export function pathCost(order: readonly number[], cost: CostFn, start?: number): number {
  let total = 0;
  let prev = start;
  for (const node of order) {
    if (prev !== undefined) total += cost(prev, node);
    prev = node;
  }
  return total;
}

function heldKarp(nodes: readonly number[], cost: CostFn, start?: number): number[] {
  const n = nodes.length;
  const full = (1 << n) - 1;
  const best = new Float64Array((1 << n) * n).fill(Infinity);
  const parent = new Int8Array((1 << n) * n).fill(-1);
  const at = (mask: number, last: number) => mask * n + last;

  for (let i = 0; i < n; i++) {
    best[at(1 << i, i)] = start === undefined ? 0 : cost(start, nodes[i]!);
  }
  for (let mask = 1; mask <= full; mask++) {
    for (let last = 0; last < n; last++) {
      const here = best[at(mask, last)]!;
      if (!(mask & (1 << last)) || here === Infinity) continue;
      for (let next = 0; next < n; next++) {
        if (mask & (1 << next)) continue;
        const nextMask = mask | (1 << next);
        const candidate = here + cost(nodes[last]!, nodes[next]!);
        if (candidate < best[at(nextMask, next)]!) {
          best[at(nextMask, next)] = candidate;
          parent[at(nextMask, next)] = last;
        }
      }
    }
  }

  let last = 0;
  for (let i = 1; i < n; i++) if (best[at(full, i)]! < best[at(full, last)]!) last = i;

  const order: number[] = [];
  let mask = full;
  while (last !== -1) {
    order.push(nodes[last]!);
    const prev = parent[at(mask, last)]!;
    mask &= ~(1 << last);
    last = prev;
  }
  return order.reverse();
}

/** Max number of different first nodes tried by the heuristic. */
const HEURISTIC_RESTARTS = 8;

/** Nearest-neighbour construction from several first nodes, refined with 2-opt. */
function heuristic(nodes: readonly number[], cost: CostFn, start?: number): number[] {
  const firsts =
    start !== undefined
      ? [nodes.reduce((a, b) => (cost(start, b) < cost(start, a) ? b : a))]
      : Array.from({ length: Math.min(HEURISTIC_RESTARTS, nodes.length) }, (_, k) =>
          nodes[Math.floor((k * nodes.length) / Math.min(HEURISTIC_RESTARTS, nodes.length))]!,
        );

  let bestOrder: number[] = [];
  let bestCost = Infinity;
  for (const first of firsts) {
    const order = twoOpt(nearestNeighbour(nodes, cost, first), cost, start);
    const c = pathCost(order, cost, start);
    if (c < bestCost) {
      bestCost = c;
      bestOrder = order;
    }
  }
  return bestOrder;
}

function nearestNeighbour(nodes: readonly number[], cost: CostFn, first: number): number[] {
  const remaining = new Set(nodes);
  remaining.delete(first);
  const order = [first];
  let current = first;
  while (remaining.size > 0) {
    let next = -1;
    let nextCost = Infinity;
    for (const candidate of remaining) {
      const c = cost(current, candidate);
      if (c < nextCost) {
        nextCost = c;
        next = candidate;
      }
    }
    order.push(next);
    remaining.delete(next);
    current = next;
  }
  return order;
}

/**
 * Repeatedly reverses the segment order[i..j] while that shortens the path.
 * Forward and reversed segment costs are accumulated as j grows, so each
 * candidate is evaluated in O(1) even for asymmetric costs.
 */
function twoOpt(initial: number[], cost: CostFn, start?: number): number[] {
  const order = [...initial];
  const n = order.length;
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < n - 1; i++) {
      const before = i > 0 ? order[i - 1] : start;
      let forward = 0;
      let reversed = 0;
      for (let j = i + 1; j < n; j++) {
        forward += cost(order[j - 1]!, order[j]!);
        reversed += cost(order[j]!, order[j - 1]!);
        const after = j + 1 < n ? order[j + 1] : undefined;
        const oldCost =
          (before !== undefined ? cost(before, order[i]!) : 0) +
          forward +
          (after !== undefined ? cost(order[j]!, after) : 0);
        const newCost =
          (before !== undefined ? cost(before, order[j]!) : 0) +
          reversed +
          (after !== undefined ? cost(order[i]!, after) : 0);
        if (newCost + 1e-9 < oldCost) {
          const segment = order.slice(i, j + 1).reverse();
          order.splice(i, segment.length, ...segment);
          improved = true;
          break;
        }
      }
    }
  }
  return order;
}
