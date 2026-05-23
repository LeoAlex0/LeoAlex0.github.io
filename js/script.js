;(function () {
  var themeStorageKey = 'theme';
  var themeMedia = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

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

  function updateThemeToggle(theme) {
    var toggle = document.querySelector('[data-theme-toggle]');
    var label = document.querySelector('[data-theme-toggle-label]');
    var isDark = theme === 'dark';

    if (!toggle) {
      return;
    }

    toggle.setAttribute('aria-pressed', String(isDark));
    toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');

    if (label) {
      label.textContent = isDark ? 'Light' : 'Dark';
    }
  }

  function applyTheme(theme, shouldStore) {
    var nextTheme = normalizeTheme(theme) || preferredTheme();
    document.documentElement.dataset.theme = nextTheme;
    updateThemeToggle(nextTheme);

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

    if (optionValue(element, config, 'language', null)) {
      parameters.language = optionValue(element, config, 'language', null);
    }

    if (optionValue(element, config, 'country', null)) {
      parameters.country = optionValue(element, config, 'country', null);
    }

    if (optionValue(element, config, 'filename', null)) {
      parameters.filename = optionValue(element, config, 'filename', null);
    }

    var applet = new window.GGBApplet(parameters, true);
    applet.inject(element.id);
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

  function initGitalk() {
    var container = document.getElementById('gitalk-container');
    var config = window.__GITALK_CONFIG__;

    if (!container || !config || !window.Gitalk || container.dataset.gitalkReady === 'true') {
      return;
    }

    if (!config.clientSecret && !config.proxy) {
      console.warn('Gitalk is not configured: set GITALK_CLIENT_SECRET or GITALK_PROXY.');
      return;
    }

    var options = {
      clientID: config.clientID,
      repo: config.repo,
      owner: config.owner,
      admin: config.admin,
      id: window.location.pathname,
      language: config.language || document.documentElement.lang || 'en',
      distractionFreeMode: config.distractionFreeMode === true
    };

    if (config.clientSecret) {
      options.clientSecret = config.clientSecret;
    }

    if (config.proxy) {
      options.proxy = config.proxy;
    }

    var gitalk = new window.Gitalk(options);

    gitalk.render(container);
    container.dataset.gitalkReady = 'true';
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
    copyButton.textContent = 'Copy';
    copyButton.setAttribute('aria-label', 'Copy code block');

    copyButton.addEventListener('click', function () {
      writeClipboard(codeBlockText(code)).then(function () {
        window.clearTimeout(resetTimer);
        copyButton.textContent = 'Copied';
        copyButton.classList.add('is-copied');

        resetTimer = window.setTimeout(function () {
          copyButton.textContent = 'Copy';
          copyButton.classList.remove('is-copied');
        }, 1600);
      }).catch(function () {
        window.clearTimeout(resetTimer);
        copyButton.textContent = 'Failed';

        resetTimer = window.setTimeout(function () {
          copyButton.textContent = 'Copy';
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initThemeToggle();
      initGeoGebra(0);
      initGitalk();
      initCodeBlocks();
    });
  } else {
    initThemeToggle();
    initGeoGebra(0);
    initGitalk();
    initCodeBlocks();
  }
})();
