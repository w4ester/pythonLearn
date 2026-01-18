/* ===========================================
   PyLearn - Main Application JavaScript
   Handles: Theme, Progress, Keyboard Shortcuts
   =========================================== */

// ===========================================
// State Management (localStorage)
// ===========================================
const Storage = {
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(`pylearn_${key}`);
            return item ? JSON.parse(item) : defaultValue;
        } catch (e) {
            console.error('Storage get error:', e);
            return defaultValue;
        }
    },
    
    set(key, value) {
        try {
            localStorage.setItem(`pylearn_${key}`, JSON.stringify(value));
        } catch (e) {
            console.error('Storage set error:', e);
        }
    }
};

// ===========================================
// Progress Tracking
// ===========================================
const Progress = {
    // Default progress state
    defaultState: {
        modules: {
            1: { completed: false, quizScore: null },
            2: { completed: false, quizScore: null },
            3: { completed: false, quizScore: null },
            4: { completed: false, quizScore: null },
            5: { completed: false, quizScore: null },
            6: { completed: false, quizScore: null }
        },
        practiceCount: 0,
        notes: {}
    },
    
    // Get current progress
    get() {
        return Storage.get('progress', this.defaultState);
    },
    
    // Save progress
    save(progress) {
        Storage.set('progress', progress);
        this.updateUI();
    },
    
    // Mark module as complete
    completeModule(moduleNum, quizScore = null) {
        const progress = this.get();
        progress.modules[moduleNum] = {
            completed: true,
            quizScore: quizScore
        };
        this.save(progress);
    },
    
    // Increment practice count
    addPractice() {
        const progress = this.get();
        progress.practiceCount++;
        this.save(progress);
    },
    
    // Get stats for display
    getStats() {
        const progress = this.get();
        const modules = Object.values(progress.modules);
        
        const completed = modules.filter(m => m.completed).length;
        const scores = modules.map(m => m.quizScore).filter(s => s !== null);
        const avgScore = scores.length > 0 
            ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
            : null;
        
        return {
            modulesCompleted: completed,
            totalModules: 6,
            averageScore: avgScore,
            practiceCount: progress.practiceCount,
            percentComplete: Math.round((completed / 6) * 100)
        };
    },
    
    // Update the UI with current progress
    updateUI() {
        const stats = this.getStats();
        const progress = this.get();
        
        // Update stat numbers
        const modulesEl = document.getElementById('modules-completed');
        const scoreEl = document.getElementById('quiz-score');
        const practiceEl = document.getElementById('practice-problems');
        const progressTextEl = document.getElementById('progress-text');
        const progressFill = document.querySelector('.progress-fill');
        
        if (modulesEl) modulesEl.textContent = stats.modulesCompleted;
        if (scoreEl) scoreEl.textContent = stats.averageScore !== null ? `${stats.averageScore}%` : '-';
        if (practiceEl) practiceEl.textContent = stats.practiceCount;
        if (progressTextEl) progressTextEl.textContent = `${stats.percentComplete}% Complete`;
        if (progressFill) progressFill.style.width = `${stats.percentComplete}%`;
        
        // Update module status indicators
        for (let i = 1; i <= 6; i++) {
            const statusEl = document.getElementById(`status-${i}`);
            const cardEl = document.querySelector(`.module-card[data-module="${i}"]`);
            
            if (statusEl && progress.modules[i]) {
                if (progress.modules[i].completed) {
                    statusEl.textContent = '✓';
                    statusEl.setAttribute('aria-label', 'Completed');
                    if (cardEl) cardEl.setAttribute('data-completed', 'true');
                } else {
                    statusEl.textContent = '○';
                    statusEl.setAttribute('aria-label', 'Not started');
                }
            }
        }
        
        // Update certification readiness
        const pcepEl = document.getElementById('pcep-readiness');
        const googleEl = document.getElementById('google-readiness');
        if (pcepEl) pcepEl.textContent = `${stats.percentComplete}%`;
        if (googleEl) googleEl.textContent = `${stats.percentComplete}%`;
    }
};

// ===========================================
// Theme Management
// ===========================================
const Theme = {
    init() {
        // Check for saved preference or system preference
        const saved = Storage.get('theme');
        if (saved) {
            this.set(saved);
        } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            this.set('dark');
        }
        
        // Listen for system preference changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!Storage.get('theme')) {
                this.set(e.matches ? 'dark' : 'light');
            }
        });
    },
    
    set(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        Storage.set('theme', theme);
    },
    
    toggle() {
        const current = document.documentElement.getAttribute('data-theme');
        this.set(current === 'dark' ? 'light' : 'dark');
    }
};

// ===========================================
// Modal Management
// ===========================================
const Modal = {
    open(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.setAttribute('aria-hidden', 'false');
            // Trap focus inside modal
            const firstFocusable = modal.querySelector('button, input, a');
            if (firstFocusable) firstFocusable.focus();
        }
    },
    
    close(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.setAttribute('aria-hidden', 'true');
        }
    },
    
    closeAll() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.setAttribute('aria-hidden', 'true');
        });
    }
};

// ===========================================
// Keyboard Shortcuts
// ===========================================
const Keyboard = {
    init() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger when typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                if (e.key === 'Escape') {
                    e.target.blur();
                }
                return;
            }
            
            switch (e.key.toLowerCase()) {
                case 'd':
                    Theme.toggle();
                    break;
                case 't':
                    window.TutorUI?.toggle();
                    break;
                case '?':
                    Modal.open('keyboard-modal');
                    break;
                case 'escape':
                    Modal.closeAll();
                    window.TutorUI?.close();
                    break;
                case '1':
                case '2':
                case '3':
                case '4':
                case '5':
                case '6':
                    const moduleLink = document.querySelector(`.module-card[data-module="${e.key}"] .module-link`);
                    if (moduleLink) moduleLink.click();
                    break;
            }
        });
    }
};

// ===========================================
// Initialize App
// ===========================================
document.addEventListener('DOMContentLoaded', () => {
    // Initialize theme
    Theme.init();
    
    // Initialize keyboard shortcuts
    Keyboard.init();
    
    // Update progress display
    Progress.updateUI();
    
    // Theme toggle button
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => Theme.toggle());
    }
    
    // Keyboard help button
    const keyboardHelp = document.getElementById('keyboard-help');
    if (keyboardHelp) {
        keyboardHelp.addEventListener('click', () => Modal.open('keyboard-modal'));
    }
    
    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) Modal.close(modal.id);
        });
    });
    
    // Close modal on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) Modal.close(modal.id);
        });
    });
    
    // Open tutor buttons
    const openTutorBtn = document.getElementById('open-tutor');
    if (openTutorBtn) {
        openTutorBtn.addEventListener('click', () => window.TutorUI?.open());
    }
    
    console.log('🐍 PyLearn initialized! Press ? for keyboard shortcuts.');
});

// Export for use in other modules
window.PyLearn = {
    Storage,
    Progress,
    Theme,
    Modal
};
