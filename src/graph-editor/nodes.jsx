import { useCallback, useState } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";

import { fireTrigger, useOBS, useSceneItems } from "./obs";

/** Turns a human label into a stable id usable in a URL. */
export function slugify(value) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "trigger"
  );
}

function useNodeData(id) {
  const { updateNodeData } = useReactFlow();

  return useCallback(
    (patch) => updateNodeData(id, patch),
    [id, updateNodeData],
  );
}

function Field({ label, children }) {
  return (
    <label className="node-field">
      <span className="node-field-label">{label}</span>
      {children}
    </label>
  );
}

/**
 * A button in the control panel. Everything wired downstream of it runs when
 * the button is pressed.
 */
export function ButtonTriggerNode({ id, data }) {
  const update = useNodeData(id);
  const [run, setRun] = useState(null);

  const label = data.label ?? "";
  const triggerId = data.triggerId ?? "";

  const test = async () => {
    setRun({ pending: true });
    try {
      setRun(await fireTrigger(triggerId));
    } catch (error) {
      setRun({ ok: false, error: error.message });
    }
  };

  return (
    <div className="node node-trigger">
      <header className="node-header">
        <span className="node-kind">Button trigger</span>
        <button
          type="button"
          className="node-test nodrag"
          onClick={test}
          disabled={!triggerId || run?.pending}
          title="Fire this trigger now"
        >
          {run?.pending ? "…" : "▶ Test"}
        </button>
      </header>

      <Field label="Label">
        <input
          className="nodrag"
          value={label}
          placeholder="Go live"
          onChange={(event) => {
            const next = event.target.value;
            // keep the id in step with the label until it is edited by hand
            update(
              !triggerId || triggerId === slugify(label)
                ? { label: next, triggerId: slugify(next) }
                : { label: next },
            );
          }}
        />
      </Field>

      <Field label="Trigger id">
        <input
          className="nodrag"
          value={triggerId}
          placeholder="go-live"
          onChange={(event) =>
            update({ triggerId: slugify(event.target.value) })
          }
        />
      </Field>

      {run && !run.pending && (
        <p
          className={
            run.ok ? "node-run node-run-ok" : "node-run node-run-error"
          }
        >
          {run.ok
            ? `Ran ${run.steps.length} action${run.steps.length === 1 ? "" : "s"}`
            : run.error ||
              run.steps?.find((step) => !step.ok)?.error ||
              "Failed"}
        </p>
      )}

      <Handle type="source" position={Position.Right} />
    </div>
  );
}

/** Free text input backed by the live list of OBS scenes when one is available. */
function SceneField({ id, value, onChange, label = "Scene" }) {
  const { scenes, currentScene } = useOBS();
  const listId = `scenes-${id}`;

  return (
    <Field label={label}>
      <input
        className="nodrag"
        list={listId}
        value={value}
        placeholder={currentScene || "Scene name"}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={listId}>
        {scenes.map((scene) => (
          <option key={scene} value={scene} />
        ))}
      </datalist>
    </Field>
  );
}

/** Switches the OBS program scene. */
export function SetSceneNode({ id, data }) {
  const update = useNodeData(id);

  return (
    <div className="node node-action">
      <Handle type="target" position={Position.Left} />
      <header className="node-header">
        <span className="node-kind">Switch scene</span>
      </header>

      <SceneField
        id={id}
        value={data.sceneName ?? ""}
        onChange={(sceneName) => update({ sceneName })}
      />

      <Handle type="source" position={Position.Right} />
    </div>
  );
}

/** Shows, hides or toggles a source inside a scene. */
export function SetSourceVisibilityNode({ id, data }) {
  const update = useNodeData(id);
  const sceneName = data.sceneName ?? "";
  const items = useSceneItems(sceneName);
  const listId = `sources-${id}`;

  return (
    <div className="node node-action">
      <Handle type="target" position={Position.Left} />
      <header className="node-header">
        <span className="node-kind">Source visibility</span>
      </header>

      <SceneField
        id={id}
        value={sceneName}
        onChange={(next) => update({ sceneName: next })}
      />

      <Field label="Source">
        <input
          className="nodrag"
          list={listId}
          value={data.sourceName ?? ""}
          placeholder="Source name"
          onChange={(event) => update({ sourceName: event.target.value })}
        />
        <datalist id={listId}>
          {items.map((item) => (
            <option key={item.sceneItemId} value={item.sourceName} />
          ))}
        </datalist>
      </Field>

      <Field label="Action">
        <select
          className="nodrag"
          value={data.mode ?? "toggle"}
          onChange={(event) => update({ mode: event.target.value })}
        >
          <option value="show">Show</option>
          <option value="hide">Hide</option>
          <option value="toggle">Toggle</option>
        </select>
      </Field>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}

/** Node type name -> component, palette entry and the data a new node starts with. */
export const NODE_TYPES = {
  "trigger.button": {
    component: ButtonTriggerNode,
    label: "Button trigger",
    kind: "trigger",
    defaults: () => ({ label: "", triggerId: "" }),
  },
  "obs.setScene": {
    component: SetSceneNode,
    label: "Switch scene",
    kind: "action",
    defaults: (obs) => ({ sceneName: obs?.currentScene || "" }),
  },
  "obs.setSourceVisibility": {
    component: SetSourceVisibilityNode,
    label: "Source visibility",
    kind: "action",
    defaults: (obs) => ({
      sceneName: obs?.currentScene || "",
      sourceName: "",
      mode: "toggle",
    }),
  },
};

export const nodeTypes = Object.fromEntries(
  Object.entries(NODE_TYPES).map(([type, { component }]) => [type, component]),
);
