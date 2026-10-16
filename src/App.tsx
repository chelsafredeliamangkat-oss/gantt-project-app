import { ProjectProvider } from './store/ProjectContext'
import { AppShell } from './components/AppShell'

export default function App() {
  return (
    <ProjectProvider>
      <AppShell />
    </ProjectProvider>
  )
}
