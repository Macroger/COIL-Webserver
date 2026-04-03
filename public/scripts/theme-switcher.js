/* Theme switcher: applies theme and persists selection in localStorage */
(function () {
    const STORAGE_KEY = 'site_theme';

    function applyTheme(name) {
        if (!name || name === 'default') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', name);
        }
        try { localStorage.setItem(STORAGE_KEY, name || 'default'); } catch (e) {}
        const sel = document.getElementById('themePicker');
        if (sel) sel.value = name || 'default';
    }

    function init() {
        const sel = document.getElementById('themePicker');
        const saved = (function(){ try { return localStorage.getItem(STORAGE_KEY); } catch(e){ return null; } })() || 'default';
        applyTheme(saved);
        if (sel) {
            sel.addEventListener('change', (e) => applyTheme(e.target.value));
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else init();
})();
