/**
 * Custom predictive search for the Stiletto quick search.
 *
 * Shopify's native predictive search (`/search/suggest`) returns nothing for
 * partial Hebrew input, so the quick search dropdown always looked empty. The
 * regular search endpoint *does* match partial Hebrew terms once a trailing
 * wildcard is added, so this queries that instead and renders the results
 * through sections/quick-search-results.liquid via the Section Rendering API.
 *
 * Verified on the live store: `?q=קרי` returns 0 results, `?q=קרי*` returns 61.
 *
 * The theme's own handler lives inside the minified bundle
 * (assets/theme.js -> PredictiveSearch()), so rather than patching the bundle we
 * intercept the `input` and `submit` events during the capture phase on the
 * quick search container and stop them before they reach the theme's listeners.
 */
(function () {
  const SECTION_ID = 'quick-search-results';
  const DEBOUNCE_MS = 250;

  const theme = window.theme || {};

  const selectors = {
    container: '[data-quick-search]',
    form: '[data-quick-search-form]',
    input: '[data-input]',
    clear: '[data-clear]',
    results: '[data-results]',
  };

  const classes = {
    active: 'active',
    visible: 'quick-search--visible',
  };

  const cache = new Map();
  let debounceTimer = null;
  let controller = null;

  /* -------------------------------------------------- helpers */

  function searchBase(form) {
    const action = form && form.getAttribute('action');
    if (action) return action;

    const root = (theme.routes && theme.routes.root) || '/';
    return root.replace(/\/$/, '') + '/search';
  }

  // Trailing wildcard is what makes partial Hebrew terms match.
  function searchUrl(form, term) {
    return searchBase(form) + '?q=' + encodeURIComponent(term) + '*&type=product';
  }

  /* -------------------------------------------------- search */

  async function search(term, form, container, input) {
    const key = term.toLowerCase();

    if (cache.has(key)) {
      container.innerHTML = cache.get(key);
      return;
    }

    if (controller) controller.abort();
    controller = new AbortController();

    let html;

    try {
      const response = await fetch(
        searchUrl(form, term) + '&section_id=' + SECTION_ID,
        { signal: controller.signal }
      );

      if (!response.ok) {
        console.warn('[predictive-search] Request failed:', response.status);
        return;
      }

      html = await response.text();
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.warn('[predictive-search] Request failed:', error);
      }
      return;
    }

    // Bail if the query moved on while we were waiting.
    if (input.value.trim() !== term) return;

    // Section Rendering wraps the section in #shopify-section-<id>; that wrapper
    // would become the only child of the results grid, so unwrap it.
    const section = new DOMParser()
      .parseFromString(html, 'text/html')
      .querySelector('#shopify-section-' + SECTION_ID);

    const markup = section ? section.innerHTML : html;

    cache.set(key, markup);
    container.innerHTML = markup;
  }

  /* -------------------------------------------------- binding */

  function bind(container) {
    if (container.dataset.customPredictiveSearch === 'true') return;
    container.dataset.customPredictiveSearch = 'true';

    const get = (selector) => container.querySelector(selector);

    function cancel() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }

      if (controller) {
        controller.abort();
        controller = null;
      }
    }

    function handleInput(event) {
      const input = get(selectors.input);
      if (!event.target || event.target !== input) return;

      // Stop the event before the theme's own handler (bound on the input)
      // fires and kicks off a native predictive search request.
      event.stopPropagation();

      const form = get(selectors.form);
      const clear = get(selectors.clear);
      const results = get(selectors.results);
      const value = input.value;
      const term = value.trim();

      // Class toggling the theme's handler would have done.
      if (clear) clear.classList.toggle(classes.visible, value !== '');
      if (input.parentNode) input.parentNode.classList.toggle(classes.active, value !== '');
      if (form) form.classList.toggle(classes.active, value !== '');

      cancel();

      if (!results) return;

      if (!term) {
        results.innerHTML = '';
        return;
      }

      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        search(term, form, results, input);
      }, DEBOUNCE_MS);
    }

    function handleSubmit(event) {
      const input = get(selectors.input);
      const term = input ? input.value.trim() : '';

      event.preventDefault();
      event.stopPropagation();

      if (!term) return;

      cancel();
      window.location.href = searchUrl(get(selectors.form), term);
    }

    container.addEventListener('input', handleInput, true);
    container.addEventListener('submit', handleSubmit, true);
    container.addEventListener('click', (event) => {
      if (event.target.closest(selectors.clear)) cancel();
    });
  }

  function init() {
    document.querySelectorAll(selectors.container).forEach(bind);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Theme editor re-renders sections; re-bind anything new.
  document.addEventListener('shopify:section:load', init);
})();
