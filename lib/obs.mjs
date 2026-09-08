import OBSWebSocket from "obs-websocket-js";

const DEFAULT_URL = "ws://127.0.0.1:4455";
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];
const CONNECT_TIMEOUT = 10000;

/**
 * Thin, resilient wrapper around the OBS WebSocket v5 protocol.
 *
 * The manager owns a single connection, reconnects with a backoff when OBS
 * goes away and exposes the handful of high level calls the node graph needs.
 */
export default class OBSManager {
  constructor(options = {}) {
    this.url = options.url || DEFAULT_URL;
    this.password = options.password || undefined;
    this.autoConnect = options.autoConnect !== false;
    this.connectTimeout = options.connectTimeout || CONNECT_TIMEOUT;

    this.obs = new OBSWebSocket();
    this.connected = false;
    this.identified = null;
    this.lastError = null;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.connecting = null;
    this.stopped = false;

    this.obs.on("ConnectionOpened", () => {
      this.lastError = null;
    });

    this.obs.on("Identified", () => {
      this.connected = true;
      this.reconnectAttempt = 0;
      console.log(`  - ✅ Connected to OBS at ${this.url}`);
    });

    this.obs.on("ConnectionClosed", () => {
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected) {
        console.log("  - ⚠️  OBS connection closed");
      }
      this.scheduleReconnect();
    });

    this.obs.on("ConnectionError", (error) => {
      this.connected = false;
      this.lastError = error?.message || String(error);
    });
  }

  /**
   * Connects to OBS. Never rejects: a failure is recorded and retried in the
   * background so the rest of the server keeps working without OBS running.
   */
  async connect() {
    this.stopped = false;

    // one attempt at a time, so a retry can't stack on an in-flight connect
    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = (async () => {
      try {
        // a socket that opens but never finishes identifying would otherwise
        // hang here forever and no retry would ever be scheduled
        this.identified = await withTimeout(
          this.obs.connect(this.url, this.password),
          this.connectTimeout,
          `Timed out connecting to OBS at ${this.url}`,
        );
        this.connected = true;
        this.lastError = null;
      } catch (error) {
        this.connected = false;
        this.lastError = error?.message || String(error);
        await this.obs.disconnect().catch(() => {});
        this.scheduleReconnect();
      } finally {
        this.connecting = null;
      }

      return this.status();
    })();

    return this.connecting;
  }

  scheduleReconnect() {
    if (this.stopped || !this.autoConnect || this.reconnectTimer) {
      return;
    }

    const delay =
      RECONNECT_DELAYS[
        Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)
      ];
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.stopped || this.connected) {
        return;
      }
      this.connect();
    }, delay);

    // don't hold the process open just to retry an OBS connection
    this.reconnectTimer.unref?.();
  }

  async disconnect() {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      await this.obs.disconnect();
    } catch (error) {
      // disconnecting a dead socket is not interesting
    }
    this.connected = false;
  }

  status() {
    return {
      configured: true,
      connected: this.connected,
      url: this.url,
      obsWebSocketVersion: this.identified?.obsWebSocketVersion || null,
      negotiatedRpcVersion: this.identified?.negotiatedRpcVersion || null,
      error: this.connected ? null : this.lastError,
    };
  }

  call(requestType, requestData) {
    if (!this.connected) {
      return Promise.reject(
        new Error(
          `Not connected to OBS at ${this.url}${
            this.lastError ? ` (${this.lastError})` : ""
          }`,
        ),
      );
    }
    return this.obs.call(requestType, requestData);
  }

  async getScenes() {
    const { scenes, currentProgramSceneName } = await this.call("GetSceneList");

    return {
      currentProgramSceneName,
      // OBS returns scenes bottom-up, the UI reads better top-down
      scenes: [...scenes]
        .sort((a, b) => b.sceneIndex - a.sceneIndex)
        .map(({ sceneName }) => sceneName),
    };
  }

  async getSceneItems(sceneName) {
    const { sceneItems } = await this.call("GetSceneItemList", { sceneName });

    return sceneItems.map((item) => ({
      sceneItemId: item.sceneItemId,
      sourceName: item.sourceName,
      enabled: item.sceneItemEnabled,
      isGroup: Boolean(item.isGroup),
    }));
  }

  async setCurrentScene(sceneName) {
    if (!sceneName) {
      throw new Error("Scene name is required");
    }

    await this.call("SetCurrentProgramScene", { sceneName });

    return { sceneName };
  }

  /**
   * Shows, hides or toggles a source inside a scene.
   *
   * @param {object} params
   * @param {string} params.sceneName scene holding the source
   * @param {string} params.sourceName name of the source (scene item)
   * @param {"show"|"hide"|"toggle"} params.mode what to do with it
   */
  async setSourceVisibility({ sceneName, sourceName, mode = "toggle" }) {
    if (!sceneName) {
      throw new Error("Scene name is required");
    }
    if (!sourceName) {
      throw new Error("Source name is required");
    }

    const { sceneItemId } = await this.call("GetSceneItemId", {
      sceneName,
      sourceName,
    });

    let sceneItemEnabled;

    if (mode === "show") {
      sceneItemEnabled = true;
    } else if (mode === "hide") {
      sceneItemEnabled = false;
    } else if (mode === "toggle") {
      const current = await this.call("GetSceneItemEnabled", {
        sceneName,
        sceneItemId,
      });
      sceneItemEnabled = !current.sceneItemEnabled;
    } else {
      throw new Error(`Unknown visibility mode: ${mode}`);
    }

    await this.call("SetSceneItemEnabled", {
      sceneName,
      sceneItemId,
      sceneItemEnabled,
    });

    return { sceneName, sourceName, visible: sceneItemEnabled };
  }
}

function withTimeout(promise, ms, message) {
  let timer;

  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
      timer.unref?.();
    }),
  ]);
}

/**
 * Stand-in used when OBS is not configured, so the graph can still be edited
 * and every action fails with an explanation instead of a crash.
 */
export class UnconfiguredOBS {
  status() {
    return {
      configured: false,
      connected: false,
      url: null,
      obsWebSocketVersion: null,
      negotiatedRpcVersion: null,
      error: 'OBS is not configured. Add an "obs" section to config.json.',
    };
  }

  call() {
    return Promise.reject(new Error(this.status().error));
  }

  getScenes() {
    return this.call();
  }
  getSceneItems() {
    return this.call();
  }
  setCurrentScene() {
    return this.call();
  }
  setSourceVisibility() {
    return this.call();
  }
  disconnect() {
    return Promise.resolve();
  }
}
