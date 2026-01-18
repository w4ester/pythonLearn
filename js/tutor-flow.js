/* ===========================================
   PocketFlow-Style AI Tutor Architecture
   
   This implements the core patterns from PocketFlow:
   - Graph: Nodes connected by actions
   - Shared Store: State that flows between nodes
   - Nodes: prep() -> exec() -> post()
   
   The magic of PocketFlow in ~100 lines:
   Graph + Shared Store = LLM Framework
   =========================================== */

// ===========================================
// CORE: Node Base Class (from PocketFlow)
// ===========================================
class Node {
    constructor(name) {
        this.name = name;
    }
    
    // Prepare data from shared store
    prep(shared) {
        return null;
    }
    
    // Execute the node's task
    async exec(prepResult) {
        return null;
    }
    
    // Post-process and update shared store
    // Returns the next action (edge) to follow
    post(shared, prepResult, execResult) {
        return 'default';
    }
    
    // Run the full node cycle
    async run(shared) {
        const prepResult = this.prep(shared);
        const execResult = await this.exec(prepResult);
        return this.post(shared, prepResult, execResult);
    }
}

// ===========================================
// CORE: Flow Class (from PocketFlow)
// ===========================================
class Flow {
    constructor(startNode) {
        this.startNode = startNode;
        this.nodes = new Map();
        this.edges = new Map(); // node -> { action: nextNode }
    }
    
    // Add a node to the flow
    addNode(node) {
        this.nodes.set(node.name, node);
        return this;
    }
    
    // Connect nodes with an action (edge)
    connect(fromNode, toNode, action = 'default') {
        const from = fromNode.name;
        if (!this.edges.has(from)) {
            this.edges.set(from, {});
        }
        this.edges.get(from)[action] = toNode.name;
        return this;
    }
    
    // Run the flow
    async run(shared) {
        let currentNode = this.startNode;
        
        while (currentNode) {
            const node = this.nodes.get(currentNode.name) || currentNode;
            const action = await node.run(shared);
            
            // Get next node from edges
            const nodeEdges = this.edges.get(node.name);
            if (nodeEdges && nodeEdges[action]) {
                currentNode = this.nodes.get(nodeEdges[action]);
            } else {
                currentNode = null; // End of flow
            }
        }
        
        return shared;
    }
}

// ===========================================
// TUTOR NODES: Implementing the Python Tutor
// ===========================================

/**
 * Node 1: GetContextNode
 * Gathers context about the user's current state
 */
class GetContextNode extends Node {
    constructor() {
        super('GetContext');
    }
    
    prep(shared) {
        // Get user's progress from app state
        const progress = window.PyLearn?.Progress?.get() || {};
        const currentPage = window.location.pathname;
        
        return { progress, currentPage };
    }
    
    async exec({ progress, currentPage }) {
        // Determine current module from URL
        const moduleMatch = currentPage.match(/module-(\d)/);
        const currentModule = moduleMatch ? parseInt(moduleMatch[1]) : null;
        
        // Build context object
        return {
            currentModule,
            completedModules: Object.entries(progress.modules || {})
                .filter(([_, m]) => m.completed)
                .map(([num, _]) => parseInt(num)),
            practiceCount: progress.practiceCount || 0
        };
    }
    
    post(shared, prepResult, execResult) {
        shared.context = execResult;
        return 'default';
    }
}

/**
 * Node 2: BuildPromptNode
 * Constructs the system prompt with context
 */
class BuildPromptNode extends Node {
    constructor() {
        super('BuildPrompt');
    }
    
    prep(shared) {
        return {
            question: shared.question,
            context: shared.context
        };
    }
    
    async exec({ question, context }) {
        // System prompt that makes the tutor helpful
        const systemPrompt = `You are a friendly Python tutor helping a complete beginner learn programming.

CURRENT CONTEXT:
- User is viewing: ${context.currentModule ? `Module ${context.currentModule}` : 'Home page'}
- Completed modules: ${context.completedModules.length > 0 ? context.completedModules.join(', ') : 'None yet'}
- Practice problems done: ${context.practiceCount}

YOUR RULES:
1. Explain concepts simply, like you're talking to a smart 12-year-old
2. Always include a small code example when relevant
3. Keep responses SHORT (under 150 words unless they ask for more detail)
4. Be encouraging - learning to code is hard!
5. If they ask to be quizzed, give ONE question and wait for their answer
6. Use concepts only from modules they've completed or are currently viewing

MODULE TOPICS FOR REFERENCE:
- Module 1: Variables, data types (int, float, str, bool), basic operators
- Module 2: if/else, for loops, while loops, list comprehensions
- Module 3: Functions, parameters, return values, importing modules
- Module 4: Lists, tuples, dictionaries, sets
- Module 5: File reading/writing, try/except, error handling
- Module 6: Classes, objects, methods, inheritance

If they haven't completed a module, don't use concepts from it unless explaining what they'll learn.`;

        return {
            systemPrompt,
            userMessage: question
        };
    }
    
    post(shared, prepResult, execResult) {
        shared.prompt = execResult;
        return 'default';
    }
}

/**
 * Node 3: CallLLMNode
 * Calls the WebLLM model running in the browser
 */
class CallLLMNode extends Node {
    constructor() {
        super('CallLLM');
    }
    
    prep(shared) {
        return shared.prompt;
    }
    
    async exec({ systemPrompt, userMessage }) {
        // Get the LLM engine from global state
        const engine = window.TutorLLM?.engine;
        
        if (!engine) {
            return {
                success: false,
                error: 'Model not loaded yet. Please wait for the model to finish loading.'
            };
        }
        
        try {
            // Call the model
            const response = await engine.chat.completions.create({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.7,
                max_tokens: 500
            });
            
            return {
                success: true,
                response: response.choices[0].message.content
            };
        } catch (error) {
            console.error('LLM call error:', error);
            return {
                success: false,
                error: error.message || 'Failed to get response from AI'
            };
        }
    }
    
    post(shared, prepResult, execResult) {
        shared.llmResult = execResult;
        return execResult.success ? 'success' : 'error';
    }
}

/**
 * Node 4: FormatResponseNode
 * Formats the LLM response for display
 */
class FormatResponseNode extends Node {
    constructor() {
        super('FormatResponse');
    }
    
    prep(shared) {
        return shared.llmResult;
    }
    
    async exec(llmResult) {
        if (!llmResult.success) {
            return {
                html: `<p>⚠️ ${llmResult.error}</p>`,
                isError: true
            };
        }
        
        // Convert markdown-style code blocks to HTML
        let html = llmResult.response
            // Code blocks
            .replace(/```python\n([\s\S]*?)```/g, '<pre><code class="language-python">$1</code></pre>')
            .replace(/```\n?([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            // Inline code
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            // Bold
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            // Line breaks
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');
        
        // Wrap in paragraph if needed
        if (!html.startsWith('<')) {
            html = `<p>${html}</p>`;
        }
        
        return { html, isError: false };
    }
    
    post(shared, prepResult, execResult) {
        shared.formattedResponse = execResult;
        return 'default';
    }
}

/**
 * Node 5: ErrorHandlerNode
 * Provides helpful fallback when LLM fails
 */
class ErrorHandlerNode extends Node {
    constructor() {
        super('ErrorHandler');
    }
    
    prep(shared) {
        return { error: shared.llmResult?.error, question: shared.question };
    }
    
    async exec({ error, question }) {
        // Provide a helpful fallback response
        const fallbackResponses = {
            'variable': 'A <strong>variable</strong> is like a labeled box that stores a value. Example: <code>name = "Python"</code> creates a box labeled "name" containing the text "Python".',
            'loop': 'A <strong>loop</strong> repeats code multiple times. <code>for i in range(3): print(i)</code> prints 0, 1, 2.',
            'function': 'A <strong>function</strong> is reusable code with a name. <code>def greet(): print("Hello!")</code> then call it with <code>greet()</code>',
            'list': 'A <strong>list</strong> holds multiple items in order: <code>fruits = ["apple", "banana", "cherry"]</code>',
            'dictionary': 'A <strong>dictionary</strong> stores key-value pairs: <code>person = {"name": "Ada", "age": 25}</code>',
            'class': 'A <strong>class</strong> is a blueprint for creating objects with shared properties and behaviors.'
        };
        
        // Check if question matches any fallback
        const lowerQ = question.toLowerCase();
        for (const [keyword, response] of Object.entries(fallbackResponses)) {
            if (lowerQ.includes(keyword)) {
                return {
                    html: `<p>While the AI loads, here's a quick answer:</p><p>${response}</p>`,
                    isError: false
                };
            }
        }
        
        return {
            html: `<p>⚠️ ${error}</p><p>The AI model is still loading. Try again in a moment, or check out the module content directly!</p>`,
            isError: true
        };
    }
    
    post(shared, prepResult, execResult) {
        shared.formattedResponse = execResult;
        return 'default';
    }
}

// ===========================================
// BUILD THE FLOW
// ===========================================
function createTutorFlow() {
    // Create nodes
    const getContext = new GetContextNode();
    const buildPrompt = new BuildPromptNode();
    const callLLM = new CallLLMNode();
    const formatResponse = new FormatResponseNode();
    const errorHandler = new ErrorHandlerNode();
    
    // Build the flow
    const flow = new Flow(getContext);
    
    flow.addNode(getContext)
        .addNode(buildPrompt)
        .addNode(callLLM)
        .addNode(formatResponse)
        .addNode(errorHandler);
    
    // Connect nodes
    flow.connect(getContext, buildPrompt, 'default');
    flow.connect(buildPrompt, callLLM, 'default');
    flow.connect(callLLM, formatResponse, 'success');
    flow.connect(callLLM, errorHandler, 'error');
    
    return flow;
}

// ===========================================
// WEBLLM INITIALIZATION
// ===========================================
const TutorLLM = {
    engine: null,
    isLoading: false,
    isReady: false,
    
    async init(onProgress) {
        if (this.isLoading || this.isReady) return;
        this.isLoading = true;
        
        try {
            // Import WebLLM from CDN
            const { CreateMLCEngine } = await import(
                'https://esm.run/@mlc-ai/web-llm'
            );
            
            // Use a small, fast model
            // Phi-3-mini or Llama-3.2-1B are good choices
            const modelId = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
            
            // Create engine with progress callback
            this.engine = await CreateMLCEngine(modelId, {
                initProgressCallback: (progress) => {
                    if (onProgress) {
                        onProgress({
                            text: progress.text,
                            progress: progress.progress
                        });
                    }
                }
            });
            
            this.isReady = true;
            this.isLoading = false;
            console.log('🤖 WebLLM model loaded successfully!');
            
        } catch (error) {
            console.error('WebLLM init error:', error);
            this.isLoading = false;
            throw error;
        }
    }
};

// ===========================================
// MAIN CHAT FUNCTION
// ===========================================
async function askTutor(question) {
    // Create shared store
    const shared = {
        question: question
    };
    
    // Create and run the flow
    const flow = createTutorFlow();
    await flow.run(shared);
    
    // Return the formatted response
    return shared.formattedResponse;
}

// Export for use
window.TutorLLM = TutorLLM;
window.askTutor = askTutor;

/* ===========================================
   FLOW VISUALIZATION
   
   Here's how the tutor flow works:
   
   ┌─────────────────┐
   │  GetContext     │ ← Reads user progress & current page
   └────────┬────────┘
            │
            ▼
   ┌─────────────────┐
   │  BuildPrompt    │ ← Constructs system prompt with context
   └────────┬────────┘
            │
            ▼
   ┌─────────────────┐
   │   CallLLM       │ ← Calls WebLLM (runs in browser!)
   └────────┬────────┘
            │
       ┌────┴────┐
       │         │
    success    error
       │         │
       ▼         ▼
   ┌────────┐ ┌────────────┐
   │ Format │ │ ErrorHandler│
   └────────┘ └────────────┘
            │
            ▼
      [Display Response]
   
   This is the same pattern used in production
   AI apps - just simplified to learn from!
   =========================================== */
