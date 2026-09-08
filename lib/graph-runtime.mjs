export const GRAPH_DOC_ID = "node_graph";

export const EMPTY_GRAPH = { nodes: [], edges: [] };

/**
 * Node types understood by the runtime.
 *
 * `execute` is omitted for trigger nodes: they start a run, they don't do
 * anything themselves. Adding a new action means adding an entry here and a
 * matching component in the editor.
 */
export const NODE_TYPES = {
  "trigger.button": {
    label: "Button",
    kind: "trigger",
    describe: (data) =>
      `Button "${data.label || data.triggerId || "untitled"}"`,
  },
  "obs.setScene": {
    label: "Switch Scene",
    kind: "action",
    describe: (data) => `Switch to scene "${data.sceneName || "?"}"`,
    execute: (obs, data) => obs.setCurrentScene(data.sceneName),
  },
  "obs.setSourceVisibility": {
    label: "Source Visibility",
    kind: "action",
    describe: (data) =>
      `${
        { show: "Show", hide: "Hide", toggle: "Toggle" }[data.mode] || "Toggle"
      } "${data.sourceName || "?"}" in "${data.sceneName || "?"}"`,
    execute: (obs, data) =>
      obs.setSourceVisibility({
        sceneName: data.sceneName,
        sourceName: data.sourceName,
        mode: data.mode || "toggle",
      }),
  },
};

function normalizeGraph(doc) {
  return {
    nodes: Array.isArray(doc?.nodes) ? doc.nodes : [],
    edges: Array.isArray(doc?.edges) ? doc.edges : [],
  };
}

/**
 * Loads the node graph from PouchDB, keeps it in sync as the editor saves and
 * runs the action chain hanging off a trigger when it fires.
 */
export default class GraphRuntime {
  constructor({ db, obs }) {
    this.db = db;
    this.obs = obs;
    this.graph = { ...EMPTY_GRAPH };
    this.changes = null;
  }

  async start() {
    await this.reload();

    this.changes = this.db
      .changes({
        since: "now",
        live: true,
        include_docs: true,
        doc_ids: [GRAPH_DOC_ID],
      })
      .on("change", (change) => {
        this.graph = change.deleted
          ? { ...EMPTY_GRAPH }
          : normalizeGraph(change.doc);
      })
      .on("error", (error) => {
        console.error("Error watching the node graph:", error);
      });

    return this;
  }

  stop() {
    this.changes?.cancel();
    this.changes = null;
  }

  async reload() {
    try {
      this.graph = normalizeGraph(await this.db.get(GRAPH_DOC_ID));
    } catch (error) {
      if (error.name !== "not_found") {
        console.error("Error loading the node graph:", error);
      }
      this.graph = { ...EMPTY_GRAPH };
    }

    return this.graph;
  }

  getGraph() {
    return this.graph;
  }

  /** Triggers exposed to control panels, in the order they read on the canvas. */
  getTriggers() {
    return this.graph.nodes
      .filter(
        (node) =>
          NODE_TYPES[node.type]?.kind === "trigger" && node.data?.triggerId,
      )
      .sort(byCanvasPosition)
      .map((node) => ({
        id: node.data.triggerId,
        nodeId: node.id,
        label: node.data.label || node.data.triggerId,
        type: node.type,
      }));
  }

  /**
   * Collects the action nodes reachable from a starting node, breadth first,
   * so a chain of actions runs in the order it is drawn. Cycles are visited
   * once, which makes a mis-drawn loop harmless instead of infinite.
   */
  planFrom(startNodeId) {
    const nodesById = new Map(this.graph.nodes.map((node) => [node.id, node]));
    const visited = new Set([startNodeId]);
    const plan = [];
    const queue = [startNodeId];

    while (queue.length > 0) {
      const currentId = queue.shift();

      const next = this.graph.edges
        .filter(
          (edge) => edge.source === currentId && !visited.has(edge.target),
        )
        .map((edge) => nodesById.get(edge.target))
        .filter(Boolean)
        .sort(byCanvasPosition);

      for (const node of next) {
        visited.add(node.id);
        if (NODE_TYPES[node.type]?.execute) {
          plan.push(node);
        }
        queue.push(node.id);
      }
    }

    return plan;
  }

  /**
   * Fires a trigger by its id and runs everything wired to it.
   *
   * Steps run in sequence and a failing step does not stop the ones after it,
   * so one missing source can't take down the rest of a scene change.
   */
  async fire(triggerId) {
    const trigger = this.graph.nodes.find(
      (node) =>
        NODE_TYPES[node.type]?.kind === "trigger" &&
        node.data?.triggerId === triggerId,
    );

    if (!trigger) {
      return {
        ok: false,
        code: "unknown_trigger",
        triggerId,
        error: `No trigger named "${triggerId}" in the node graph`,
        steps: [],
      };
    }

    const steps = [];

    for (const node of this.planFrom(trigger.id)) {
      const nodeType = NODE_TYPES[node.type];
      const step = {
        nodeId: node.id,
        type: node.type,
        description: nodeType.describe(node.data || {}),
      };

      try {
        step.result =
          (await nodeType.execute(this.obs, node.data || {})) || null;
        step.ok = true;
      } catch (error) {
        step.ok = false;
        step.error = error?.message || String(error);
        console.error(`  - ❌ ${step.description}: ${step.error}`);
      }

      steps.push(step);
    }

    return {
      ok: steps.every((step) => step.ok),
      triggerId,
      nodeId: trigger.id,
      steps,
    };
  }
}

function byCanvasPosition(a, b) {
  const ay = a.position?.y ?? 0;
  const by = b.position?.y ?? 0;

  return ay === by ? (a.position?.x ?? 0) - (b.position?.x ?? 0) : ay - by;
}
