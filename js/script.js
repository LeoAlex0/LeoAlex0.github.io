;(function () {
  var themeStorageKey = 'theme';
  var languageStorageKey = 'language';
  var defaultLanguage = 'zh-CN';
  var supportedLanguages = ['zh-CN', 'en'];
  var themeMedia = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var languageText = {
    'zh-CN': {
      copy: '复制',
      copied: '已复制',
      failed: '失败',
      copyCode: '复制代码块',
      languageToggle: '切换语言',
      themeDark: '深色',
      themeLight: '浅色',
      themeSwitchDark: '切换到深色模式',
      themeSwitchLight: '切换到浅色模式'
    },
    en: {
      copy: 'Copy',
      copied: 'Copied',
      failed: 'Failed',
      copyCode: 'Copy code block',
      languageToggle: 'Switch language',
      themeDark: 'Dark',
      themeLight: 'Light',
      themeSwitchDark: 'Switch to dark mode',
      themeSwitchLight: 'Switch to light mode'
    }
  };

  function normalizeTheme(theme) {
    return theme === 'dark' || theme === 'light' ? theme : null;
  }

  function readStoredTheme() {
    try {
      return normalizeTheme(window.localStorage.getItem(themeStorageKey));
    } catch (error) {
      return null;
    }
  }

  function preferredTheme() {
    return themeMedia && themeMedia.matches ? 'dark' : 'light';
  }

  function currentTheme() {
    return normalizeTheme(document.documentElement.dataset.theme) || readStoredTheme() || preferredTheme();
  }

  function normalizeLanguage(language) {
    var value = String(language || '').trim().replace('_', '-');
    var lower = value.toLowerCase();

    if (lower === 'zh' || lower === 'zh-cn') {
      return 'zh-CN';
    }

    if (lower === 'en' || lower.indexOf('en-') === 0) {
      return 'en';
    }

    return supportedLanguages.indexOf(value) !== -1 ? value : null;
  }

  function readStoredLanguage() {
    try {
      return normalizeLanguage(window.localStorage.getItem(languageStorageKey));
    } catch (error) {
      return null;
    }
  }

  function currentLanguage() {
    return normalizeLanguage(document.documentElement.dataset.language) ||
      readStoredLanguage() ||
      normalizeLanguage(document.documentElement.lang) ||
      defaultLanguage;
  }

  function textFor(key, language) {
    var normalized = normalizeLanguage(language) || defaultLanguage;
    var activeText = languageText[normalized] || languageText[defaultLanguage];
    return activeText[key] || languageText[defaultLanguage][key] || key;
  }

  function updateThemeToggle(theme) {
    var toggle = document.querySelector('[data-theme-toggle]');
    var label = document.querySelector('[data-theme-toggle-label]');
    var isDark = theme === 'dark';
    var language = currentLanguage();

    if (!toggle) {
      return;
    }

    toggle.setAttribute('aria-pressed', String(isDark));
    toggle.setAttribute(
      'aria-label',
      isDark ? textFor('themeSwitchLight', language) : textFor('themeSwitchDark', language)
    );

    if (label) {
      label.textContent = isDark ? textFor('themeLight', language) : textFor('themeDark', language);
    }
  }

  function applyTheme(theme, shouldStore) {
    var nextTheme = normalizeTheme(theme) || preferredTheme();
    document.documentElement.dataset.theme = nextTheme;
    updateThemeToggle(nextTheme);
    updateGiscusTheme(nextTheme);

    try {
      document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: nextTheme } }));
    } catch (error) {}

    if (shouldStore) {
      try {
        window.localStorage.setItem(themeStorageKey, nextTheme);
      } catch (error) {
        return;
      }
    }
  }

  function initThemeToggle() {
    var toggle = document.querySelector('[data-theme-toggle]');

    applyTheme(currentTheme(), false);

    if (!toggle) {
      return;
    }

    toggle.addEventListener('click', function () {
      applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
    });

    if (themeMedia) {
      var onSystemThemeChange = function () {
        if (!readStoredTheme()) {
          applyTheme(preferredTheme(), false);
        }
      };

      if (typeof themeMedia.addEventListener === 'function') {
        themeMedia.addEventListener('change', onSystemThemeChange);
      } else if (typeof themeMedia.addListener === 'function') {
        themeMedia.addListener(onSystemThemeChange);
      }
    }
  }

  function asBoolean(value, fallback) {
    if (value == null) {
      return fallback;
    }
    return value === 'true';
  }

  function asNumber(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function asList(value, fallback) {
    var source = value != null ? value : fallback;

    if (Array.isArray(source)) {
      return source.map(function (item) {
        return String(item).trim();
      }).filter(Boolean);
    }

    source = source || '';

    return String(source).split(',').map(function (item) {
      return item.trim();
    }).filter(Boolean);
  }

  function optionValue(element, config, key, fallback) {
    if (element.dataset[key] != null) {
      return element.dataset[key];
    }

    if (config && config[key] != null) {
      return config[key];
    }

    return fallback;
  }

  function optionNumber(element, config, key, fallback) {
    return asNumber(optionValue(element, config, key, fallback), fallback);
  }

  function optionBoolean(element, config, key, fallback) {
    var value = optionValue(element, config, key, fallback);

    if (typeof value === 'boolean') {
      return value;
    }

    return asBoolean(value, fallback);
  }

  function normalizeGeoGebraConfig(value) {
    if (Array.isArray(value)) {
      return { commands: value };
    }

    if (value && typeof value === 'object') {
      return value;
    }

    return {};
  }

  function mergeConfig(primary, secondary) {
    var result = {};

    [secondary, primary].forEach(function (source) {
      Object.keys(source || {}).forEach(function (key) {
        result[key] = source[key];
      });
    });

    return result;
  }

  function readInlineConfig(element) {
    var script = element.querySelector('script[type="application/json"]');

    if (!script) {
      return {};
    }

    try {
      return normalizeGeoGebraConfig(JSON.parse(script.textContent));
    } catch (error) {
      console.warn('GeoGebra config could not be parsed.', error);
      return {};
    }
  }

  function readAppletConfig(element) {
    var inlineConfig = readInlineConfig(element);
    var source = element.dataset.source;

    if (!source) {
      return Promise.resolve(inlineConfig);
    }

    return fetch(source, { credentials: 'same-origin' }).then(function (response) {
      if (!response.ok) {
        throw new Error('Could not load ' + source);
      }

      return response.json();
    }).then(function (fileConfig) {
      return mergeConfig(normalizeGeoGebraConfig(fileConfig), inlineConfig);
    });
  }

  function configViewValue(config, key) {
    var view = config && config.view;

    if (view && view[key] != null) {
      return view[key];
    }

    return config ? config[key] : null;
  }

  function viewNumber(element, config, key) {
    if (element.dataset[key] != null) {
      return asNumber(element.dataset[key], null);
    }

    return asNumber(configViewValue(config, key), null);
  }

  function setGeoGebraView(element, api, config) {
    var xMin = viewNumber(element, config, 'xMin');
    var xMax = viewNumber(element, config, 'xMax');
    var yMin = viewNumber(element, config, 'yMin');
    var yMax = viewNumber(element, config, 'yMax');

    if (
      xMin != null &&
      xMax != null &&
      yMin != null &&
      yMax != null &&
      typeof api.setCoordSystem === 'function'
    ) {
      api.setCoordSystem(xMin, xMax, yMin, yMax);
    }
  }

  function runGeoGebraCommands(element, api, config) {
    var commands = asList(config.commands, []);
    var animationObjects = asList(optionValue(element, config, 'animationObjects', 'P'), 'P');

    commands.forEach(function (command) {
      try {
        if (api.evalCommand(command) === false) {
          console.warn('GeoGebra command was rejected: ' + command);
        }
      } catch (error) {
        console.warn('GeoGebra command failed: ' + command, error);
      }
    });

    setGeoGebraView(element, api, config);

    if (optionBoolean(element, config, 'animation', false)) {
      animationObjects.forEach(function (objectName) {
        if (typeof api.setAnimating === 'function') {
          api.setAnimating(objectName, true);
        }

        if (typeof api.setAnimationSpeed === 'function') {
          api.setAnimationSpeed(objectName, optionNumber(element, config, 'animationSpeed', 0.35));
        }
      });

      if (typeof api.startAnimation === 'function') {
        api.startAnimation();
      }
    }

    element.dataset.geogebraReady = 'true';
    element.dataset.geogebraLoading = 'false';
    element.classList.add('is-ready');
  }

  function injectAppletWithConfig(element, config) {
    if (element.dataset.geogebraReady === 'true') {
      return;
    }

    var height = optionNumber(element, config, 'height', 460);
    var width = Math.max(320, Math.floor(element.clientWidth || optionNumber(element, config, 'width', 760)));

    var parameters = {
      id: element.id + '-applet',
      appName: optionValue(element, config, 'appName', 'classic'),
      width: width,
      height: height,
      showToolBar: optionBoolean(element, config, 'showToolBar', false),
      showAlgebraInput: optionBoolean(element, config, 'showAlgebraInput', false),
      showMenuBar: optionBoolean(element, config, 'showMenuBar', false),
      errorDialogsActive: optionBoolean(element, config, 'errorDialogsActive', false),
      enableLabelDrags: optionBoolean(element, config, 'enableLabelDrags', true),
      enableShiftDragZoom: optionBoolean(element, config, 'enableShiftDragZoom', true),
      language: currentLanguage(),
      useBrowserForJS: true,
      appletOnLoad: function (api) {
        window.setTimeout(function () {
          runGeoGebraCommands(element, api, config);
        }, 150);
      }
    };

    if (optionValue(element, config, 'materialId', null)) {
      parameters.material_id = optionValue(element, config, 'materialId', null);
    }

    if (optionValue(element, config, 'country', null)) {
      parameters.country = optionValue(element, config, 'country', null);
    }

    if (optionValue(element, config, 'filename', null)) {
      parameters.filename = optionValue(element, config, 'filename', null);
    }

    var applet = new window.GGBApplet(parameters, true);
    applet.inject(element.id);
    element.dataset.geogebraLanguage = parameters.language;
  }

  function injectApplet(element) {
    if (
      element.dataset.geogebraReady === 'true' ||
      element.dataset.geogebraLoading === 'true'
    ) {
      return;
    }

    if (!element.id) {
      element.id = 'geogebra-' + Math.random().toString(36).slice(2);
    }

    element.dataset.geogebraLoading = 'true';

    readAppletConfig(element).then(function (config) {
      injectAppletWithConfig(element, config);
    }).catch(function (error) {
      console.warn('GeoGebra config could not be loaded.', error);
      element.dataset.geogebraLoading = 'false';
    });
  }

  function initGeoGebra(attempt) {
    var applets = document.querySelectorAll('[data-geogebra]');

    if (!applets.length) {
      return;
    }

    if (!window.GGBApplet) {
      if (attempt < 40) {
        window.setTimeout(function () {
          initGeoGebra(attempt + 1);
        }, 250);
      }
      return;
    }

    applets.forEach(injectApplet);
  }

  function updateGeoGebraLanguage(language) {
    var shouldReload = false;
    var applets = document.querySelectorAll('[data-geogebra]');

    applets.forEach(function (element) {
      if (
        !element.dataset.geogebraLanguage ||
        normalizeLanguage(element.dataset.geogebraLanguage) === language
      ) {
        return;
      }

      element.dataset.geogebraReady = 'false';
      element.dataset.geogebraLoading = 'false';
      element.dataset.geogebraLanguage = '';
      element.classList.remove('is-ready');
      element.textContent = '';
      shouldReload = true;
    });

    if (shouldReload) {
      initGeoGebra(0);
    }
  }

  function giscusTheme(theme) {
    return theme === 'dark' ? 'dark' : 'light';
  }

  function updateGiscusTheme(theme) {
    var frame = document.querySelector('iframe.giscus-frame');

    if (!frame || !frame.contentWindow) {
      return;
    }

    frame.contentWindow.postMessage(
      { giscus: { setConfig: { theme: giscusTheme(theme) } } },
      'https://giscus.app'
    );
  }

  function updateGiscusLanguage(language) {
    var frame = document.querySelector('iframe.giscus-frame');

    if (!frame || !frame.contentWindow || !language) {
      return;
    }

    frame.contentWindow.postMessage(
      { giscus: { setConfig: { lang: language } } },
      'https://giscus.app'
    );
  }

  function appendGiscusAttribute(script, name, value) {
    script.setAttribute(name, value == null ? '' : String(value));
  }

  function initGiscus() {
    var container = document.getElementById('giscus-container');
    var config = window.__GISCUS_CONFIG__;
    var script = document.createElement('script');

    if (!container || !config || container.dataset.giscusReady === 'true') {
      return;
    }

    if (!config.repo || !config.repoID || !config.category || !config.categoryID) {
      if (container.parentElement) {
        container.parentElement.hidden = true;
      }
      console.warn('Giscus is not configured: set repo, repoID, category, and categoryID.');
      return;
    }

    script.src = 'https://giscus.app/client.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    appendGiscusAttribute(script, 'data-repo', config.repo);
    appendGiscusAttribute(script, 'data-repo-id', config.repoID);
    appendGiscusAttribute(script, 'data-category', config.category);
    appendGiscusAttribute(script, 'data-category-id', config.categoryID);
    appendGiscusAttribute(script, 'data-mapping', config.mapping || 'pathname');
    appendGiscusAttribute(script, 'data-term', config.term || window.location.pathname);
    appendGiscusAttribute(script, 'data-strict', config.strict || '0');
    appendGiscusAttribute(script, 'data-reactions-enabled', config.reactionsEnabled || '1');
    appendGiscusAttribute(script, 'data-emit-metadata', config.emitMetadata || '0');
    appendGiscusAttribute(script, 'data-input-position', config.inputPosition || 'bottom');
    appendGiscusAttribute(script, 'data-theme', giscusTheme(currentTheme()));
    appendGiscusAttribute(script, 'data-lang', currentLanguage());

    container.appendChild(script);
    container.dataset.giscusReady = 'true';
  }

  function matchingLanguageVersion(language) {
    var sections = document.querySelectorAll('[data-language-version]');
    var fallback = null;

    if (!sections.length) {
      return language;
    }

    for (var index = 0; index < sections.length; index += 1) {
      var sectionLanguage = normalizeLanguage(sections[index].dataset.languageVersion);

      if (sectionLanguage === language) {
        return sectionLanguage;
      }

      if (sectionLanguage === defaultLanguage) {
        fallback = defaultLanguage;
      }

      if (!fallback && sectionLanguage) {
        fallback = sectionLanguage;
      }
    }

    return fallback || language;
  }

  function updateLanguageVersions(language) {
    var contentLanguage = matchingLanguageVersion(language);
    var sections = document.querySelectorAll('[data-language-version]');

    sections.forEach(function (section) {
      var isCurrent = normalizeLanguage(section.dataset.languageVersion) === contentLanguage;

      section.hidden = !isCurrent;
      section.classList.toggle('is-current', isCurrent);
    });
  }

  function updateTranslatedText(language) {
    var nodes = document.querySelectorAll('[data-i18n-en]');

    nodes.forEach(function (node) {
      if (node.dataset.i18nZh == null) {
        node.dataset.i18nZh = node.textContent;
      }

      node.textContent = language === 'en' ? node.dataset.i18nEn : node.dataset.i18nZh;
    });
  }

  function updateLanguageToggle(language) {
    var toggles = document.querySelectorAll('[data-language-toggle]');

    toggles.forEach(function (toggle) {
      var buttons = toggle.querySelectorAll('[data-language-choice]');

      toggle.setAttribute('aria-label', textFor('languageToggle', language));

      buttons.forEach(function (button) {
        var isCurrent = normalizeLanguage(button.dataset.languageChoice) === language;

        button.classList.toggle('is-current', isCurrent);
        button.setAttribute('aria-pressed', String(isCurrent));
      });
    });
  }

  function updateCodeCopyButtons(language) {
    var buttons = document.querySelectorAll('[data-code-copy]');

    buttons.forEach(function (button) {
      var state = button.dataset.copyState || 'idle';
      var labelKey = state === 'copied' || state === 'failed' ? state : 'copy';

      button.textContent = textFor(labelKey, language);
      button.setAttribute('aria-label', textFor('copyCode', language));
    });
  }

  function applyLanguage(language, shouldStore) {
    var nextLanguage = normalizeLanguage(language) || defaultLanguage;

    document.documentElement.dataset.language = nextLanguage;
    document.documentElement.lang = nextLanguage;
    updateTranslatedText(nextLanguage);
    updateLanguageVersions(nextLanguage);
    updateLanguageToggle(nextLanguage);
    updateThemeToggle(currentTheme());
    updateCodeCopyButtons(nextLanguage);
    updateGiscusLanguage(nextLanguage);
    updateGeoGebraLanguage(nextLanguage);

    if (shouldStore) {
      try {
        window.localStorage.setItem(languageStorageKey, nextLanguage);
      } catch (error) {
        return;
      }
    }
  }

  function initLanguageToggle() {
    var toggles = document.querySelectorAll('[data-language-toggle]');

    applyLanguage(currentLanguage(), false);

    toggles.forEach(function (toggle) {
      toggle.addEventListener('click', function (event) {
        var button = event.target.closest('[data-language-choice]');

        if (!button || !toggle.contains(button)) {
          return;
        }

        applyLanguage(button.dataset.languageChoice, true);
      });
    });
  }

  function codeLineElements(code) {
    return Array.prototype.filter.call(code.children, function (child) {
      return child.tagName === 'SPAN' && child.id;
    });
  }

  function firstLineAnchor(line) {
    var first = line.firstElementChild;

    return first && first.tagName === 'A' && first.getAttribute('href') === '#' + line.id
      ? first
      : null;
  }

  function ensurePlainCodeLines(block, code) {
    var text = code.textContent.replace(/\n$/, '');
    var lines = text.split('\n');

    code.textContent = '';

    return lines.map(function (line, index) {
      var lineNumber = index + 1;
      var lineElement = document.createElement('span');
      var lineAnchor = document.createElement('a');

      lineElement.id = block.id + '-' + lineNumber;
      lineAnchor.href = '#' + lineElement.id;
      lineElement.appendChild(lineAnchor);
      lineElement.appendChild(document.createTextNode(line));
      code.appendChild(lineElement);

      if (index < lines.length - 1) {
        code.appendChild(document.createTextNode('\n'));
      }

      return lineElement;
    });
  }

  function enhanceCodeLines(block, code) {
    var lines = codeLineElements(code);

    if (!lines.length) {
      lines = ensurePlainCodeLines(block, code);
    }

    lines.forEach(function (line, index) {
      var lineNumber = String(index + 1);
      var anchor = firstLineAnchor(line);

      if (!anchor) {
        anchor = document.createElement('a');
        anchor.href = '#' + line.id;
        line.insertBefore(anchor, line.firstChild);
      }

      anchor.classList.add('code-line-link');
      anchor.textContent = lineNumber;
      anchor.setAttribute('aria-label', 'Link to line ' + lineNumber);
      anchor.removeAttribute('aria-hidden');
      anchor.removeAttribute('tabindex');
    });
  }

  function codeBlockText(code) {
    var lines = codeLineElements(code);

    if (!lines.length) {
      return code.textContent.replace(/\n$/, '');
    }

    return lines.map(function (line) {
      var anchor = firstLineAnchor(line);
      var text = '';

      Array.prototype.forEach.call(line.childNodes, function (node) {
        if (node !== anchor) {
          text += node.textContent;
        }
      });

      return text;
    }).join('\n');
  }

  function writeClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }

    return new Promise(function (resolve, reject) {
      var textarea = document.createElement('textarea');

      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      document.body.appendChild(textarea);
      textarea.select();

      try {
        if (document.execCommand('copy')) {
          resolve();
        } else {
          reject(new Error('Copy command was rejected.'));
        }
      } catch (error) {
        reject(error);
      } finally {
        document.body.removeChild(textarea);
      }
    });
  }

  function codeLanguage(code) {
    var classes = Array.prototype.slice.call(code.classList);
    var language = classes.find(function (className) {
      return className !== 'sourceCode' && className.indexOf('language-') !== 0;
    });

    if (!language) {
      language = classes.find(function (className) {
        return className.indexOf('language-') === 0;
      });
    }

    return language ? language.replace(/^language-/, '') : 'code';
  }

  function enhanceCodeBlock(block, pre, code, index) {
    var toolbar = document.createElement('div');
    var label = document.createElement('span');
    var copyButton = document.createElement('button');
    var resetTimer = null;

    if (!block.id) {
      block.id = 'codeblock-' + (index + 1);
    }

    block.dataset.codeEnhanced = 'true';
    block.classList.add('code-block');
    pre.classList.add('has-line-numbers');
    enhanceCodeLines(block, code);

    toolbar.className = 'code-block-toolbar';
    label.className = 'code-block-label';
    label.textContent = codeLanguage(code);

    copyButton.type = 'button';
    copyButton.className = 'code-copy-button';
    copyButton.dataset.codeCopy = 'true';
    copyButton.dataset.copyState = 'idle';
    copyButton.textContent = textFor('copy', currentLanguage());
    copyButton.setAttribute('aria-label', textFor('copyCode', currentLanguage()));

    copyButton.addEventListener('click', function () {
      writeClipboard(codeBlockText(code)).then(function () {
        window.clearTimeout(resetTimer);
        copyButton.dataset.copyState = 'copied';
        copyButton.textContent = textFor('copied', currentLanguage());
        copyButton.classList.add('is-copied');

        resetTimer = window.setTimeout(function () {
          copyButton.dataset.copyState = 'idle';
          copyButton.textContent = textFor('copy', currentLanguage());
          copyButton.classList.remove('is-copied');
        }, 1600);
      }).catch(function () {
        window.clearTimeout(resetTimer);
        copyButton.dataset.copyState = 'failed';
        copyButton.textContent = textFor('failed', currentLanguage());

        resetTimer = window.setTimeout(function () {
          copyButton.dataset.copyState = 'idle';
          copyButton.textContent = textFor('copy', currentLanguage());
        }, 1600);
      });
    });

    toolbar.appendChild(label);
    toolbar.appendChild(copyButton);
    block.insertBefore(toolbar, pre);
  }

  function initCodeBlocks() {
    var codeBlocks = document.querySelectorAll('pre > code');

    codeBlocks.forEach(function (code, index) {
      var pre = code.parentElement;

      if (pre.classList.contains('mermaid')) {
        return;
      }

      var block = pre.parentElement && pre.parentElement.classList.contains('sourceCode')
        ? pre.parentElement
        : null;

      if (!block) {
        block = document.createElement('div');
        block.className = 'sourceCode';
        pre.parentNode.insertBefore(block, pre);
        block.appendChild(pre);
      }

      if (block.dataset.codeEnhanced === 'true') {
        return;
      }

      enhanceCodeBlock(block, pre, code, index);
    });
  }

  function initMermaid() {
    if (typeof window.mermaid === 'undefined') {
      return;
    }

    var blocks = document.querySelectorAll('.mermaid');

    if (!blocks.length) {
      return;
    }

    var sources = [];

    blocks.forEach(function (block) {
      sources.push(block.textContent);
    });

    var currentTheme = function () {
      return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default';
    };

    var render = function () {
      blocks.forEach(function (block, i) {
        block.innerHTML = sources[i];
      });

      window.mermaid.initialize({
        startOnLoad: false,
        theme: currentTheme(),
        math: { enabled: true, forceLegacyMathML: true }
      });

      window.mermaid.run({ nodes: blocks }).catch(function (error) {
        console.warn('Mermaid render failed:', error);
      });
    };

    render();

    document.addEventListener('themechange', render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initThemeToggle();
      initLanguageToggle();
      initGeoGebra(0);
      initGiscus();
      initCodeBlocks();
      initMermaid();
    });
  } else {
    initThemeToggle();
    initLanguageToggle();
    initGeoGebra(0);
    initGiscus();
    initCodeBlocks();
    initMermaid();
  }
})();
