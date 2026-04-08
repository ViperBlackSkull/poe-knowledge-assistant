import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="app">
      <header className="app-header">
        <h1>POE Knowledge Assistant</h1>
        <p>Your intelligent assistant for Path of Exile</p>
      </header>
      <main className="app-main">
        <div className="card">
          <button onClick={() => setCount((count) => count + 1)}>
            count is {count}
          </button>
          <p>
            Frontend is successfully running with React + Vite + TypeScript
          </p>
        </div>
      </main>
    </div>
  )
}

export default App
