/**
 * SN Utils Theme Toggle Utility
 * Provides consistent dark/light theme switching across all extension pages
 * Uses chrome.storage.local to share theme setting with popup
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'snusettings';
    const THEME_PROPERTY = 'extensiontheme';
    
    /**
     * Get the effective theme based on setting and system preference
     * @param {string} themeSetting - 'system', 'light', or 'dark'
     * @returns {string} - 'light' or 'dark'
     */
    function getEffectiveTheme(themeSetting) {
        if (themeSetting === 'system') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return themeSetting || 'light';
    }

    /**
     * Get the current theme setting from chrome.storage
     * @param {function} callback - Called with theme setting ('system', 'light', or 'dark')
     */
    function getStoredTheme(callback) {
        if (chrome && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(STORAGE_KEY, function(result) {
                const settings = result[STORAGE_KEY] || {};
                const themeSetting = settings[THEME_PROPERTY] || 'system';
                callback(themeSetting);
            });
        } else {
            // Fallback to localStorage for non-extension contexts
            try {
                const theme = localStorage.getItem('snutils-theme') || 'system';
                callback(theme);
            } catch (e) {
                callback('system');
            }
        }
    }

    /**
     * Save theme preference to chrome.storage
     * @param {string} themeSetting - 'system', 'light', or 'dark'
     */
    function setStoredTheme(themeSetting) {
        if (chrome && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(STORAGE_KEY, function(result) {
                const settings = result[STORAGE_KEY] || {};
                settings[THEME_PROPERTY] = themeSetting;
                chrome.storage.local.set({ [STORAGE_KEY]: settings });
            });
        } else {
            // Fallback to localStorage
            try {
                localStorage.setItem('snutils-theme', themeSetting);
            } catch (e) {
                // Ignore storage errors
            }
        }
    }

    /**
     * Apply theme to document
     * @param {string} theme - 'light' or 'dark'
     */
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        document.body.setAttribute('data-theme', theme);
        
        // Also update Monaco if available
        if (window.monaco && window.monaco.editor) {
            const monacoTheme = theme === 'dark' ? 'vs-dark' : 'vs-light';
            monaco.editor.setTheme(monacoTheme);
        }
    }

    /**
     * Toggle between light and dark themes
     */
    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        applyTheme(newTheme);
        setStoredTheme(newTheme); // Save explicit choice (not 'system')
        
        return newTheme;
    }

    /**
     * Initialize theme on page load
     */
    function initTheme() {
        getStoredTheme(function(themeSetting) {
            const effectiveTheme = getEffectiveTheme(themeSetting);
            applyTheme(effectiveTheme);
        });
    }

    /**
     * Initialize theme toggle button
     * Automatically finds button with id 'theme-toggle-btn'
     */
    function initThemeToggleButton() {
        const toggleBtn = document.getElementById('theme-toggle-btn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function(e) {
                e.preventDefault();
                toggleTheme();
            });
        }
    }

    /**
     * Full initialization - call this on DOMContentLoaded
     */
    function init() {
        initTheme();
        initThemeToggleButton();
        
        // Listen for system theme changes when set to 'system'
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
            getStoredTheme(function(themeSetting) {
                if (themeSetting === 'system') {
                    applyTheme(e.matches ? 'dark' : 'light');
                }
            });
        });
    }

    // Expose to global scope
    window.SNUtilsTheme = {
        init: init,
        initTheme: initTheme,
        initThemeToggleButton: initThemeToggleButton,
        toggleTheme: toggleTheme,
        applyTheme: applyTheme,
        getStoredTheme: getStoredTheme,
        setStoredTheme: setStoredTheme,
        getEffectiveTheme: getEffectiveTheme
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
