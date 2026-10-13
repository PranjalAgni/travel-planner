import { describe, expect, it } from "vitest";
import { pathCost, shortestPath, type CostFn } from "../src/planner/route.js";

/** Points on a line: cost is distance along the line. */
const line = (positions: number[]): CostFn => (a, b) => Math.abs(positions[a]! - positions[b]!);

function bruteForce(nodes: number[], cost: CostFn, start?: number): number {
  if (nodes.length === 0) return 0;
  let best = Infinity;
  const permute = (rest: number[], acc: number[]) => {
    if (rest.length === 0) best = Math.min(best, pathCost(acc, cost, start));
    rest.forEach((n, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, n]));
  };
  permute(nodes, []);
  return best;
}

function seededRandom(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

describe("shortestPath", () => {
  it("handles empty and single node inputs", () => {
    expect(shortestPath([], line([]))).toEqual([]);
    expect(shortestPath([3], line([0, 0, 0, 5]))).toEqual([3]);
  });

  it("walks points on a line end to end", () => {
    const cost = line([5, 1, 9, 3, 7]);
    const order = shortestPath([0, 1, 2, 3, 4], cost);
    expect(pathCost(order, cost)).toBe(8);
  });

  it("starts next to the fixed start node", () => {
    const positions = [0, 10, 20, 30, 100];
    const order = shortestPath([0, 1, 2, 3], line(positions), 4);
    expect(order).toEqual([3, 2, 1, 0]);
  });

  it("matches brute force on random asymmetric instances", () => {
    const rand = seededRandom(42);
    for (let trial = 0; trial < 20; trial++) {
      const n = 3 + Math.floor(rand() * 5);
      const m = Array.from({ length: n + 1 }, () => Array.from({ length: n + 1 }, () => Math.round(rand() * 100)));
      const cost: CostFn = (a, b) => (a === b ? 0 : m[a]![b]!);
      const nodes = Array.from({ length: n }, (_, i) => i);
      const start = trial % 2 === 0 ? n : undefined;
      expect(pathCost(shortestPath(nodes, cost, start), cost, start)).toBe(bruteForce(nodes, cost, start));
    }
  });

  it("finds a good path for large inputs quickly", () => {
    const rand = seededRandom(7);
    const pts = Array.from({ length: 150 }, () => ({ x: rand() * 100, y: rand() * 100 }));
    const cost: CostFn = (a, b) => Math.hypot(pts[a]!.x - pts[b]!.x, pts[a]!.y - pts[b]!.y);
    const nodes = pts.map((_, i) => i);

    const started = performance.now();
    const order = shortestPath(nodes, cost);
    expect(performance.now() - started).toBeLessThan(2000);

    expect([...order].sort((a, b) => a - b)).toEqual(nodes);
    // A random order of 150 points in a 100x100 square is ~7800 long; a decent path is far shorter.
    expect(pathCost(order, cost)).toBeLessThan(1300);
  });
});
