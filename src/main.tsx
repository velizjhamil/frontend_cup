import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'katex/dist/katex.min.css'
import App from './App.tsx'
import { hydrateSimulation, startSimulationPersistence } from './lib/simulationPersistence'

// 1) Restaurar el simulacro guardado y 2) recién ahí escuchar cambios.
// En ese orden: si se suscribe antes, el estado inicial ('idle') podría
// pisar en IndexedDB el examen que quedó a medias.
void (async () => {
  try {
    await hydrateSimulation()
  } finally {
    startSimulationPersistence()
  }
})()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
