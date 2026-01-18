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
            this.addMessage('bot', `<p>⚠️ Error: ${error.message}</p>`, true);
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
        
        if (isHTML) {
            div.innerHTML = content;
        } else {
            div.innerHTML = `<p>${this.escapeHTML(content)}</p>`;
        }
        
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
        div.innerHTML = '<span></span><span></span><span></span>';
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
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    TutorUI.init();
});

// Export for global access
window.TutorUI = TutorUI;
