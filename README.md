# 🐍 PyLearn - Python Learning Site

A free, accessible, AI-powered Python learning platform that runs entirely in your browser.

**Live Demo:** Deploy to GitHub Pages and share!

## Features

- ✅ **6 Learning Modules** - Beginner-friendly Python curriculum
- 💬 **AI Tutor** - Free in-browser LLM (WebLLM) or local models (Ollama, llama.cpp)
- ▶️ **Run Python in Browser** - Execute code directly with Pyodide
- 🌙 **Dark/Light Mode** - Respects system preference
- ♿ **WCAG 2.1 AA Accessible** - Keyboard navigation, screen reader friendly
- 💾 **Progress Tracking** - Saved locally in your browser
- 📝 **Interactive Quizzes** - Test your knowledge
- 🚀 **10 Follow-up Projects** - Keep building after you learn

## Quick Start

### Option 1: Just Open It
```bash
# Clone or download, then open index.html in your browser
open index.html
```

### Option 2: Local Server (for full features)
```bash
# Python
python -m http.server 8000

# Node
npx serve .

# Then visit http://localhost:8000
```

### Option 3: Deploy to GitHub Pages (Recommended)
1. Fork this repo or push to your own
2. Go to Settings → Pages
3. Select "main" branch → Save
4. Your site is live at `https://yourusername.github.io/python-learning-site/`

## How the AI Tutor Works

The tutor uses **WebLLM** to run a small language model (Llama-3.2-1B) directly in your browser:

- 🆓 **Free** - No API keys or accounts needed
- 🔒 **Private** - No data leaves your browser
- ⏳ **First load** - Downloads ~500MB model (cached after)
- 💻 **Requirements** - Modern browser with WebGPU support

### PocketFlow Architecture

The tutor is built using the PocketFlow pattern - a 100-line LLM framework:

```
[GetContext] → [BuildPrompt] → [CallLLM] → [FormatResponse]
                                    ↓
                              [ErrorHandler]
```

Each "node" does one thing:
1. **GetContext** - Gets user's progress & current page
2. **BuildPrompt** - Creates system prompt with context
3. **CallLLM** - Calls WebLLM
4. **FormatResponse** - Formats output for display
5. **ErrorHandler** - Graceful fallback if LLM fails

Study `js/tutor-flow.js` to see how it works!

## Project Structure

```
python-learning-site/
├── index.html          # Homepage & dashboard
├── projects.html       # 10 project ideas to build next
├── css/
│   ├── styles.css      # Main styles + dark mode
│   ├── tutor.css       # Chat panel styles
│   └── module.css      # Module page styles
├── js/
│   ├── app.js          # Theme, progress, keyboard shortcuts
│   ├── tutor-flow.js   # PocketFlow LLM architecture
│   └── tutor-ui.js     # Chat interface controller
└── modules/
    ├── module-1.html   # Python Basics
    ├── module-2.html   # Control Flow
    ├── module-3.html   # Functions & Modules
    ├── module-4.html   # Data Structures
    ├── module-5.html   # Files & Exceptions
    └── module-6.html   # OOP Basics
```

## Customizing

### Add Your Own Content
Edit the module HTML files to add lessons, code examples, and quizzes.

### Change the AI's Personality
Edit the system prompt in `js/tutor-flow.js` → `BuildPromptNode.exec()`

### Use a Different Model
In `js/tutor-flow.js`, change `modelId` in `TutorLLM.init()`:
```javascript
// Smaller, faster
const modelId = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';

// Larger, smarter (needs more VRAM)
const modelId = 'Llama-3.2-3B-Instruct-q4f16_1-MLC';
```

See [WebLLM models](https://webllm.mlc.ai/) for options.

## Accessibility

This site follows WCAG 2.1 AA guidelines:
- Skip links for keyboard users
- ARIA labels and live regions
- 4.5:1+ color contrast ratios
- Focus indicators on all interactive elements
- Works with screen readers
- Keyboard shortcuts (press `?` to see them)

## Browser Support

- ✅ Chrome 113+ (WebGPU)
- ✅ Edge 113+ (WebGPU)
- ⚠️ Firefox (WebGPU behind flag)
- ⚠️ Safari (WebGPU in development)

The site works in all browsers, but the AI tutor requires WebGPU.

## Credits

- **PocketFlow** - 100-line LLM framework pattern
- **WebLLM** - In-browser LLM inference
- **Prism.js** - Syntax highlighting
- **Outfit + JetBrains Mono** - Typography

## License

MIT - Use it, modify it, share it!

---

## What's Next?

After learning Python with this site, check out `projects.html` for 10 project ideas including:

1. **Rebuild This Site** - The ultimate learning exercise
2. **Flashcard App** - Spaced repetition for memorization
3. **Code Snippet Manager** - Save useful code
4. **Weather Dashboard** - Learn APIs
5. **Chat with Documents (RAG)** - Advanced AI patterns

Each project includes a ready-to-use Claude Code prompt!

---

**Producer Mindset:** Learn to build, don't just consume. 🚀
