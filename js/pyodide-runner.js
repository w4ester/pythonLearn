/* ===========================================
   Pyodide Python Runner
   Run Python code in the browser via WebAssembly
   =========================================== */

const PythonRunner = {
    pyodide: null,
    isLoading: false,
    isReady: false,
    loadingCallbacks: [],

    // Initialize Pyodide
    async init() {
        if (this.isReady) return this.pyodide;
        if (this.isLoading) {
            // Wait for existing load to complete
            return new Promise((resolve) => {
                this.loadingCallbacks.push(resolve);
            });
        }

        this.isLoading = true;
        console.log('Loading Pyodide...');

        try {
            // Load Pyodide from CDN
            this.pyodide = await loadPyodide({
                indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/'
            });

            this.isReady = true;
            this.isLoading = false;
            console.log('Pyodide loaded successfully');

            // Resolve any waiting callbacks
            this.loadingCallbacks.forEach(cb => cb(this.pyodide));
            this.loadingCallbacks = [];

            return this.pyodide;
        } catch (error) {
            this.isLoading = false;
            console.error('Failed to load Pyodide:', error);
            throw error;
        }
    },

    // Run Python code and return output
    async runCode(code) {
        if (!this.isReady) {
            await this.init();
        }

        // Capture stdout/stderr
        let output = '';
        this.pyodide.setStdout({
            batched: (text) => { output += text + '\n'; }
        });
        this.pyodide.setStderr({
            batched: (text) => { output += 'Error: ' + text + '\n'; }
        });

        try {
            const result = await this.pyodide.runPythonAsync(code);

            // If there's a return value and no print output, show the return value
            if (result !== undefined && result !== null && output.trim() === '') {
                output = String(result);
            }

            return { success: true, output: output.trim() || '(No output)' };
        } catch (error) {
            return { success: false, output: error.message };
        }
    }
};

// Add "Run" buttons to code blocks
function initPythonRunners() {
    document.querySelectorAll('.code-container').forEach(container => {
        const codeBlock = container.querySelector('pre code.language-python');
        if (!codeBlock) return;

        // Check if run button already exists
        if (container.querySelector('.run-btn')) return;

        // Create run button
        const runBtn = document.createElement('button');
        runBtn.className = 'run-btn';
        runBtn.textContent = 'Run';
        runBtn.title = 'Run this Python code';
        runBtn.addEventListener('click', () => runPythonCode(container));

        // Add button after explain button or at start
        const explainBtn = container.querySelector('.explain-btn');
        if (explainBtn) {
            explainBtn.insertAdjacentElement('afterend', runBtn);
        } else {
            container.insertBefore(runBtn, container.firstChild);
        }

        // Create output area
        const outputArea = document.createElement('div');
        outputArea.className = 'code-output hidden';
        container.appendChild(outputArea);
    });
}

// Run Python code from a code block
async function runPythonCode(container) {
    const codeBlock = container.querySelector('pre code');
    const runBtn = container.querySelector('.run-btn');
    const outputArea = container.querySelector('.code-output');

    if (!codeBlock || !outputArea) return;

    // Get the code text
    const code = codeBlock.textContent;

    // Show loading state
    runBtn.disabled = true;
    runBtn.textContent = 'Loading...';
    outputArea.classList.remove('hidden');
    outputArea.textContent = 'Loading Python runtime...';
    outputArea.className = 'code-output loading';

    try {
        const result = await PythonRunner.runCode(code);

        outputArea.textContent = result.output;
        outputArea.className = 'code-output ' + (result.success ? 'success' : 'error');
    } catch (error) {
        outputArea.textContent = 'Failed to run: ' + error.message;
        outputArea.className = 'code-output error';
    }

    runBtn.disabled = false;
    runBtn.textContent = 'Run';
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initPythonRunners);

// Export for global access
window.PythonRunner = PythonRunner;
window.runPythonCode = runPythonCode;
