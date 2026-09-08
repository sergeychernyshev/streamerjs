/**
 * Control panel client for the StreamerJS node graph.
 *
 * Loaded with `<script src="/_resources/graph.js"></script>` it gives you:
 *
 *   StreamerGraph.trigger(id)   fire a trigger from your own code
 *   <streamer-trigger>          turn markup into a trigger button
 *   <streamer-trigger-panel>    render a button for every trigger in the graph
 */

/**
 * The database from `/_resources/db.js`, when that script is on the page.
 *
 * db.js declares `db` with `const`, which makes it a global lexical binding
 * rather than a property of `window`, so both spellings are checked.
 */
function sharedDatabase() {
  if (typeof window !== "undefined" && window.db?.changes) {
    return window.db;
  }

  return typeof db !== "undefined" && db?.changes ? db : null;
}

const StreamerGraph = (() => {
  const BASE = "/_graph";

  async function request(path, options = {}) {
    const response = await fetch(new URL(BASE + path, location.href), {
      ...options,
      headers: {
        Accept: "application/json",
        "X-Requested-With": "fetch",
        ...options.headers,
      },
    });

    const body = await response.json().catch(() => ({
      ok: false,
      error: `${response.status} ${response.statusText}`,
    }));

    if (!response.ok && body.ok !== false) {
      body.ok = false;
    }

    return body;
  }

  /** Fires a trigger by id and resolves with the run report. */
  function trigger(id) {
    return request(`/trigger/${encodeURIComponent(id)}`, { method: "POST" });
  }

  function status() {
    return request("/status");
  }

  function triggers() {
    return request("/triggers").then((body) => body.triggers || []);
  }

  return { trigger, status, triggers, request };
})();

/**
 * Reports the outcome of a run on the element that started it, so a broken
 * action is visible in the control panel instead of only in the console.
 */
function reflectRun(element, run) {
  element.toggleAttribute("data-failed", run.ok === false);
  element.dataset.lastRun = new Date().toISOString();

  if (run.ok === false) {
    const failed = (run.steps || []).filter((step) => step.ok === false);
    const reason =
      run.error ||
      failed.map((step) => `${step.description}: ${step.error}`).join("; ");

    console.error("Trigger failed:", reason);
    element.title = reason;
  } else {
    element.removeAttribute("title");
  }

  element.dispatchEvent(
    new CustomEvent("streamer-trigger-run", { detail: run, bubbles: true }),
  );
}

async function fireFrom(element, triggerId) {
  if (!triggerId) {
    console.warn(
      "<streamer-trigger> is missing a trigger-id attribute",
      element,
    );
    return;
  }

  element.toggleAttribute("data-busy", true);

  try {
    reflectRun(element, await StreamerGraph.trigger(triggerId));
  } finally {
    element.removeAttribute("data-busy");
  }
}

/**
 * Wraps markup that fires a trigger.
 *
 * Write the no-JavaScript version and this element enhances it in place:
 *
 *   <streamer-trigger trigger-id="go-live">
 *     <form method="post" action="/_graph/trigger/go-live">
 *       <button>Go live</button>
 *     </form>
 *   </streamer-trigger>
 *
 * With an empty element a button is created from the `label` attribute.
 */
class StreamerTriggerElement extends HTMLElement {
  connectedCallback() {
    if (!this.querySelector("button, form, a")) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent =
        this.getAttribute("label") || this.textContent.trim() || this.triggerId;
      this.textContent = "";
      this.append(button);
    }

    this.addEventListener("submit", this);
    this.addEventListener("click", this);
  }

  disconnectedCallback() {
    this.removeEventListener("submit", this);
    this.removeEventListener("click", this);
  }

  get triggerId() {
    return this.getAttribute("trigger-id") || "";
  }

  handleEvent(event) {
    // a form inside submits; a bare button only clicks
    if (event.type === "click" && event.target.closest("form")) {
      return;
    }
    if (event.type === "click" && !event.target.closest("button, a")) {
      return;
    }

    event.preventDefault();
    fireFrom(this, this.triggerId);
  }
}

/**
 * Renders one button per button trigger found in the node graph and keeps the
 * list current as the graph is edited.
 */
class StreamerTriggerPanelElement extends HTMLElement {
  connectedCallback() {
    this.render();

    // the graph lives in PouchDB, so follow it live when db.js is loaded too
    const database = sharedDatabase();
    if (database) {
      this.changes = database
        .changes({ since: "now", live: true, doc_ids: ["node_graph"] })
        .on("change", () => this.render());
    }
  }

  disconnectedCallback() {
    this.changes?.cancel();
    this.changes = null;
  }

  async render() {
    let triggers;

    try {
      triggers = await StreamerGraph.triggers();
    } catch (error) {
      this.textContent = "Could not load triggers.";
      return;
    }

    if (triggers.length === 0) {
      this.innerHTML =
        '<p class="streamer-trigger-panel-empty">No triggers yet. Add a button trigger in the <a href="/graph/">node graph</a>.</p>';
      return;
    }

    this.textContent = "";

    for (const { id, label } of triggers) {
      const wrapper = document.createElement("streamer-trigger");
      wrapper.setAttribute("trigger-id", id);

      const form = document.createElement("form");
      form.method = "post";
      form.action = `/_graph/trigger/${encodeURIComponent(id)}`;

      const button = document.createElement("button");
      button.type = "submit";
      button.textContent = label;

      form.append(button);
      wrapper.append(form);
      this.append(wrapper);
    }
  }
}

customElements.define("streamer-trigger", StreamerTriggerElement);
customElements.define("streamer-trigger-panel", StreamerTriggerPanelElement);
