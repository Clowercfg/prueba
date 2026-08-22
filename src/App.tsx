import { GameCanvas } from './ui/GameCanvas'
import { Hud } from './ui/Hud'

export default function App() {
  return (
    <div className="app-root">
      <GameCanvas />
      <Hud />
    </div>
  )
}
