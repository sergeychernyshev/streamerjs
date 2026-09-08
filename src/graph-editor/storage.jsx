import { useCallback, useEffect, useRef, useState } from "react";

export const GRAPH_DOC_ID = "node_graph";

const SAVE_DELAY = 500;

async function fetchServerGraph() {
  try {
    const response = await fetch("/_graph/graph", {
      headers: { Accept: "application/json", "X-Requested-With": "fetch" },
    });

    return await response.json();
  } catch (error) {
    console.error("Error asking the server for the node graph:", error);
    // assume there is a graph worth waiting for rather than risk replacing it
    return { exists: true };
  }
}

/** Strips React Flow's runtime bookkeeping so only the graph itself is stored. */
export function serialize(nodes, edges) {
  return {
    nodes: nodes.map(({ id, type, position, data }) => ({
      id,
      type,
      // whole pixels keep dragging from producing a save on every frame
      position: { x: Math.round(position.x), y: Math.round(position.y) },
      data: data || {},
    })),
    edges: edges.map(({ id, source, target, sourceHandle, targetHandle }) => ({
      id,
      source,
      target,
      ...(sourceHandle ? { sourceHandle } : {}),
      ...(targetHandle ? { targetHandle } : {}),
    })),
  };
}

/**
 * Keeps the canvas and the `node_graph` PouchDB document in sync.
 *
 * Edits are saved after a short pause, and changes made elsewhere (another
 * browser, another editor tab) are pulled back into the canvas as they arrive.
 */
export default function useGraphSync({ nodes, edges, setNodes, setEdges }) {
  const db = window.db;

  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState("idle");

  const revision = useRef(null);
  const ownRevisions = useRef(new Set());
  const lastSaved = useRef(null);
  const timer = useRef(null);

  const applyDocument = useCallback(
    (doc) => {
      const graph = {
        nodes: Array.isArray(doc?.nodes) ? doc.nodes : [],
        edges: Array.isArray(doc?.edges) ? doc.edges : [],
      };

      revision.current = doc?._rev || null;
      lastSaved.current = JSON.stringify(serialize(graph.nodes, graph.edges));

      setNodes(graph.nodes);
      setEdges(graph.edges);
    },
    [setNodes, setEdges],
  );

  // initial load plus a live feed of changes from anywhere else
  useEffect(() => {
    if (!db) {
      setSaveState("no-db");
      setLoaded(true);
      return undefined;
    }

    let cancelled = false;

    const changes = db
      .changes({
        since: "now",
        live: true,
        include_docs: true,
        doc_ids: [GRAPH_DOC_ID],
      })
      .on("change", (change) => {
        if (cancelled || change.deleted) {
          return;
        }
        // ignore the echo of our own save
        if (ownRevisions.current.delete(change.doc._rev)) {
          return;
        }
        applyDocument(change.doc);
        setLoaded(true);
      })
      .on("error", (error) =>
        console.error("Error watching the node graph:", error),
      );

    (async () => {
      const local = await db.get(GRAPH_DOC_ID).catch((error) => {
        if (error.name !== "not_found") {
          console.error("Error loading the node graph:", error);
        }
        return null;
      });

      if (cancelled) {
        return;
      }

      if (local) {
        applyDocument(local);
        setLoaded(true);
        return;
      }

      // The database in the browser is a replica that fills in shortly after
      // the page loads. Autosaving before it arrives would overwrite a real
      // graph with an empty canvas, so ask the server whether there is one to
      // wait for and let the changes feed above open the editor when it lands.
      const server = await fetchServerGraph();

      if (!cancelled && !server?.exists) {
        setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
      changes.cancel();
    };
  }, [db, applyDocument]);

  const save = useCallback(
    async (graph, retry = true) => {
      setSaveState("saving");

      try {
        const result = await db.put({
          _id: GRAPH_DOC_ID,
          ...(revision.current ? { _rev: revision.current } : {}),
          ...graph,
        });

        revision.current = result.rev;

        // remember our own revisions long enough to recognise their echo on
        // the changes feed, without growing for the life of the page
        ownRevisions.current.add(result.rev);
        if (ownRevisions.current.size > 20) {
          ownRevisions.current.delete(
            ownRevisions.current.values().next().value,
          );
        }

        setSaveState("saved");
      } catch (error) {
        // someone else saved first: take their revision and write on top of it
        if (error.status === 409 && retry) {
          const doc = await db.get(GRAPH_DOC_ID).catch(() => null);
          revision.current = doc?._rev || null;
          return save(graph, false);
        }

        console.error("Error saving the node graph:", error);
        setSaveState("error");
      }
    },
    [db],
  );

  // debounced autosave
  useEffect(() => {
    if (!loaded || !db) {
      return undefined;
    }

    const graph = serialize(nodes, edges);
    const json = JSON.stringify(graph);

    if (json === lastSaved.current) {
      // a change from elsewhere can land while an edit is still pending
      setSaveState((current) => (current === "pending" ? "idle" : current));
      return undefined;
    }

    setSaveState("pending");

    timer.current = setTimeout(() => {
      lastSaved.current = json;
      save(graph);
    }, SAVE_DELAY);

    return () => clearTimeout(timer.current);
  }, [nodes, edges, loaded, db, save]);

  return { loaded, saveState };
}
