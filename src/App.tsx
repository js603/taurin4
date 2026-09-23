import { GameScreen } from "./features/game/ui/GameScreen";
import { OpenMmoBootstrap } from "./features/game/ui/OpenMmoBootstrap";
import { resolveAppRuntimeMode } from "./app/runtimeMode";

export default function App() {
  return resolveAppRuntimeMode(window.location.search) === "openmmo" ? (
    <OpenMmoBootstrap />
  ) : (
    <GameScreen />
  );
}
