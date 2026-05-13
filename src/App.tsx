import AppRouter from "./routers/AppRouter";
import { useAutoUpdate } from "./hooks/useAutoUpdate";

function App() {
  useAutoUpdate();
  return <AppRouter />;
}

export default App
