import { useCallback } from "react";
import {
  addEdge,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";

import { NODE_TYPES, nodeTypes } from "./nodes";
import { useOBS } from "./obs";
import useGraphSync from "./storage";

/**
 * Ids for new nodes and edges. `crypto.randomUUID` is unavailable over plain
 * HTTP on a LAN address, which is exactly how a control panel is usually
 * opened, so fall back to something good enough for one document.
 */
let counter = 0;
function uid(prefix) {
  counter++;
  return `${prefix}-${Date.now().toString(36)}-${counter}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

const NODE_WIDTH = 240;
const NODE_HEIGHT = 160;

/**
 * Finds somewhere to drop a new node that does not land on an existing one,
 * starting from where the user is looking and stepping down and to the right.
 */
function findFreePosition(nodes, start) {
  const position = { ...start };

  for (let attempt = 0; attempt < 50; attempt++) {
    const overlaps = nodes.some((node) => {
      const width = node.measured?.width || NODE_WIDTH;
      const height = node.measured?.height || NODE_HEIGHT;

      return (
        Math.abs(node.position.x - position.x) < width * 0.8 &&
        Math.abs(node.position.y - position.y) < height * 0.8
      );
    });

    if (!overlaps) {
      break;
    }

    position.x += 40;
    position.y += 40;
  }

  return position;
}

const SAVE_LABELS = {
  loading: "Loading…",
  idle: "",
  pending: "Editing…",
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
  "no-db": "Database unavailable",
};

function OBSStatus() {
  const { status, refresh } = useOBS();

  const state = !status
    ? "unknown"
    : status.connected
      ? "connected"
      : status.configured
        ? "disconnected"
        : "unconfigured";

  const text = {
    unknown: "Checking OBS…",
    connected: `OBS connected`,
    disconnected: "OBS unreachable",
    unconfigured: "OBS not configured",
  }[state];

  return (
    <button
      type="button"
      className={`obs-status obs-status-${state}`}
      onClick={refresh}
      title={status?.error || status?.url || "Check the OBS connection again"}
    >
      <span className="obs-dot" aria-hidden="true" />
      {text}
    </button>
  );
}

function Toolbar({ saveState, disabled }) {
  const { addNodes, getNodes, screenToFlowPosition } = useReactFlow();
  const obs = useOBS();

  const addNode = useCallback(
    (type) => {
      const definition = NODE_TYPES[type];
      // drop new nodes near the middle of whatever the user is looking at,
      // clear of anything already there
      const start = screenToFlowPosition({
        x: window.innerWidth / 2 - NODE_WIDTH / 2,
        y: window.innerHeight / 2 - NODE_HEIGHT / 2,
      });

      addNodes({
        id: uid(definition.kind),
        type,
        position: findFreePosition(getNodes(), start),
        data: definition.defaults(obs),
      });
    },
    [addNodes, getNodes, screenToFlowPosition, obs],
  );

  return (
    <header className="toolbar">
      <h1 className="toolbar-title">
        <a href="/">StreamerJS</a> <span>Node Graph</span>
      </h1>

      <div className="toolbar-palette">
        {Object.entries(NODE_TYPES).map(([type, definition]) => (
          <button
            key={type}
            type="button"
            className={`palette-button palette-${definition.kind}`}
            onClick={() => addNode(type)}
            disabled={disabled}
          >
            + {definition.label}
          </button>
        ))}
      </div>

      <div className="toolbar-status">
        <span className={`save-state save-state-${saveState}`}>
          {SAVE_LABELS[saveState] ?? ""}
        </span>
        <OBSStatus />
        <a className="toolbar-link" href="/control/">
          Control panel
        </a>
      </div>
    </header>
  );
}

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const { loaded, saveState } = useGraphSync({
    nodes,
    edges,
    setNodes,
    setEdges,
  });

  const onConnect = useCallback(
    (connection) =>
      setEdges((current) =>
        addEdge({ ...connection, id: uid("edge") }, current),
      ),
    [setEdges],
  );

  return (
    <div className="editor">
      <Toolbar saveState={loaded ? saveState : "loading"} disabled={!loaded} />

      <div className="canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          defaultEdgeOptions={{ animated: true }}
          deleteKeyCode={["Delete", "Backspace"]}
          fitView
          // a graph with one or two nodes would otherwise fill the screen
          fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
          minZoom={0.2}
          proOptions={{ hideAttribution: false }}
        >
          <Background gap={20} size={1.5} color="#0d7a90" />
          <Controls />
          <MiniMap
            pannable
            zoomable
            nodeColor="#ebccb0"
            bgColor="#00485a"
            maskColor="rgba(0, 32, 40, 0.6)"
          />
        </ReactFlow>

        {!loaded && <p className="empty-state">Loading the node graph…</p>}

        {loaded && nodes.length === 0 && (
          <p className="empty-state">
            Add a <strong>button trigger</strong>, add an action, then drag from
            the trigger's right handle to the action's left handle. The button
            shows up in your control panel automatically.
          </p>
        )}
      </div>
    </div>
  );
}
