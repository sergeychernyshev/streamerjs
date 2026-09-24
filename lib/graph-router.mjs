import express from "express";

import { NODE_TYPES } from "./graph-runtime.mjs";

function wantsJSON(req) {
  return (
    req.xhr ||
    req.get("X-Requested-With") === "fetch" ||
    (req.accepts(["html", "json"]) || "json") === "json"
  );
}

function sendError(res, error, status = 500) {
  res
    .status(status)
    .json({ ok: false, error: error?.message || String(error) });
}

/**
 * REST API backing the node graph editor and the control panel triggers.
 */
export default function createGraphRouter({ runtime, obs }) {
  const router = express.Router();

  router.use(express.json());
  router.use(express.urlencoded({ extended: false }));

  router.get("/status", (req, res) => {
    const graph = runtime.getGraph();

    res.json({
      ok: true,
      obs: obs.status(),
      graph: {
        nodes: graph.nodes.length,
        edges: graph.edges.length,
        triggers: runtime.getTriggers().length,
      },
    });
  });

  router.get("/node-types", (req, res) => {
    res.json({
      ok: true,
      nodeTypes: Object.entries(NODE_TYPES).map(([type, definition]) => ({
        type,
        label: definition.label,
        kind: definition.kind,
      })),
    });
  });

  /**
   * The graph as the server currently has it. The editor uses this to tell an
   * empty project apart from one whose document has not replicated yet.
   */
  router.get("/graph", (req, res) => {
    const graph = runtime.getGraph();

    res.json({
      ok: true,
      exists: graph.nodes.length > 0 || graph.edges.length > 0,
      ...graph,
    });
  });

  router.get("/triggers", (req, res) => {
    res.json({ ok: true, triggers: runtime.getTriggers() });
  });

  router.get("/obs/scenes", async (req, res) => {
    try {
      res.json({ ok: true, ...(await obs.getScenes()) });
    } catch (error) {
      sendError(res, error, 503);
    }
  });

  router.get("/obs/scenes/:sceneName/items", async (req, res) => {
    try {
      res.json({
        ok: true,
        sceneName: req.params.sceneName,
        items: await obs.getSceneItems(req.params.sceneName),
      });
    } catch (error) {
      sendError(res, error, 503);
    }
  });

  /**
   * Fires a trigger.
   *
   * Answers with JSON for `fetch`, and redirects back to the control panel for
   * a plain `<form method="post">` so buttons keep working without JavaScript.
   */
  async function fireTrigger(req, res) {
    const triggerId =
      req.params.triggerId || req.body?.id || req.body?.triggerId;

    if (!triggerId) {
      return sendError(res, new Error("Missing trigger id"), 400);
    }

    let run;

    try {
      run = await runtime.fire(triggerId);
    } catch (error) {
      return sendError(res, error);
    }

    if (wantsJSON(req)) {
      const status = run.ok ? 200 : run.code === "unknown_trigger" ? 404 : 502;

      return res.status(status).json(run);
    }

    const back = req.get("Referer");

    return res.redirect(303, back || "/control/");
  }

  router.post("/trigger", fireTrigger);
  router.post("/trigger/:triggerId", fireTrigger);

  return router;
}
