import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)
  const [inputValue, setInputValue] = useState('')

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1A1A1F] to-[#0C0C0E]">
      {/* Header */}
      <header className="bg-gradient-to-b from-[#2A2A32] to-[#1A1A1F] border-b border-[#3D3D44] shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="poe-header poe-header-large">
            POE Knowledge Assistant
          </h1>
          <p className="text-[#9F9F9F] mt-2">
            Your intelligent assistant for Path of Exile
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Tailwind Test Section */}
        <section className="mb-8">
          <h2 className="text-2xl poe-header mb-4">
            Tailwind CSS Configuration Test
          </h2>
          <div className="poe-card">
            <p className="text-[#C8C8C8] mb-4">
              Tailwind CSS is successfully configured with Path of Exile theme!
            </p>

            {/* Color Palette Demo */}
            <div className="mb-6">
              <h3 className="text-lg text-[#FFFFFF] mb-3">
                PoE Color Palette
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-[#AF6025] p-3 rounded text-center text-[#0C0C0E] font-bold">
                  Gold Primary
                </div>
                <div className="bg-[#D4A85A] p-3 rounded text-center text-[#0C0C0E] font-bold">
                  Gold Light
                </div>
                <div className="bg-[#7D4A1C] p-3 rounded text-center text-[#FFFFFF] font-bold">
                  Gold Dark
                </div>
                <div className="bg-[#1C1C22] border border-[#3D3D44] p-3 rounded text-center text-[#C8C8C8]">
                  Background
                </div>
              </div>
            </div>

            {/* Rarity Colors Demo */}
            <div className="mb-6">
              <h3 className="text-lg text-[#FFFFFF] mb-3">
                Item Rarity Colors
              </h3>
              <div className="flex flex-wrap gap-4">
                <span className="poe-text-normal font-bold">Normal</span>
                <span className="poe-text-magic font-bold">Magic</span>
                <span className="poe-text-rare font-bold">Rare</span>
                <span className="poe-text-unique font-bold">Unique</span>
                <span className="poe-text-gem font-bold">Gem</span>
                <span className="poe-text-currency font-bold">Currency</span>
              </div>
            </div>

            {/* Element Colors Demo */}
            <div className="mb-6">
              <h3 className="text-lg text-[#FFFFFF] mb-3">
                Element Colors
              </h3>
              <div className="flex flex-wrap gap-4">
                <span className="text-fire font-bold">Fire</span>
                <span className="text-cold font-bold">Cold</span>
                <span className="text-lightning font-bold">Lightning</span>
                <span className="text-chaos font-bold">Chaos</span>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive Components Demo */}
        <section className="mb-8">
          <h2 className="text-2xl poe-header mb-4">
            PoE Component Examples
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Buttons Demo */}
            <div className="poe-card">
              <h3 className="text-lg text-[#FFFFFF] mb-4">
                Buttons
              </h3>
              <div className="space-y-4">
                <div>
                  <button
                    onClick={() => setCount((count) => count + 1)}
                    className="poe-button"
                  >
                    Count is {count}
                  </button>
                </div>
                <div>
                  <button className="poe-button-secondary">
                    Secondary Button
                  </button>
                </div>
                <div>
                  <button className="px-4 py-2 bg-[#AF6025] text-[#FFFFFF] rounded border border-[#7D4A1C] hover:shadow-[0_0_10px_rgba(175,96,37,0.5)] transition-all duration-200">
                    Unique Style
                  </button>
                </div>
              </div>
            </div>

            {/* Input Demo */}
            <div className="poe-card">
              <h3 className="text-lg text-[#FFFFFF] mb-4">
                Input Fields
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-[#9F9F9F] mb-2">
                    Search the Knowledge Base
                  </label>
                  <input
                    type="text"
                    placeholder="Ask about items, builds, mechanics..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="poe-input w-full"
                  />
                </div>
                <div>
                  <label className="block text-[#9F9F9F] mb-2">
                    Character Name
                  </label>
                  <input
                    type="text"
                    placeholder="Enter character name"
                    className="poe-input w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Glow Effects Demo */}
        <section>
          <h2 className="text-2xl poe-header mb-4">
            Visual Effects
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="poe-card hover:shadow-[0_0_10px_rgba(175,96,37,0.5)] transition-shadow duration-300">
              <h4 className="text-[#AF6025] font-bold mb-2">Gold Glow</h4>
              <p className="text-[#9F9F9F] text-sm">
                Hover for golden glow effect
              </p>
            </div>
            <div className="poe-card hover:shadow-[0_0_20px_rgba(175,96,37,0.7)] transition-shadow duration-300">
              <h4 className="text-[#FFFF77] font-bold mb-2">Strong Glow</h4>
              <p className="text-[#9F9F9F] text-sm">
                Hover for stronger glow
              </p>
            </div>
            <div className="poe-card border-[#8888FF] hover:border-[#8888FF] transition-colors duration-300">
              <h4 className="text-[#8888FF] font-bold mb-2">Magic Border</h4>
              <p className="text-[#9F9F9F] text-sm">
                Magic rarity styling
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#3D3D44] bg-[#141418] mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center">
          <p className="text-[#6B6B6B] text-sm">
            PoE Knowledge Assistant - Powered by React + Vite + TypeScript + Tailwind CSS
          </p>
          <p className="text-[#6B6B6B] text-xs mt-2">
            Path of Exile is a trademark of Grinding Gear Games
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App
