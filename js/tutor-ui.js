/* ===========================================
   AI Tutor UI Controller
   Handles chat interface interactions
   =========================================== */

const TutorUI = {
    panel: null,
    fab: null,
    messages: null,
    form: null,
    input: null,
    submitBtn: null,
    loadingEl: null,
    loadingText: null,
    loadingBar: null,
    statusDot: null,
    statusText: null,
    isOpen: false,
    settingsOpen: false,
    
    // Initialize the UI
    init() {
        // Get DOM elements
        this.panel = document.getElementById('tutor-panel');
        this.fab = document.getElementById('tutor-fab');
        this.messages = document.getElementById('tutor-messages');
        this.form = document.getElementById('tutor-form');
        this.input = document.getElementById('tutor-input');
        this.submitBtn = document.getElementById('tutor-submit');
        this.loadingEl = document.getElementById('model-loading');
        this.loadingText = document.getElementById('loading-text');
        this.loadingBar = document.getElementById('loading-bar');
        this.statusDot = document.querySelector('.status-dot');
        this.statusText = document.querySelector('.status-text');
        
        if (!this.panel) return;

        // Bind events
        this.bindEvents();

        // Initialize settings panel
        this.initSettings();

        console.log('🤖 Tutor UI initialized');
    },
    
    bindEvents() {
        // FAB click
        this.fab?.addEventListener('click', () => this.open());
        
        // Close button
        document.getElementById('close-tutor')?.addEventListener('click', () => this.close());
        
        // Form submit
        this.form?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendMessage();
        });
        
        // Click outside to close (optional)
        document.addEventListener('click', (e) => {
            if (this.isOpen && 
                !this.panel.contains(e.target) && 
                !this.fab.contains(e.target) &&
                !e.target.closest('#open-tutor')) {
                // Don't close on outside click - can be annoying
                // this.close();
            }
        });
    },
    
    // Open the chat panel
    async open() {
        this.panel.setAttribute('aria-hidden', 'false');
        this.fab.setAttribute('aria-expanded', 'true');
        this.isOpen = true;
        
        // Focus input
        setTimeout(() => this.input?.focus(), 100);
        
        // Start loading model if not already
        if (!window.TutorLLM.isReady && !window.TutorLLM.isLoading) {
            this.loadModel();
        }
    },
    
    // Close the chat panel
    close() {
        this.panel.setAttribute('aria-hidden', 'true');
        this.fab.setAttribute('aria-expanded', 'false');
        this.isOpen = false;
    },
    
    // Toggle open/close
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    },
    
    // Load the WebLLM model
    async loadModel() {
        this.loadingEl?.classList.remove('hidden');
        this.updateStatus('loading', 'Loading model...');
        
        try {
            await window.TutorLLM.init((progress) => {
                // Update loading UI
                if (this.loadingText) {
                    this.loadingText.textContent = progress.text || 'Loading...';
                }
                if (this.loadingBar && progress.progress !== undefined) {
                    this.loadingBar.style.width = `${progress.progress * 100}%`;
                }
            });
            
            // Model loaded successfully
            this.loadingEl?.classList.add('hidden');
            this.input.disabled = false;
            this.submitBtn.disabled = false;
            this.input.placeholder = 'Ask about Python...';
            this.updateStatus('ready', 'Ready');
            
            // Add success message
            this.addMessage('bot', '✅ AI model loaded! Ask me anything about Python.');
            
        } catch (error) {
            console.error('Model load error:', error);
            this.updateStatus('error', 'Load failed');
            this.loadingText.textContent = `Error: ${error.message}. Try refreshing.`;
            
            // Still enable input for fallback responses
            this.input.disabled = false;
            this.submitBtn.disabled = false;
            this.input.placeholder = 'Ask about Python (limited mode)...';
        }
    },
    
    // Update status indicator
    updateStatus(state, text) {
        if (this.statusDot) {
            this.statusDot.className = 'status-dot';
            if (state === 'ready') this.statusDot.classList.add('ready');
            if (state === 'error') this.statusDot.classList.add('error');
        }
        if (this.statusText) {
            this.statusText.textContent = text;
        }
    },
    
    // Send a message
    async sendMessage() {
        const question = this.input?.value.trim();
        if (!question) return;
        
        // Clear input
        this.input.value = '';
        
        // Add user message
        this.addMessage('user', question);
        
        // Show typing indicator
        const typingId = this.showTyping();
        
        // Disable input while processing
        this.input.disabled = true;
        this.submitBtn.disabled = true;
        
        try {
            // Call the tutor flow
            const response = await window.askTutor(question);
            
            // Remove typing indicator
            this.hideTyping(typingId);
            
            // Add bot response
            this.addMessage('bot', response.html, true);
            
        } catch (error) {
            this.hideTyping(typingId);
            this.addMessage('bot', 'Error: ' + error.message);
        }
        
        // Re-enable input
        this.input.disabled = false;
        this.submitBtn.disabled = false;
        this.input.focus();
    },
    
    // Add a message to the chat
    addMessage(type, content, isHTML = false) {
        const div = document.createElement('div');
        div.className = `message ${type}-message`;

        // Add Sluggy avatar for bot messages
        if (type === 'bot') {
            const avatar = document.createElement('img');
            avatar.className = 'sluggy-avatar';
            avatar.alt = 'Sluggy';
            // Detect if we're in a subdirectory
            avatar.src = window.location.pathname.includes('/modules/') ? '../sluggy.png' : 'sluggy.png';
            div.appendChild(avatar);
        }

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'message-content';

        if (isHTML) {
            // Parse HTML safely using DOMParser
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/html');
            // Move parsed nodes to our div
            Array.from(doc.body.childNodes).forEach(node => {
                contentWrapper.appendChild(node.cloneNode(true));
            });
        } else {
            const p = document.createElement('p');
            p.textContent = content;
            contentWrapper.appendChild(p);
        }

        div.appendChild(contentWrapper);
        this.messages?.appendChild(div);

        // Scroll to bottom
        this.messages.scrollTop = this.messages.scrollHeight;

        // Highlight any code blocks
        div.querySelectorAll('pre code').forEach(block => {
            if (window.Prism) {
                Prism.highlightElement(block);
            }
        });
    },
    
    // Show typing indicator
    showTyping() {
        const id = 'typing-' + Date.now();
        const div = document.createElement('div');
        div.id = id;
        div.className = 'typing-indicator';
        // Use DOM methods instead of innerHTML
        for (let i = 0; i < 3; i++) {
            div.appendChild(document.createElement('span'));
        }
        div.setAttribute('aria-label', 'Tutor is typing');
        this.messages?.appendChild(div);
        this.messages.scrollTop = this.messages.scrollHeight;
        return id;
    },
    
    // Hide typing indicator
    hideTyping(id) {
        document.getElementById(id)?.remove();
    },
    
    // Escape HTML to prevent XSS
    escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },
    
    // Ask about specific code (called from "Explain This" buttons)
    askAboutCode(code) {
        this.open();
        setTimeout(() => {
            this.input.value = `Can you explain this code step by step?\n\n${code}`;
            this.sendMessage();
        }, 300);
    },

    // Toggle settings panel
    toggleSettings() {
        this.settingsOpen = !this.settingsOpen;
        const settingsPanel = document.getElementById('tutor-settings');
        if (settingsPanel) {
            settingsPanel.classList.toggle('hidden', !this.settingsOpen);
        }
    },

    // Initialize settings panel
    initSettings() {
        const tutorHeader = this.panel?.querySelector('.tutor-header');
        if (!tutorHeader) return;

        // Add settings button
        const settingsBtn = document.createElement('button');
        settingsBtn.id = 'tutor-settings-btn';
        settingsBtn.className = 'tutor-settings-btn';
        settingsBtn.textContent = '\u2699\uFE0F';
        settingsBtn.title = 'Tutor Settings';
        settingsBtn.addEventListener('click', () => this.toggleSettings());

        const closeBtn = tutorHeader.querySelector('.tutor-close');
        tutorHeader.insertBefore(settingsBtn, closeBtn);

        // Create settings panel
        const settingsPanel = document.createElement('div');
        settingsPanel.id = 'tutor-settings';
        settingsPanel.className = 'tutor-settings hidden';
        this.populateSettingsPanel(settingsPanel);
        tutorHeader.insertAdjacentElement('afterend', settingsPanel);

        this.bindSettingsEvents();
        this.updateModeIndicator();
    },

    // Populate settings panel with controls
    populateSettingsPanel(panel) {
        const config = window.TutorConfig;
        if (!config) return;

        // Title
        const title = document.createElement('h3');
        title.textContent = 'Tutor Settings';
        panel.appendChild(title);

        // Mode section
        const modeGroup = document.createElement('div');
        modeGroup.className = 'setting-group';

        const modeLabel = document.createElement('label');
        modeLabel.textContent = 'Learning Mode';
        modeGroup.appendChild(modeLabel);

        const modeToggle = document.createElement('div');
        modeToggle.className = 'mode-toggle';

        ['guide', 'solution'].forEach(mode => {
            const btn = document.createElement('button');
            btn.className = 'mode-btn' + (config.mode === mode ? ' active' : '');
            btn.dataset.mode = mode;
            const strong = document.createElement('strong');
            strong.textContent = mode === 'guide' ? 'Guide Mode' : 'Solution Mode';
            const small = document.createElement('small');
            small.textContent = mode === 'guide' ? 'Socratic - asks questions to help you discover' : 'Direct explanations with code examples';
            btn.appendChild(strong);
            btn.appendChild(document.createElement('br'));
            btn.appendChild(small);
            modeToggle.appendChild(btn);
        });
        modeGroup.appendChild(modeToggle);
        panel.appendChild(modeGroup);

        // Backend section
        const backendGroup = document.createElement('div');
        backendGroup.className = 'setting-group';

        const backendLabel = document.createElement('label');
        backendLabel.textContent = 'AI Backend';
        backendGroup.appendChild(backendLabel);

        const backendOptions = document.createElement('div');
        backendOptions.className = 'backend-options';

        const backends = [
            { value: 'webllm', name: 'WebLLM (Browser)', desc: '~500MB download, works offline' },
            { value: 'ollama', name: 'Ollama (Local)', desc: 'Requires Ollama running locally' },
            { value: 'openai', name: 'OpenAI-Compatible', desc: 'MLX, llama.cpp, or any compatible API' }
        ];

        backends.forEach(b => {
            const label = document.createElement('label');
            label.className = 'backend-option';
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'backend';
            radio.value = b.value;
            radio.checked = config.backend === b.value;
            const span = document.createElement('span');
            span.className = 'backend-info';
            const strong = document.createElement('strong');
            strong.textContent = b.name;
            const small = document.createElement('small');
            small.textContent = b.desc;
            span.appendChild(strong);
            span.appendChild(document.createElement('br'));
            span.appendChild(small);
            label.appendChild(radio);
            label.appendChild(span);
            backendOptions.appendChild(label);
        });
        backendGroup.appendChild(backendOptions);
        panel.appendChild(backendGroup);

        // Backend config section
        const configSection = document.createElement('div');
        configSection.id = 'backend-config';
        configSection.className = 'backend-config' + (config.backend === 'webllm' ? ' hidden' : '');

        // Ollama fields
        const ollamaFields = document.createElement('div');
        ollamaFields.className = 'config-fields ollama-fields' + (config.backend !== 'ollama' ? ' hidden' : '');
        this.addConfigField(ollamaFields, 'ollama-url', 'Ollama URL', config.backends.ollama.baseUrl, 'http://localhost:11434');
        this.addConfigField(ollamaFields, 'ollama-model', 'Model', config.backends.ollama.model, 'llama3.2:1b');
        configSection.appendChild(ollamaFields);

        // OpenAI fields
        const openaiFields = document.createElement('div');
        openaiFields.className = 'config-fields openai-fields' + (config.backend !== 'openai' ? ' hidden' : '');
        this.addConfigField(openaiFields, 'openai-url', 'API URL', config.backends.openai.baseUrl, 'http://localhost:8080/v1');
        this.addConfigField(openaiFields, 'openai-model', 'Model', config.backends.openai.model, 'default');
        this.addConfigField(openaiFields, 'openai-key', 'API Key (optional)', config.backends.openai.apiKey, 'sk-...', 'password');
        configSection.appendChild(openaiFields);

        // Test button
        const testBtn = document.createElement('button');
        testBtn.id = 'test-backend';
        testBtn.className = 'btn-test';
        testBtn.textContent = 'Test Connection';
        configSection.appendChild(testBtn);

        const testResult = document.createElement('span');
        testResult.id = 'test-result';
        configSection.appendChild(testResult);

        panel.appendChild(configSection);
    },

    // Helper to add config input field
    addConfigField(container, id, labelText, value, placeholder, type = 'text') {
        const label = document.createElement('label');
        label.textContent = labelText;
        const input = document.createElement('input');
        input.type = type;
        input.id = id;
        input.value = value || '';
        input.placeholder = placeholder;
        label.appendChild(input);
        container.appendChild(label);
    },

    // Bind settings panel events
    bindSettingsEvents() {
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                window.TutorConfig?.setMode(mode);
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.updateModeIndicator();
                this.addMessage('bot', 'Switched to ' + (mode === 'guide' ? 'Guide' : 'Solution') + ' mode.');
            });
        });

        document.querySelectorAll('input[name="backend"]').forEach(radio => {
            radio.addEventListener('change', () => {
                const backend = radio.value;
                window.TutorConfig?.setBackend(backend);

                const configEl = document.getElementById('backend-config');
                configEl?.classList.toggle('hidden', backend === 'webllm');

                document.querySelector('.ollama-fields')?.classList.toggle('hidden', backend !== 'ollama');
                document.querySelector('.openai-fields')?.classList.toggle('hidden', backend !== 'openai');

                if (backend !== 'webllm') {
                    window.TutorLLM.isReady = false;
                    window.TutorLLM.engine = null;
                }
            });
        });

        document.getElementById('test-backend')?.addEventListener('click', async () => {
            const resultEl = document.getElementById('test-result');
            resultEl.textContent = 'Testing...';
            this.saveBackendConfig();
            const result = await window.testBackend?.(window.TutorConfig.backend);
            resultEl.textContent = result?.message || 'Unknown result';
            resultEl.className = result?.success ? 'success' : 'error';
        });

        ['ollama-url', 'ollama-model', 'openai-url', 'openai-model', 'openai-key'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', () => this.saveBackendConfig());
        });
    },

    saveBackendConfig() {
        const config = window.TutorConfig;
        if (!config) return;

        config.setBackendConfig('ollama', {
            baseUrl: document.getElementById('ollama-url')?.value,
            model: document.getElementById('ollama-model')?.value
        });

        config.setBackendConfig('openai', {
            baseUrl: document.getElementById('openai-url')?.value,
            model: document.getElementById('openai-model')?.value,
            apiKey: document.getElementById('openai-key')?.value
        });
    },

    updateModeIndicator() {
        const mode = window.TutorConfig?.mode || 'guide';
        const statusText = this.statusText;
        if (statusText && window.TutorLLM?.isReady) {
            statusText.textContent = 'Ready (' + (mode === 'guide' ? 'Guide' : 'Solution') + ')';
        }
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    TutorUI.init();
});

// Export for global access
window.TutorUI = TutorUI;
