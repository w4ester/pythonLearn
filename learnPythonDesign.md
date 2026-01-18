# WebLLM + PocketFlow Architecture Guide
## How to Build an AI-Powered Learning Site

*From: AI Product Manager*
*To: Any model recreating this pattern*

---

## 1. THE BIG PICTURE

This architecture lets you run an AI tutor **100% in the browser** with:
- **No API keys** (free forever)
- **No backend server** (static hosting on GitHub Pages)
- **No data leaving the user's device** (complete privacy)

```
+-------------------------------------------------------------+
|                     USER'S BROWSER                          |
|  +-------------+    +-------------+    +-----------------+  |
|  |  Your Site  |--->|  PocketFlow |--->|  WebLLM Engine  |  |
|  |  (HTML/JS)  |    |  (5 Nodes)  |    |  (Llama 3.2 1B) |  |
|  +-------------+    +-------------+    +-----------------+  |
+-------------------------------------------------------------+
```

---

## 2. WEBLLM: How It Works

WebLLM runs a quantized LLM directly in the browser using **WebGPU**.

### Initialization (one-time ~500MB download):

```javascript
// Import from CDN - no npm needed!
const { CreateMLCEngine } = await import('https://esm.run/@mlc-ai/web-llm');

// Create the engine with a model
const engine = await CreateMLCEngine('Llama-3.2-1B-Instruct-q4f16_1-MLC', {
    initProgressCallback: (progress) => {
        console.log(progress.text);  // "Loading: 45%"
    }
});
```

### Using it (OpenAI-compatible API):

```javascript
const response = await engine.chat.completions.create({
    messages: [
        { role: 'system', content: 'You are a helpful tutor.' },
        { role: 'user', content: 'What is a variable?' }
    ],
    temperature: 0.7,
    max_tokens: 500
});

const answer = response.choices[0].message.content;
```

**Key insight:** WebLLM uses the exact same API as OpenAI. If you know one, you know the other.

---

## 3. POCKETFLOW: The 100-Line LLM Framework

PocketFlow is a pattern for building LLM apps with **Nodes** connected by **Actions** sharing a **Store**.

### Core Concepts:

| Concept | What It Is | Example |
|---------|-----------|---------|
| **Node** | A single unit of work | "Build the prompt" |
| **Action** | The outcome that determines next step | "success" or "error" |
| **Shared Store** | Object passed through all nodes | `{ question, response }` |
| **Flow** | The graph connecting nodes | GetContext -> BuildPrompt -> CallLLM |

### The Node Class (copy this exactly):

```javascript
class Node {
    constructor(name) {
        this.name = name;
    }

    // 1. PREP: Read from shared store
    prep(shared) {
        return null;  // Return data for exec
    }

    // 2. EXEC: Do the actual work (async)
    async exec(prepResult) {
        return null;  // Return result for post
    }

    // 3. POST: Write to shared store, return action name
    post(shared, prepResult, execResult) {
        return 'default';  // Action determines next node
    }

    async run(shared) {
        const prepResult = this.prep(shared);
        const execResult = await this.exec(prepResult);
        return this.post(shared, prepResult, execResult);
    }
}
```

### The Flow Class (copy this exactly):

```javascript
class Flow {
    constructor(startNode) {
        this.startNode = startNode;
        this.nodes = new Map();
        this.edges = new Map();  // node -> { action: nextNodeName }
    }

    addNode(node) {
        this.nodes.set(node.name, node);
        return this;
    }

    connect(fromNode, toNode, action = 'default') {
        const from = fromNode.name;
        if (!this.edges.has(from)) {
            this.edges.set(from, {});
        }
        this.edges.get(from)[action] = toNode.name;
        return this;
    }

    async run(shared) {
        let currentNode = this.startNode;

        while (currentNode) {
            const node = this.nodes.get(currentNode.name) || currentNode;
            const action = await node.run(shared);

            const nodeEdges = this.edges.get(node.name);
            if (nodeEdges && nodeEdges[action]) {
                currentNode = this.nodes.get(nodeEdges[action]);
            } else {
                currentNode = null;  // End of flow
            }
        }

        return shared;
    }
}
```

---

## 4. THE 5 NODES FOR A TUTOR

Here's the flow PyLearn uses:

```
+-------------+     +-------------+     +-------------+
| GetContext  |---->| BuildPrompt |---->|   CallLLM   |
+-------------+     +-------------+     +-------------+
                                              |
                                         +----+----+
                                      success    error
                                         |         |
                                         v         v
                                   +----------+ +-----------+
                                   |  Format  | |  Fallback |
                                   +----------+ +-----------+
```

### Node 1: GetContextNode
**Purpose:** Gather info about user's current state

```javascript
class GetContextNode extends Node {
    constructor() { super('GetContext'); }

    prep(shared) {
        // Read user's saved progress
        const progress = JSON.parse(localStorage.getItem('myapp_progress') || '{}');
        const currentPage = window.location.pathname;
        return { progress, currentPage };
    }

    async exec({ progress, currentPage }) {
        // Determine what module/lesson they're on
        return {
            currentLesson: this.detectLesson(currentPage),
            completedLessons: progress.completed || [],
            userLevel: progress.level || 'beginner'
        };
    }

    post(shared, prepResult, execResult) {
        shared.context = execResult;  // Save to shared store
        return 'default';  // Go to next node
    }
}
```

### Node 2: BuildPromptNode
**Purpose:** Create the system prompt with context

```javascript
class BuildPromptNode extends Node {
    constructor() { super('BuildPrompt'); }

    prep(shared) {
        return { question: shared.question, context: shared.context };
    }

    async exec({ question, context }) {
        // THIS IS WHERE YOU CUSTOMIZE FOR YOUR DOMAIN!
        const systemPrompt = `You are a friendly ${context.subject} tutor.

CURRENT CONTEXT:
- User is on: ${context.currentLesson}
- Completed: ${context.completedLessons.join(', ') || 'Nothing yet'}
- Level: ${context.userLevel}

YOUR TOPICS:
${context.topicList}

RULES:
- Only use concepts they've learned
- Be encouraging
- Include examples`;

        return { systemPrompt, userMessage: question };
    }

    post(shared, prepResult, execResult) {
        shared.prompt = execResult;
        return 'default';
    }
}
```

### Node 3: CallLLMNode
**Purpose:** Send to WebLLM and get response

```javascript
class CallLLMNode extends Node {
    constructor() { super('CallLLM'); }

    prep(shared) { return shared.prompt; }

    async exec({ systemPrompt, userMessage }) {
        try {
            const engine = window.MyTutorEngine;  // Your global engine

            const response = await engine.chat.completions.create({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.7,
                max_tokens: 500
            });

            return { success: true, response: response.choices[0].message.content };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    post(shared, prepResult, execResult) {
        shared.llmResult = execResult;
        // BRANCHING: Return different action based on result
        return execResult.success ? 'success' : 'error';
    }
}
```

### Node 4: FormatResponseNode
**Purpose:** Convert markdown to HTML

```javascript
class FormatResponseNode extends Node {
    constructor() { super('FormatResponse'); }

    prep(shared) { return shared.llmResult; }

    async exec(llmResult) {
        let html = llmResult.response
            // Code blocks
            .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
            // Inline code
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            // Bold
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            // Paragraphs
            .replace(/\n\n/g, '</p><p>');

        return { html: `<p>${html}</p>`, isError: false };
    }

    post(shared, prepResult, execResult) {
        shared.formattedResponse = execResult;
        return 'default';
    }
}
```

### Node 5: ErrorHandlerNode
**Purpose:** Graceful fallback when LLM fails

```javascript
class ErrorHandlerNode extends Node {
    constructor() { super('ErrorHandler'); }

    prep(shared) {
        return { error: shared.llmResult?.error, question: shared.question };
    }

    async exec({ error, question }) {
        // Keyword-based fallbacks for common questions
        const fallbacks = {
            'variable': 'A variable stores a value: <code>x = 5</code>',
            'loop': 'A loop repeats code: <code>for i in range(3): print(i)</code>',
            // Add more for your domain...
        };

        const lowerQ = question.toLowerCase();
        for (const [keyword, response] of Object.entries(fallbacks)) {
            if (lowerQ.includes(keyword)) {
                return { html: `<p>${response}</p>`, isError: false };
            }
        }

        return {
            html: `<p>Error: ${error}</p><p>Try refreshing or check your connection.</p>`,
            isError: true
        };
    }

    post(shared, prepResult, execResult) {
        shared.formattedResponse = execResult;
        return 'default';
    }
}
```

---

## 5. WIRING IT ALL TOGETHER

```javascript
function createTutorFlow() {
    // Create nodes
    const getContext = new GetContextNode();
    const buildPrompt = new BuildPromptNode();
    const callLLM = new CallLLMNode();
    const formatResponse = new FormatResponseNode();
    const errorHandler = new ErrorHandlerNode();

    // Create flow starting at getContext
    const flow = new Flow(getContext);

    // Add all nodes
    flow.addNode(getContext)
        .addNode(buildPrompt)
        .addNode(callLLM)
        .addNode(formatResponse)
        .addNode(errorHandler);

    // Connect the graph
    flow.connect(getContext, buildPrompt, 'default');
    flow.connect(buildPrompt, callLLM, 'default');
    flow.connect(callLLM, formatResponse, 'success');  // Happy path
    flow.connect(callLLM, errorHandler, 'error');       // Error path

    return flow;
}

// Main function to ask the tutor
async function askTutor(question) {
    const shared = { question };  // Start with just the question
    const flow = createTutorFlow();
    await flow.run(shared);
    return shared.formattedResponse;  // Return the final HTML
}
```

---

## 6. ADAPTING FOR YOUR DATA

To use this for a different subject (cooking, music, math, etc.):

### Step 1: Change the system prompt in BuildPromptNode

```javascript
// For a COOKING site:
const systemPrompt = `You are a friendly cooking instructor.

CURRENT CONTEXT:
- Recipe they're viewing: ${context.currentRecipe}
- Skill level: ${context.skillLevel}
- Dietary restrictions: ${context.restrictions.join(', ')}

TOPICS:
- Knife skills, heat control, seasoning
- Baking vs roasting vs sauteing
- Food safety

Be encouraging! Cooking mistakes are learning opportunities.`;
```

### Step 2: Change GetContextNode to read YOUR data

```javascript
async exec({ progress, currentPage }) {
    return {
        currentRecipe: this.detectRecipe(currentPage),
        skillLevel: progress.level || 'beginner',
        restrictions: progress.dietary || [],
        completedRecipes: progress.recipes || []
    };
}
```

### Step 3: Change ErrorHandlerNode fallbacks

```javascript
const fallbacks = {
    'salt': 'Add salt gradually and taste as you go. You can always add more!',
    'burn': 'Lower the heat! Most home cooks use too high heat.',
    'knife': 'Curl your fingers like a claw to protect them while cutting.'
};
```

---

## 7. FILE STRUCTURE

```
your-learning-site/
├── index.html          # Main page
├── css/
│   └── styles.css      # Your styles
├── js/
│   ├── tutor-flow.js   # PocketFlow + Nodes (this is the brain)
│   └── tutor-ui.js     # Chat interface controller
└── lessons/
    ├── lesson-1.html
    └── lesson-2.html
```

---

## 8. QUICK REFERENCE

| Component | File | Purpose |
|-----------|------|---------|
| WebLLM Engine | `tutor-flow.js` | Runs LLM in browser |
| PocketFlow | `tutor-flow.js` | Node + Flow classes |
| 5 Nodes | `tutor-flow.js` | GetContext -> BuildPrompt -> CallLLM -> Format/Error |
| Chat UI | `tutor-ui.js` | Open/close panel, send messages, show responses |
| Progress | `localStorage` | User's completed lessons, scores |

---

## 9. THE PATTERN IN ONE SENTENCE

> **PocketFlow connects Nodes that each do ONE thing (prep -> exec -> post), passing a shared store, with actions determining the path through the graph—and WebLLM provides the AI that runs 100% client-side.**

---

## 10. KEY INSIGHTS

**Why this architecture is powerful:**

1. **Separation of concerns** - Each node does exactly one thing
2. **Testable** - You can test each node independently
3. **Extensible** - Add new nodes (logging, caching, A/B testing) by inserting them in the graph
4. **Graceful degradation** - Error node provides fallbacks when LLM fails
5. **Zero cost** - No API fees, no server, just static files

---

## 11. RESOURCES

- [WebLLM Documentation](https://webllm.mlc.ai/)
- [PocketFlow GitHub](https://github.com/The-Pocket/PocketFlow)
- [Llama 3.2 1B Model](https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC)
- [MLC AI Project](https://mlc.ai/)

---

*Built with the Producer Mindset*
