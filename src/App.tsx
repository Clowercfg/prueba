import { GameCanvas } from './ui/GameCanvas'
import { Hud } from './ui/Hud'
import { BottomBar } from './ui/BottomBar'
import { PanelHost } from './ui/panels/PanelHost'

export default function App() {
  return (
    <div className="app-root">
      <GameCanvas />
      <Hud />
      <PanelHost />
      <BottomBar />
    </div>
  )
}
