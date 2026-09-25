import { useEffect, useState } from "react";
import { GameScreen } from "./features/game/ui/GameScreen";
import { OpenMmoBootstrap } from "./features/game/ui/OpenMmoBootstrap";
import { isAndroidTauriRuntime, isTauriRuntime } from "./app/platformRuntime";
import { resolveAppRuntimeMode } from "./app/runtimeMode";
import {
  loadOpenMmoNativeLaunchConfig,
  type OpenMmoNativeLaunchConfig,
} from "./openmmo/nativeLaunch";

export default function App() {
  const explicitMode = resolveAppRuntimeMode(window.location.search);
  const androidTauri = isAndroidTauriRuntime();
  const shouldProbeNative =
    explicitMode !== "openmmo" && isTauriRuntime() && !androidTauri;
  const [nativeLaunchConfig, setNativeLaunchConfig] = useState<
    OpenMmoNativeLaunchConfig | null | undefined
  >(shouldProbeNative ? undefined : null);

  useEffect(() => {
    if (!shouldProbeNative) return;

    let cancelled = false;
    void loadOpenMmoNativeLaunchConfig().then((config) => {
      if (!cancelled) {
        setNativeLaunchConfig(config);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [shouldProbeNative]);

  if (explicitMode === "openmmo" || androidTauri) {
    return <OpenMmoBootstrap />;
  }

  if (nativeLaunchConfig === undefined) {
    return (
      <main className="runtime-shell">
        <section className="runtime-panel">
          <p className="eyebrow">TAURIN4</p>
          <h1>Local runtime 확인 중</h1>
        </section>
      </main>
    );
  }

  if (nativeLaunchConfig?.autostart) {
    return <OpenMmoBootstrap nativeLaunchConfig={nativeLaunchConfig} />;
  }

  return <GameScreen />;
}
