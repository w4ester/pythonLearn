/* ===========================================
   PocketFlow-Style AI Tutor Architecture

   This implements the core patterns from PocketFlow:
   - Graph: Nodes connected by actions
   - Shared Store: State that flows between nodes
   - Nodes: prep() -> exec() -> post()

   ENHANCED with:
   - Multiple LLM backends (WebLLM, Ollama, OpenAI-compatible)
   - Learning modes (Guide/Socratic vs Solution)
   =========================================== */

// ===========================================
// CONFIGURATION
// ===========================================
const TutorConfig = {
    // Current mode: 'guide' (Socratic) or 'solution' (direct answers)
    mode: localStorage.getItem('tutorMode') || 'guide',

    // Current backend: 'webllm', 'ollama', or 'openai'
    backend: localStorage.getItem('tutorBackend') || 'webllm',

    // Backend-specific settings
    backends: {
        webllm: {
            modelId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
            name: 'WebLLM (Browser)',
            description: 'Runs locally in your browser. ~500MB download, works offline after.',
            requiresSetup: false
        },
        ollama: {
            baseUrl: localStorage.getItem('ollamaUrl') || 'http://localhost:11434',
            model: localStorage.getItem('ollamaModel') || 'llama3.2:1b',
            name: 'Ollama (Local)',
            description: 'Connect to Ollama running on your computer.',
            requiresSetup: true
        },
        openai: {
            baseUrl: localStorage.getItem('openaiUrl') || 'http://localhost:8080/v1',
            model: localStorage.getItem('openaiModel') || 'default',
            apiKey: localStorage.getItem('openaiKey') || '',
            name: 'OpenAI-Compatible (MLX/llama.cpp)',
            description: 'Connect to any OpenAI-compatible API (MLX-server, llama.cpp, etc.)',
            requiresSetup: true
        }
    },

    setMode(mode) {
        this.mode = mode;
        localStorage.setItem('tutorMode', mode);
    },

    setBackend(backend) {
        this.backend = backend;
        localStorage.setItem('tutorBackend', backend);
    },

    setBackendConfig(backend, config) {
        Object.assign(this.backends[backend], config);
        if (backend === 'ollama') {
            localStorage.setItem('ollamaUrl', config.baseUrl || this.backends.ollama.baseUrl);
            localStorage.setItem('ollamaModel', config.model || this.backends.ollama.model);
        } else if (backend === 'openai') {
            localStorage.setItem('openaiUrl', config.baseUrl || this.backends.openai.baseUrl);
            localStorage.setItem('openaiModel', config.model || this.backends.openai.model);
            if (config.apiKey) localStorage.setItem('openaiKey', config.apiKey);
        }
    }
};

// ===========================================
// CORE: Node Base Class (from PocketFlow)
// ===========================================
class Node {
    constructor(name) {
        this.name = name;
    }

    prep(shared) {
        return null;
    }

    async exec(prepResult) {
        return null;
    }

    post(shared, prepResult, execResult) {
        return 'default';
    }

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
        this.edges = new Map();
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
                currentNode = null;
            }
        }

        return shared;
    }
}

// ===========================================
// TUTOR NODES
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
        const progress = window.PyLearn?.Progress?.get() || {};
        const currentPage = window.location.pathname;
        return { progress, currentPage };
    }

    async exec({ progress, currentPage }) {
        const moduleMatch = currentPage.match(/module-(\d)/);
        const currentModule = moduleMatch ? parseInt(moduleMatch[1]) : null;

        // Detect AI track pages
        const isAITrack = currentPage.includes('cs50-ai') || currentPage.includes('ai-week-');
        const aiWeekMatch = currentPage.match(/ai-week-(\d)/);
        const currentAIWeek = aiWeekMatch ? parseInt(aiWeekMatch[1]) : null;

        // Detect Python Starter pages
        const isStarterTrack = currentPage.includes('python-starter') || currentPage.includes('starter-');
        const starterProjectMatch = currentPage.match(/starter-([a-z-]+)\.html/);
        const currentStarterProject = starterProjectMatch ? starterProjectMatch[1] : null;

        return {
            currentModule,
            isAITrack,
            currentAIWeek,
            isStarterTrack,
            currentStarterProject,
            completedModules: Object.entries(progress.modules || {})
                .filter(([_, m]) => m.completed)
                .map(([num, _]) => parseInt(num)),
            practiceCount: progress.practiceCount || 0,
            tutorMode: TutorConfig.mode
        };
    }

    post(shared, prepResult, execResult) {
        shared.context = execResult;
        return 'default';
    }
}

/**
 * Node 2: BuildPromptNode
 * Constructs the system prompt based on mode
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
        const isGuideMode = context.tutorMode === 'guide';
        const isAITrack = context.isAITrack;
        const isStarterTrack = context.isStarterTrack;

        // Build context info based on track
        let contextInfo;

        if (isStarterTrack) {
            const projectNames = {
                'mad-libs': 'Mad Libs Generator',
                'guessing-game': 'Number Guessing Game',
                'rps': 'Rock Paper Scissors',
                'calculator': 'Simple Calculator',
                'password': 'Password Generator',
                'ascii-art': 'ASCII Art Maker',
                'adventure': 'Text Adventure Game'
            };
            const currentProjectName = projectNames[context.currentStarterProject] || 'Python Starter Home';

            contextInfo = `
CURRENT CONTEXT:
- User is viewing: ${currentProjectName}
- This is PYTHON STARTER - for complete beginners with ZERO coding experience
- Focus on FUN and IMMEDIATE results, not theory

PYTHON STARTER PROJECTS (in order):
1. Mad Libs Generator - print(), input(), variables, f-strings
2. Number Guessing Game - while loops, if/else, random numbers, comparisons
3. Rock Paper Scissors - if/elif/else chains, game logic, user choices
4. Simple Calculator - functions, def keyword, return values, operators
5. Password Generator - lists, random.choice(), string methods, loops
6. ASCII Art Maker - nested loops, string multiplication, patterns
7. Text Adventure Game - dictionaries, game state, combining everything

KEY TEACHING APPROACH:
- Keep explanations SHORT and SIMPLE (1-2 sentences max)
- Always show WORKING CODE they can run immediately
- Use fun, relatable analogies (boxes for variables, recipes for functions)
- Celebrate small wins ("Nice! You just made Python talk!")
- If they're stuck, suggest running the example first`;
        } else if (isAITrack) {
            contextInfo = `
CURRENT CONTEXT:
- User is viewing: ${context.currentAIWeek !== null ? `CS50 AI Week ${context.currentAIWeek}` : 'CS50 AI Home'}
- This is the ADVANCED AI TRACK (assumes Python fundamentals are complete)

CS50 AI WEEKLY TOPICS FOR REFERENCE:
- Week 0 (Search): DFS, BFS, greedy search, A*, Minimax, Alpha-Beta pruning
  Projects: Degrees (Six Degrees of Kevin Bacon), Tic-Tac-Toe AI
- Week 1 (Knowledge): Propositional logic, inference, knowledge engineering, model checking
  Projects: Knights puzzle, Minesweeper AI
- Week 2 (Uncertainty): Probability, conditional probability, Bayes' Rule, joint probability, Bayesian networks, Markov chains, Hidden Markov Models
  Projects: PageRank, Heredity (genetic inheritance)
- Week 3 (Optimization): Local search, hill climbing, simulated annealing, linear programming, constraint satisfaction problems (CSPs), backtracking, arc consistency
  Projects: Crossword puzzle generator
- Week 4 (Learning): Supervised learning, k-nearest neighbors, perceptrons, SVMs, regression, loss functions, overfitting, regularization, reinforcement learning, Q-learning
  Projects: Shopping (purchase prediction), Nim (RL agent)
- Week 5 (Neural Networks): Activation functions (ReLU, sigmoid), gradient descent, backpropagation, multilayer networks, CNNs, image convolution, pooling, RNNs
  Projects: Traffic sign recognition (CNN)
- Week 6 (Language): NLP, syntax vs semantics, context-free grammars, n-grams, bag of words, TF-IDF, word embeddings, transformers, attention mechanism
  Projects: Parser (CFG), Questions (TF-IDF QA system)

LIBRARIES COMMONLY USED:
- pygame: Game visualizations
- scikit-learn: ML classifiers (k-NN, SVM)
- tensorflow/keras: Neural networks (CNNs, RNNs)
- nltk: NLP tasks (tokenization, parsing)
- PIL/opencv: Image processing`;
        } else {
            contextInfo = `
CURRENT CONTEXT:
- User is viewing: ${context.currentModule ? `Module ${context.currentModule}` : 'Home page'}
- Completed modules: ${context.completedModules.length > 0 ? context.completedModules.join(', ') : 'None yet'}
- Practice problems done: ${context.practiceCount}

MODULE TOPICS FOR REFERENCE:
- Module 1: Variables, data types (int, float, str, bool), basic operators
- Module 2: if/else, for loops, while loops, list comprehensions
- Module 3: Functions, parameters, return values, importing modules
- Module 4: Lists, tuples, dictionaries, sets
- Module 5: File reading/writing, try/except, error handling
- Module 6: Classes, objects, methods, inheritance`;
        }

        // Mode-specific instructions
        const modeInstructions = isGuideMode ? `
YOU ARE IN GUIDE MODE (Socratic Learning):
Your goal is to help the learner discover answers themselves. Follow these rules:

1. NEVER give the full answer immediately
2. Start by asking what they already know or think
3. Give hints and leading questions instead of solutions
4. When they're stuck, break it into smaller steps
5. Celebrate their attempts even if wrong: "Good thinking! Let's adjust..."
6. Ask "What do you think will happen if...?" before showing output
7. If they explicitly say "just tell me" or "I give up", then switch to explaining

Example responses:
- "What do you think a variable is for? Have you seen any examples?"
- "You're close! What if we changed line 3 - what would happen?"
- "Great question! Before I explain, what's your guess?"
- "I see you're working with loops. What pattern do you notice?"

Be encouraging, patient, and make learning feel like a conversation.` : `
YOU ARE IN SOLUTION MODE (Direct Teaching):
The learner wants clear, direct explanations. Follow these rules:

1. Explain concepts clearly and simply, like talking to a smart 12-year-old
2. Always include working code examples
3. Show the expected output
4. Explain WHY things work, not just HOW
5. Keep responses focused (under 200 words unless they ask for more)
6. Use analogies to make concepts stick`;

        const baseRole = isStarterTrack
            ? `You are Sluggy, an enthusiastic and patient coding buddy helping someone write their VERY FIRST Python programs. You make coding feel like play, not work.`
            : isAITrack
            ? `You are Sluggy, a knowledgeable AI tutor helping a Python programmer learn artificial intelligence concepts from CS50 AI.`
            : `You are a friendly Python tutor helping a complete beginner learn programming.`;

        const universalRules = isStarterTrack
            ? `UNIVERSAL RULES:
- NEVER assume any prior coding knowledge - explain EVERYTHING
- Keep responses under 100 words - beginners get overwhelmed easily
- Always end with something they can TRY ("Run the code and see what happens!")
- Use everyday analogies (mailboxes, recipes, lego bricks)
- If they make a typo or small error, gently point it out with the fix
- Celebrate every working piece of code!`
            : isAITrack
            ? `UNIVERSAL RULES:
- Assume the learner knows Python basics (variables, loops, functions, classes)
- Be encouraging - AI concepts can be challenging!
- Use concrete examples and visualizations when explaining algorithms
- When discussing math (probability, calculus), explain intuitively first, then formally
- For projects, guide them toward the CS50 AI approach but encourage experimentation
- If they ask about cutting-edge topics (GPT, diffusion models), acknowledge them but redirect to course fundamentals first`
            : `UNIVERSAL RULES:
- Be encouraging - learning to code is hard!
- Use only concepts from modules they've completed or are currently viewing
- If they ask about advanced topics, acknowledge it and suggest focusing on current material first`;

        const systemPrompt = `${baseRole}
${modeInstructions}
${contextInfo}

${universalRules}`;

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
 * Calls the appropriate LLM backend
 */
class CallLLMNode extends Node {
    constructor() {
        super('CallLLM');
    }

    prep(shared) {
        return shared.prompt;
    }

    async exec({ systemPrompt, userMessage }) {
        const backend = TutorConfig.backend;

        try {
            let response;

            switch (backend) {
                case 'webllm':
                    response = await this.callWebLLM(systemPrompt, userMessage);
                    break;
                case 'ollama':
                    response = await this.callOllama(systemPrompt, userMessage);
                    break;
                case 'openai':
                    response = await this.callOpenAI(systemPrompt, userMessage);
                    break;
                default:
                    throw new Error(`Unknown backend: ${backend}`);
            }

            return { success: true, response };

        } catch (error) {
            console.error('LLM call error:', error);
            return {
                success: false,
                error: error.message || 'Failed to get response from AI'
            };
        }
    }

    async callWebLLM(systemPrompt, userMessage) {
        const engine = window.TutorLLM?.engine;

        if (!engine) {
            throw new Error('WebLLM model not loaded yet. Please wait for it to finish loading.');
        }

        const response = await engine.chat.completions.create({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ],
            temperature: 0.7,
            max_tokens: 500
        });

        return response.choices[0].message.content;
    }

    async callOllama(systemPrompt, userMessage) {
        const config = TutorConfig.backends.ollama;

        const response = await fetch(`${config.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: config.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama error: ${response.status}. Is Ollama running?`);
        }

        const data = await response.json();
        return data.message.content;
    }

    async callOpenAI(systemPrompt, userMessage) {
        const config = TutorConfig.backends.openai;

        const headers = {
            'Content-Type': 'application/json'
        };

        if (config.apiKey) {
            headers['Authorization'] = `Bearer ${config.apiKey}`;
        }

        const response = await fetch(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: config.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.7,
                max_tokens: 500
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.status}. ${errorText}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    post(shared, prepResult, execResult) {
        shared.llmResult = execResult;
        return execResult.success ? 'success' : 'error';
    }
}

/**
 * Node 4: FormatResponseNode
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

        let html = llmResult.response
            .replace(/```python\n([\s\S]*?)```/g, '<pre><code class="language-python">$1</code></pre>')
            .replace(/```\n?([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');

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
 */
class ErrorHandlerNode extends Node {
    constructor() {
        super('ErrorHandler');
    }

    prep(shared) {
        return { error: shared.llmResult?.error, question: shared.question };
    }

    async exec({ error, question }) {
        const fallbackResponses = {
            'variable': 'A <strong>variable</strong> is like a labeled box that stores a value. Example: <code>name = "Python"</code>',
            'loop': 'A <strong>loop</strong> repeats code multiple times. <code>for i in range(3): print(i)</code>',
            'function': 'A <strong>function</strong> is reusable code with a name. <code>def greet(): print("Hello!")</code>',
            'list': 'A <strong>list</strong> holds multiple items: <code>fruits = ["apple", "banana"]</code>',
            'dictionary': 'A <strong>dictionary</strong> stores key-value pairs: <code>person = {"name": "Ada"}</code>',
            'class': 'A <strong>class</strong> is a blueprint for creating objects with shared properties.'
        };

        const lowerQ = question.toLowerCase();
        for (const [keyword, response] of Object.entries(fallbackResponses)) {
            if (lowerQ.includes(keyword)) {
                return {
                    html: `<p>While connecting to the AI, here's a quick answer:</p><p>${response}</p>`,
                    isError: false
                };
            }
        }

        return {
            html: `<p>⚠️ ${error}</p><p>Check your AI backend settings or try a different one.</p>`,
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
    const getContext = new GetContextNode();
    const buildPrompt = new BuildPromptNode();
    const callLLM = new CallLLMNode();
    const formatResponse = new FormatResponseNode();
    const errorHandler = new ErrorHandlerNode();

    const flow = new Flow(getContext);

    flow.addNode(getContext)
        .addNode(buildPrompt)
        .addNode(callLLM)
        .addNode(formatResponse)
        .addNode(errorHandler);

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
            const { CreateMLCEngine } = await import(
                'https://esm.run/@mlc-ai/web-llm'
            );

            const modelId = TutorConfig.backends.webllm.modelId;

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
// BACKEND CONNECTIVITY TEST
// ===========================================
async function testBackend(backend) {
    try {
        if (backend === 'webllm') {
            return { success: true, message: 'WebLLM ready (loads on first use)' };
        }

        if (backend === 'ollama') {
            const config = TutorConfig.backends.ollama;
            const response = await fetch(`${config.baseUrl}/api/tags`);
            if (response.ok) {
                const data = await response.json();
                const models = data.models?.map(m => m.name) || [];
                return {
                    success: true,
                    message: `Connected! Models: ${models.slice(0, 3).join(', ')}${models.length > 3 ? '...' : ''}`
                };
            }
            throw new Error('Cannot connect');
        }

        if (backend === 'openai') {
            const config = TutorConfig.backends.openai;
            const headers = { 'Content-Type': 'application/json' };
            if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

            const response = await fetch(`${config.baseUrl}/models`, { headers });
            if (response.ok) {
                return { success: true, message: 'Connected to API!' };
            }
            throw new Error('Cannot connect');
        }

        return { success: false, message: 'Unknown backend' };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

// ===========================================
// MAIN CHAT FUNCTION
// ===========================================
async function askTutor(question) {
    const shared = { question };
    const flow = createTutorFlow();
    await flow.run(shared);
    return shared.formattedResponse;
}

// Export for use
window.TutorLLM = TutorLLM;
window.TutorConfig = TutorConfig;
window.askTutor = askTutor;
window.testBackend = testBackend;

/* ===========================================
   LEARNING MODES EXPLAINED

   GUIDE MODE (Socratic):
   Learner: "What is a variable?"
   Tutor: "Great question! Before I explain,
          what do you think a variable might
          be used for?"
   -> Encourages active thinking
   -> Builds deeper understanding

   SOLUTION MODE (Direct):
   Learner: "What is a variable?"
   Tutor: "A variable is like a labeled box
          that stores a value: name = 'Python'"
   -> Quick, clear answers
   -> Good when stuck or reviewing

   BACKEND OPTIONS:
   - WebLLM: Runs in browser, ~500MB download
   - Ollama: ollama run llama3.2:1b
   - OpenAI-API: MLX-server, llama.cpp, etc.
   =========================================== */
