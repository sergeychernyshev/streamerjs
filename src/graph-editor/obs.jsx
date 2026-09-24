import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

const OBSContext = createContext(null);

async function api(path) {
  const response = await fetch(`/_graph${path}`, {
    headers: { Accept: "application/json", "X-Requested-With": "fetch" },
  });

  return response
    .json()
    .catch(() => ({ ok: false, error: "Bad response from server" }));
}

export function fireTrigger(triggerId) {
  return fetch(`/_graph/trigger/${encodeURIComponent(triggerId)}`, {
    method: "POST",
    headers: { Accept: "application/json", "X-Requested-With": "fetch" },
  }).then((response) => response.json());
}

/**
 * Keeps the editor's picture of OBS current: connection status, the scene list
 * and the sources of every scene a node has asked about.
 *
 * Everything degrades to plain text entry when OBS is unreachable, so a graph
 * can be built before OBS is even running.
 */
export function OBSProvider({ children }) {
  const [status, setStatus] = useState(null);
  const [scenes, setScenes] = useState([]);
  const [currentScene, setCurrentScene] = useState(null);
  const [sceneItems, setSceneItems] = useState({});
  const pending = useRef(new Set());

  const connected = useRef(false);

  const refresh = useCallback(async () => {
    const next = await api("/status");
    setStatus(next.obs || null);

    if (!next.obs?.connected) {
      connected.current = false;
      return;
    }

    const list = await api("/obs/scenes");
    if (!list.ok) {
      return;
    }

    setScenes(list.scenes || []);
    setCurrentScene(list.currentProgramSceneName || null);

    // scene contents may have changed while OBS was away, but re-reading them
    // on every poll would refetch every source list every few seconds
    if (!connected.current) {
      connected.current = true;
      pending.current.clear();
      setSceneItems({});
    }
  }, []);

  useEffect(() => {
    refresh();

    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, [refresh]);

  const loadSceneItems = useCallback(async (sceneName) => {
    if (!sceneName || pending.current.has(sceneName)) {
      return;
    }
    pending.current.add(sceneName);

    const body = await api(
      `/obs/scenes/${encodeURIComponent(sceneName)}/items`,
    );

    setSceneItems((current) => ({
      ...current,
      [sceneName]: body.ok ? body.items : [],
    }));
  }, []);

  return (
    <OBSContext.Provider
      value={{
        status,
        scenes,
        currentScene,
        sceneItems,
        loadSceneItems,
        refresh,
      }}
    >
      {children}
    </OBSContext.Provider>
  );
}

export function useOBS() {
  return useContext(OBSContext);
}

/** Source names of a scene, fetched on demand the first time a node asks. */
export function useSceneItems(sceneName) {
  const { sceneItems, loadSceneItems } = useOBS();

  useEffect(() => {
    if (sceneName && sceneItems[sceneName] === undefined) {
      loadSceneItems(sceneName);
    }
  }, [sceneName, sceneItems, loadSceneItems]);

  return sceneItems[sceneName] || [];
}
