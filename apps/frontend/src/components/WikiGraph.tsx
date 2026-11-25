import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, IconButton, Tooltip, useTheme } from '@mui/material';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-2d';
import type { WikiGraphDto, WikiGraphNode, WikiPageType } from '@kuros/shared';
import { wikiHref } from './WikiMarkdown';

// ---------------------------------------------------------------------------
// Encoding. Nodes sit side by side in space, so every hue pair must separate
// (all-pairs). The reference palette clears that only for its first three
// slots, so: people/teams = blue ("who", teams as squares), projects = orange,
// topics = aqua. Everything else is a neutral, told apart by shape, which keeps
// sources (the bulk of nodes) recessive, like Obsidian's grey file nodes.
// ---------------------------------------------------------------------------

export type NodeShape = 'circle' | 'square' | 'diamond' | 'triangle' | 'ring';

const HUES = {
  light: { blue: '#2a78d6', orange: '#eb6834', aqua: '#1baf7a', neutral: '#52514e', muted: '#a3a29c' },
  dark: { blue: '#3987e5', orange: '#d95926', aqua: '#199e70', neutral: '#c3c2b7', muted: '#6b6a64' },
};

export interface TypeStyle {
  label: string;
  shape: NodeShape;
  color: (mode: 'light' | 'dark') => string;
}

export const TYPE_STYLE: Record<WikiPageType, TypeStyle> = {
  person: { label: 'Person', shape: 'circle', color: (m) => HUES[m].blue },
  team: { label: 'Team', shape: 'square', color: (m) => HUES[m].blue },
  project: { label: 'Project', shape: 'circle', color: (m) => HUES[m].orange },
  topic: { label: 'Topic', shape: 'circle', color: (m) => HUES[m].aqua },
  daily: { label: 'Daily highlights', shape: 'diamond', color: (m) => HUES[m].neutral },
  answer: { label: 'Filed answer', shape: 'triangle', color: (m) => HUES[m].neutral },
  source: { label: 'Source', shape: 'circle', color: (m) => HUES[m].muted },
};
export const UNRESOLVED_STYLE = { label: 'Unresolved link', shape: 'ring' as NodeShape, color: (m: 'light' | 'dark') => HUES[m].muted };

export function drawShape(ctx: CanvasRenderingContext2D, shape: NodeShape, x: number, y: number, r: number): void {
  ctx.beginPath();
  switch (shape) {
    case 'square':
      ctx.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8);
      break;
    case 'diamond':
      ctx.moveTo(x, y - r * 1.25);
      ctx.lineTo(x + r * 1.25, y);
      ctx.lineTo(x, y + r * 1.25);
      ctx.lineTo(x - r * 1.25, y);
      ctx.closePath();
      break;
    case 'triangle':
      ctx.moveTo(x, y - r * 1.2);
      ctx.lineTo(x + r * 1.1, y + r * 0.8);
      ctx.lineTo(x - r * 1.1, y + r * 0.8);
      ctx.closePath();
      break;
    default:
      ctx.arc(x, y, r, 0, 2 * Math.PI);
  }
}

// ---------------------------------------------------------------------------

type GNode = NodeObject<WikiGraphNode>;
type GLink = LinkObject<WikiGraphNode, { source: string | GNode; target: string | GNode }>;

export interface GraphFilters {
  showSources: boolean;
  showDaily: boolean;
  showAnswers: boolean;
  showOrphans: boolean;
  showUnresolved: boolean;
  search: string;
}

export const DEFAULT_FILTERS: GraphFilters = {
  showSources: true,
  showDaily: true,
  showAnswers: true,
  showOrphans: true,
  showUnresolved: false,
  search: '',
};

export interface GraphForces {
  repel: number;
  linkDistance: number;
}

export const DEFAULT_FORCES: GraphForces = { repel: 200, linkDistance: 60 };

const MAX_FIT_ZOOM = 4;

const endpointId = (e: string | GNode): string => (typeof e === 'string' ? e : (e.id as string));

// ---------------------------------------------------------------------------
// Extra forces. force-graph ships only link/charge/center; without these,
// orphans and small components are pushed to the far edges (so zoom-to-fit
// shrinks the main cluster to a speck) and big hubs overlap their neighbours.
// Hand-rolled to avoid a direct d3-force dependency.
// ---------------------------------------------------------------------------

type RadiusFn = (n: GNode) => number;

/** Weak pull toward the origin, like d3.forceX/forceY. */
function gravityForce(strength: number) {
  let nodes: GNode[] = [];
  const force = (alpha: number) => {
    const k = strength * alpha;
    for (const n of nodes) {
      n.vx = (n.vx ?? 0) - (n.x ?? 0) * k;
      n.vy = (n.vy ?? 0) - (n.y ?? 0) * k;
    }
  };
  force.initialize = (ns: GNode[]) => {
    nodes = ns;
  };
  return force;
}

/** Keeps node marks from overlapping. Spatial hash, so roughly O(n) per tick. */
function collideForce(radius: RadiusFn, padding = 2) {
  let nodes: GNode[] = [];
  const force = () => {
    if (nodes.length < 2) return;
    let maxR = 0;
    for (const n of nodes) maxR = Math.max(maxR, radius(n) + padding);
    const cell = maxR * 2;
    const grid = new Map<string, GNode[]>();
    for (const n of nodes) {
      const key = `${Math.floor((n.x ?? 0) / cell)},${Math.floor((n.y ?? 0) / cell)}`;
      const bucket = grid.get(key);
      if (bucket) bucket.push(n);
      else grid.set(key, [n]);
    }
    for (const a of nodes) {
      const cx = Math.floor((a.x ?? 0) / cell);
      const cy = Math.floor((a.y ?? 0) / cell);
      const ra = radius(a) + padding;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (const b of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
            if (b === a || (b.index ?? 0) <= (a.index ?? 0)) continue;
            const min = ra + radius(b) + padding;
            let x = (a.x ?? 0) - (b.x ?? 0);
            let y = (a.y ?? 0) - (b.y ?? 0);
            let d2 = x * x + y * y;
            if (d2 >= min * min) continue;
            if (d2 === 0) {
              x = Math.random() - 0.5;
              y = Math.random() - 0.5;
              d2 = x * x + y * y;
            }
            const d = Math.sqrt(d2);
            const push = ((min - d) / d) * 0.5;
            a.vx = (a.vx ?? 0) + x * push;
            a.vy = (a.vy ?? 0) + y * push;
            b.vx = (b.vx ?? 0) - x * push;
            b.vy = (b.vy ?? 0) - y * push;
          }
        }
      }
    }
  };
  force.initialize = (ns: GNode[]) => {
    nodes = ns;
  };
  return force;
}

export interface WikiGraphProps {
  data: WikiGraphDto;
  filters?: GraphFilters;
  forces?: GraphForces;
  /** Local-graph mode: only nodes within `depth` hops of this page. */
  focus?: string;
  depth?: number;
  height: number | string;
  onHover?: (node: WikiGraphNode | null) => void;
  /** Report the visible node/link counts (and search matches), e.g. for a status line. */
  onStats?: (stats: { nodes: number; links: number; matches: number }) => void;
}

export function WikiGraph({
  data,
  filters = DEFAULT_FILTERS,
  forces = DEFAULT_FORCES,
  focus,
  depth = 1,
  height,
  onHover,
  onStats,
}: WikiGraphProps): JSX.Element {
  const theme = useTheme();
  const mode = theme.palette.mode;
  const navigate = useNavigate();
  const fgRef = useRef<ForceGraphMethods<GNode, GLink>>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [boxHeight, setBoxHeight] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const fitted = useRef(false);

  // The simulation mutates node objects (x, y, vx, vy). Reuse them across
  // filter changes so toggling a filter doesn't re-scatter the whole layout.
  const nodeCache = useRef(new Map<string, GNode>());

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
      setBoxHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ready = width > 0 && boxHeight > 0;

  const graphData = useMemo(() => {
    const typeHidden = (t: WikiPageType) =>
      (t === 'source' && !filters.showSources) ||
      (t === 'daily' && !filters.showDaily) ||
      (t === 'answer' && !filters.showAnswers);

    let nodes = data.nodes.filter(
      (n) => n.id === focus || (!typeHidden(n.type) && (filters.showUnresolved || !n.missing)),
    );
    let ids = new Set(nodes.map((n) => n.id));
    let links = data.links.filter((l) => ids.has(l.source) && ids.has(l.target));

    if (focus) {
      const keep = new Set([focus]);
      let frontier = [focus];
      for (let d = 0; d < depth; d++) {
        const next: string[] = [];
        for (const l of links) {
          for (const [a, b] of [
            [l.source, l.target],
            [l.target, l.source],
          ]) {
            if (frontier.includes(a) && !keep.has(b)) {
              keep.add(b);
              next.push(b);
            }
          }
        }
        frontier = next;
      }
      nodes = nodes.filter((n) => keep.has(n.id));
      ids = keep;
      links = links.filter((l) => keep.has(l.source) && keep.has(l.target));
    }

    if (!filters.showOrphans && !focus) {
      const linked = new Set(links.flatMap((l) => [l.source, l.target]));
      nodes = nodes.filter((n) => linked.has(n.id));
    }

    const cache = nodeCache.current;
    const outNodes: GNode[] = nodes.map((n) => {
      const prev = cache.get(n.id);
      const node = prev ? Object.assign(prev, n) : ({ ...n } as GNode);
      cache.set(n.id, node);
      return node;
    });
    return { nodes: outNodes, links: links.map((l) => ({ ...l })) as GLink[] };
    // Search highlights rather than filters, so it's deliberately not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filters.showSources, filters.showDaily, filters.showAnswers, filters.showOrphans, filters.showUnresolved, focus, depth]);

  // Search highlights matches and dims the rest (as Obsidian does) instead of
  // removing non-matches, which would also destroy the context around them.
  const query = filters.search.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return null;
    return new Set(
      graphData.nodes
        .filter((n) => `${n.title} ${n.id}`.toLowerCase().includes(query))
        .map((n) => n.id as string),
    );
  }, [graphData, query]);

  useEffect(() => {
    onStats?.({ nodes: graphData.nodes.length, links: graphData.links.length, matches: matches?.size ?? 0 });
  }, [graphData, matches, onStats]);

  // Bring search hits into view once typing settles.
  useEffect(() => {
    if (!matches || matches.size === 0) return;
    const t = setTimeout(() => {
      const fg = fgRef.current;
      if (!fg) return;
      fg.zoomToFit(400, 80, (n) => matches.has(n.id as string));
      setTimeout(() => fg.zoom(Math.min(fg.zoom(), MAX_FIT_ZOOM), 200), 420);
    }, 350);
    return () => clearTimeout(t);
  }, [matches]);

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of graphData.links) {
      const s = endpointId(l.source);
      const t = endpointId(l.target);
      if (!m.has(s)) m.set(s, new Set());
      if (!m.has(t)) m.set(t, new Set());
      m.get(s)!.add(t);
      m.get(t)!.add(s);
    }
    return m;
  }, [graphData]);

  // Label the best-connected nodes even when zoomed out, as Obsidian does.
  const alwaysLabel = useMemo(() => {
    const sorted = [...graphData.nodes].filter((n) => n.type !== 'source').sort((a, b) => b.degree - a.degree);
    return new Set(sorted.slice(0, focus ? 40 : 12).map((n) => n.id as string));
  }, [graphData, focus]);

  const radius = useCallback(
    (n: GNode) => (n.type === 'source' ? 2.5 : 3.5) + Math.sqrt(n.degree) * (n.type === 'source' ? 0.6 : 1.2),
    [],
  );

  // `ready` is a dependency because the graph only mounts once the container
  // has a size; without it the defaults never reached the simulation.
  useEffect(() => {
    const fg = fgRef.current;
    if (!ready || !fg) return;
    // Cap the repulsion range so distant clusters don't keep pushing each other apart.
    fg.d3Force('charge')?.strength(-forces.repel).distanceMax(Math.max(forces.repel * 2, 300));
    fg.d3Force('link')?.distance(forces.linkDistance);
    fg.d3Force('gravity', gravityForce(focus ? 0.08 : 0.04));
    fg.d3Force('collide', collideForce(radius));
    fg.d3ReheatSimulation();
  }, [ready, forces, graphData, focus, radius]);

  useEffect(() => {
    fitted.current = false;
  }, [focus, depth]);

  const fitView = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.zoomToFit(400, focus ? 30 : 60);
    setTimeout(() => fg.zoom(Math.min(fg.zoom(), MAX_FIT_ZOOM), 200), 420);
  }, [focus]);

  const isLit = useCallback(
    (id: string) => {
      if (hover) return id === hover || !!neighbors.get(hover)?.has(id);
      if (matches) return matches.has(id);
      return true;
    },
    [hover, neighbors, matches],
  );

  const textPrimary = theme.palette.text.primary;
  const surface = theme.palette.background.paper;

  const paintNode = useCallback(
    (node: GNode, ctx: CanvasRenderingContext2D, scale: number) => {
      const id = node.id as string;
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const r = radius(node);
      const style = node.missing ? UNRESOLVED_STYLE : TYPE_STYLE[node.type];
      const lit = isLit(id);
      ctx.globalAlpha = lit ? 1 : 0.15;

      drawShape(ctx, style.shape, x, y, r);
      if (style.shape === 'ring') {
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = style.color(mode);
        ctx.stroke();
      } else {
        ctx.fillStyle = style.color(mode);
        ctx.fill();
        // Surface ring keeps overlapping nodes distinct.
        ctx.lineWidth = 1 / scale;
        ctx.strokeStyle = surface;
        ctx.stroke();
      }
      if (id === focus || id === hover || (!hover && matches?.has(id))) {
        drawShape(ctx, style.shape, x, y, r + 2.5);
        ctx.lineWidth = 1.5 / scale;
        ctx.strokeStyle = textPrimary;
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
    },
    [radius, isLit, mode, focus, hover, matches, surface, textPrimary],
  );

  // Labels go in a second pass so a later-drawn node never covers an earlier node's label.
  const paintLabels = useCallback(
    (ctx: CanvasRenderingContext2D, scale: number) => {
      const fontSize = Math.max(11 / scale, 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineJoin = 'round';
      for (const node of graphData.nodes) {
        const id = node.id as string;
        const lit = isLit(id);
        const show =
          id === hover ||
          id === focus ||
          (hover || matches ? lit : scale > 1.8 || (alwaysLabel.has(id) && scale > 0.6));
        if (!show) continue;
        const x = node.x ?? 0;
        const y = (node.y ?? 0) + radius(node) + 2;
        const label = node.title.length > 40 ? `${node.title.slice(0, 39)}…` : node.title;
        ctx.globalAlpha = lit ? 1 : 0.15;
        ctx.font = `${id === hover ? 600 : 400} ${fontSize}px Inter, system-ui, sans-serif`;
        // Halo so labels stay legible over links and neighbours.
        ctx.lineWidth = 3 / scale;
        ctx.strokeStyle = surface;
        ctx.strokeText(label, x, y);
        ctx.fillStyle = textPrimary;
        ctx.fillText(label, x, y);
      }
      ctx.globalAlpha = 1;
    },
    [graphData, hover, focus, matches, isLit, alwaysLabel, radius, surface, textPrimary],
  );

  const paintPointerArea = useCallback(
    (node: GNode, color: string, ctx: CanvasRenderingContext2D) => {
      // Hit target larger than the mark.
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, radius(node) + 4, 0, 2 * Math.PI);
      ctx.fill();
    },
    [radius],
  );

  const linkColor = useCallback(
    (l: GLink) => {
      const s = endpointId(l.source);
      const t = endpointId(l.target);
      const active = hover && (s === hover || t === hover);
      if (active) return mode === 'dark' ? 'rgba(240,239,236,0.75)' : 'rgba(11,11,11,0.6)';
      const base = mode === 'dark' ? '195,194,183' : '82,81,78';
      const dimmed = hover || (matches && !(matches.has(s) && matches.has(t)));
      return `rgba(${base},${dimmed ? 0.05 : 0.22})`;
    },
    [hover, matches, mode],
  );

  return (
    <Box ref={containerRef} sx={{ width: '100%', height, position: 'relative', overflow: 'hidden' }}>
      {ready && (
        <ForceGraph2D<GNode, GLink>
          ref={fgRef}
          width={width}
          height={boxHeight}
          graphData={graphData}
          backgroundColor="rgba(0,0,0,0)"
          nodeId="id"
          nodeRelSize={1}
          nodeVal={(n) => radius(n) ** 2}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={paintPointerArea}
          onRenderFramePost={paintLabels}
          linkColor={linkColor}
          linkWidth={(l) => (hover && (endpointId(l.source) === hover || endpointId(l.target) === hover) ? 1.5 : 0.6)}
          cooldownTicks={200}
          d3VelocityDecay={0.3}
          onEngineStop={() => {
            if (!fitted.current) {
              fitted.current = true;
              const fg = fgRef.current;
              if (!fg) return;
              fg.zoomToFit(0, focus ? 30 : 60);
              // Small graphs would otherwise be blown up to fill the canvas.
              fg.zoom(Math.min(fg.zoom(), MAX_FIT_ZOOM), 300);
            }
          }}
          onNodeHover={(n) => {
            setHover((n?.id as string) ?? null);
            onHover?.(n ?? null);
            if (containerRef.current) containerRef.current.style.cursor = n ? 'pointer' : 'grab';
          }}
          onNodeClick={(n) => {
            if (!n.missing) navigate(wikiHref(n.id as string));
          }}
          onNodeDragEnd={(n) => {
            // Release the node so it settles back into the layout.
            n.fx = undefined;
            n.fy = undefined;
          }}
        />
      )}
      <Tooltip title="Fit to view">
        <IconButton
          size="small"
          aria-label="Fit graph to view"
          onClick={fitView}
          sx={{ position: 'absolute', right: 8, bottom: 8, bgcolor: 'background.paper', boxShadow: 1, '&:hover': { bgcolor: 'background.paper' } }}
        >
          <FitScreenIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
