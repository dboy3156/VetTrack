(function (global) {
  'use strict';

  var DEFAULT_OPTIONS = {
    tourName: 'default_tour',
    steps: [],
    forceStart: false,
    storageKeyPrefix: 'unified_tour_completed_'
  };

  var STYLE_ID = 'unified-tour-styles';
  var ROOT_ID = 'unified-tour-root';

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function cloneRect(rect) {
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      rx: rect.rx
    };
  }

  function rafThrottle(fn) {
    var scheduled = false;
    return function throttled() {
      if (scheduled) {
        return;
      }
      scheduled = true;
      var context = this;
      var args = arguments;
      requestAnimationFrame(function () {
        scheduled = false;
        fn.apply(context, args);
      });
    };
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = "\n      #" + ROOT_ID + " {\n        position: fixed;\n        inset: 0;\n        z-index: 2147483646;\n        pointer-events: none;\n        font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;\n      }\n\n      #" + ROOT_ID + " * {\n        box-sizing: border-box;\n      }\n\n      #" + ROOT_ID + " .ut-backdrop {\n        position: fixed;\n        inset: 0;\n        pointer-events: auto;\n      }\n\n      #" + ROOT_ID + " .ut-mask {\n        width: 100%;\n        height: 100%;\n        display: block;\n      }\n\n      #" + ROOT_ID + " .ut-mask-dim {\n        fill: rgba(0, 0, 0, 0.68);\n      }\n\n      #" + ROOT_ID + " .ut-tooltip {\n        position: fixed;\n        width: min(360px, calc(100vw - 24px));\n        background: #ffffff;\n        color: #1f2937;\n        border-radius: 12px;\n        box-shadow: 0 20px 45px rgba(0, 0, 0, 0.28);\n        border: 1px solid rgba(0, 0, 0, 0.08);\n        transition: transform 220ms ease, opacity 220ms ease;\n        transform-origin: center;\n        opacity: 1;\n        pointer-events: auto;\n        overflow: hidden;\n      }\n\n      #" + ROOT_ID + " .ut-tooltip[data-enter='true'] {\n        opacity: 0;\n        transform: translateY(6px) scale(0.98);\n      }\n\n      #" + ROOT_ID + " .ut-tooltip-header {\n        padding: 14px 16px 4px;\n      }\n\n      #" + ROOT_ID + " .ut-title {\n        margin: 0;\n        font-size: 16px;\n        line-height: 1.3;\n        font-weight: 700;\n        color: #111827;\n      }\n\n      #" + ROOT_ID + " .ut-content {\n        margin: 0;\n        padding: 0 16px 14px;\n        font-size: 14px;\n        line-height: 1.5;\n        color: #374151;\n      }\n\n      #" + ROOT_ID + " .ut-footer {\n        display: flex;\n        align-items: center;\n        justify-content: space-between;\n        gap: 10px;\n        padding: 12px 16px 14px;\n        border-top: 1px solid #f3f4f6;\n        background: #fafafa;\n      }\n\n      #" + ROOT_ID + " .ut-progress {\n        font-size: 12px;\n        font-weight: 600;\n        color: #6b7280;\n      }\n\n      #" + ROOT_ID + " .ut-actions {\n        display: flex;\n        align-items: center;\n        gap: 8px;\n      }\n\n      #" + ROOT_ID + " .ut-btn {\n        appearance: none;\n        border: 0;\n        outline: 0;\n        border-radius: 8px;\n        padding: 8px 12px;\n        font-size: 13px;\n        font-weight: 600;\n        cursor: pointer;\n        transition: opacity 150ms ease, background 150ms ease, color 150ms ease;\n      }\n\n      #" + ROOT_ID + " .ut-btn:disabled {\n        opacity: 0.45;\n        cursor: default;\n      }\n\n      #" + ROOT_ID + " .ut-btn-secondary {\n        background: #eef2ff;\n        color: #3730a3;\n      }\n\n      #" + ROOT_ID + " .ut-btn-secondary:hover:not(:disabled) {\n        background: #e0e7ff;\n      }\n\n      #" + ROOT_ID + " .ut-btn-primary {\n        background: #111827;\n        color: #ffffff;\n      }\n\n      #" + ROOT_ID + " .ut-btn-primary:hover:not(:disabled) {\n        background: #030712;\n      }\n\n      #" + ROOT_ID + " .ut-btn-link {\n        background: transparent;\n        color: #6b7280;\n        padding: 8px 6px;\n      }\n\n      #" + ROOT_ID + " .ut-btn-link:hover:not(:disabled) {\n        color: #111827;\n        background: transparent;\n      }\n\n      .ut-highlighted-target {\n        position: relative !important;\n        z-index: 2147483645 !important;\n        box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.95) !important;\n      }\n    ";

    document.head.appendChild(style);
  }

  function UnifiedTour(options) {
    this.options = Object.assign({}, DEFAULT_OPTIONS, options || {});

    if (!Array.isArray(this.options.steps) || this.options.steps.length === 0) {
      throw new Error('UnifiedTour requires a non-empty "steps" array.');
    }

    this.storageKey = this.options.storageKeyPrefix + this.options.tourName;
    this.maskId = 'ut-mask-' + Math.random().toString(36).slice(2);

    this.currentStepIndex = -1;
    this.activeTarget = null;
    this.isRunning = false;

    this.root = null;
    this.backdrop = null;
    this.svgEl = null;
    this.maskFillEl = null;
    this.holeEl = null;
    this.dimEl = null;
    this.tooltip = null;
    this.titleEl = null;
    this.contentEl = null;
    this.progressEl = null;
    this.backBtn = null;
    this.nextBtn = null;
    this.skipBtn = null;

    this.currentHoleRect = null;
    this.holeRafId = 0;

    this.boundHandleResize = rafThrottle(this.handleResize.bind(this));
    this.boundHandleKeydown = this.handleKeydown.bind(this);
  }

  UnifiedTour.prototype._createMarkup = function () {
    if (this.root && document.body.contains(this.root)) {
      return;
    }

    ensureStyles();

    var root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('aria-live', 'polite');
    root.innerHTML = "\n      <div class=\"ut-backdrop\">\n        <svg class=\"ut-mask\" xmlns=\"http://www.w3.org/2000/svg\" aria-hidden=\"true\" focusable=\"false\">\n          <defs>\n            <mask id=\"" + this.maskId + "\" maskUnits=\"userSpaceOnUse\">\n              <rect class=\"ut-mask-fill\" x=\"0\" y=\"0\" width=\"100%\" height=\"100%\" fill=\"#fff\"></rect>\n              <rect class=\"ut-mask-hole\" x=\"0\" y=\"0\" width=\"0\" height=\"0\" rx=\"12\" ry=\"12\" fill=\"#000\"></rect>\n            </mask>\n          </defs>\n          <rect class=\"ut-mask-dim\" x=\"0\" y=\"0\" width=\"100%\" height=\"100%\" mask=\"url(#" + this.maskId + ")\"></rect>\n        </svg>\n      </div>\n      <section class=\"ut-tooltip\" role=\"dialog\" aria-modal=\"true\" aria-label=\"App tour\">\n        <header class=\"ut-tooltip-header\">\n          <h3 class=\"ut-title\"></h3>\n        </header>\n        <p class=\"ut-content\"></p>\n        <footer class=\"ut-footer\">\n          <div class=\"ut-progress\"></div>\n          <div class=\"ut-actions\">\n            <button type=\"button\" class=\"ut-btn ut-btn-link\" data-role=\"skip\">Skip</button>\n            <button type=\"button\" class=\"ut-btn ut-btn-secondary\" data-role=\"back\">Back</button>\n            <button type=\"button\" class=\"ut-btn ut-btn-primary\" data-role=\"next\">Next</button>\n          </div>\n        </footer>\n      </section>\n    ";

    document.body.appendChild(root);

    this.root = root;
    this.backdrop = root.querySelector('.ut-backdrop');
    this.svgEl = root.querySelector('.ut-mask');
    this.maskFillEl = root.querySelector('.ut-mask-fill');
    this.holeEl = root.querySelector('.ut-mask-hole');
    this.dimEl = root.querySelector('.ut-mask-dim');
    this.tooltip = root.querySelector('.ut-tooltip');
    this.titleEl = root.querySelector('.ut-title');
    this.contentEl = root.querySelector('.ut-content');
    this.progressEl = root.querySelector('.ut-progress');
    this.backBtn = root.querySelector('[data-role="back"]');
    this.nextBtn = root.querySelector('[data-role="next"]');
    this.skipBtn = root.querySelector('[data-role="skip"]');

    var self = this;
    this.backBtn.addEventListener('click', function () {
      self.prev();
    });

    this.nextBtn.addEventListener('click', function () {
      self.next();
    });

    this.skipBtn.addEventListener('click', function () {
      self.skip();
    });

    this.backdrop.addEventListener('click', function () {
      self.next();
    });

    this._syncViewport();
  };

  UnifiedTour.prototype._destroyMarkup = function () {
    this._clearActiveTarget();
    this._stopHoleAnimation();

    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }

    this.root = null;
    this.backdrop = null;
    this.svgEl = null;
    this.maskFillEl = null;
    this.holeEl = null;
    this.dimEl = null;
    this.tooltip = null;
    this.titleEl = null;
    this.contentEl = null;
    this.progressEl = null;
    this.backBtn = null;
    this.nextBtn = null;
    this.skipBtn = null;
    this.currentHoleRect = null;
  };

  UnifiedTour.prototype._clearActiveTarget = function () {
    if (!this.activeTarget) {
      return;
    }

    this.activeTarget.classList.remove('ut-highlighted-target');
    this.activeTarget = null;
  };

  UnifiedTour.prototype._markCompleted = function () {
    try {
      localStorage.setItem(this.storageKey, '1');
    } catch (err) {
      // Ignore storage write failures.
    }
  };

  UnifiedTour.prototype.isCompleted = function () {
    if (this.options.forceStart) {
      return false;
    }

    try {
      return localStorage.getItem(this.storageKey) === '1';
    } catch (err) {
      return false;
    }
  };

  UnifiedTour.prototype.reset = function () {
    try {
      localStorage.removeItem(this.storageKey);
    } catch (err) {
      // Ignore storage failures.
    }
  };

  UnifiedTour.prototype.start = function (forceStart) {
    var shouldForce = Boolean(forceStart || this.options.forceStart);

    if (!shouldForce && this.isCompleted()) {
      return false;
    }

    if (!document.body) {
      var self = this;
      document.addEventListener(
        'DOMContentLoaded',
        function () {
          self.start(shouldForce);
        },
        { once: true }
      );
      return true;
    }

    if (this.isRunning) {
      return true;
    }

    this._createMarkup();
    this.isRunning = true;
    this.currentStepIndex = -1;

    window.addEventListener('resize', this.boundHandleResize);
    window.addEventListener('scroll', this.boundHandleResize, true);
    document.addEventListener('keydown', this.boundHandleKeydown);

    this.next();
    return true;
  };

  UnifiedTour.prototype.stop = function (markCompleted) {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    window.removeEventListener('resize', this.boundHandleResize);
    window.removeEventListener('scroll', this.boundHandleResize, true);
    document.removeEventListener('keydown', this.boundHandleKeydown);

    if (markCompleted) {
      this._markCompleted();
    }

    this._destroyMarkup();
    this.currentStepIndex = -1;
  };

  UnifiedTour.prototype.skip = function () {
    this.stop(true);
  };

  UnifiedTour.prototype.prev = function () {
    if (!this.isRunning) {
      return;
    }

    var prevIndex = this.currentStepIndex - 1;
    if (prevIndex < 0) {
      return;
    }

    this._showStep(prevIndex, -1);
  };

  UnifiedTour.prototype.next = function () {
    if (!this.isRunning) {
      return;
    }

    var nextIndex = this.currentStepIndex + 1;
    this._showStep(nextIndex, 1);
  };

  UnifiedTour.prototype.handleResize = function () {
    if (!this.isRunning || this.currentStepIndex < 0) {
      return;
    }

    this._syncViewport();

    var step = this.options.steps[this.currentStepIndex];
    if (!step) {
      return;
    }

    var target = document.querySelector(step.selector);
    if (!target) {
      return;
    }

    this._positionForTarget(target);
  };

  UnifiedTour.prototype.handleKeydown = function (event) {
    if (!this.isRunning) {
      return;
    }

    if (event.key === 'Escape') {
      this.skip();
      return;
    }

    if (event.key === 'ArrowRight' || event.key === 'Enter') {
      this.next();
      return;
    }

    if (event.key === 'ArrowLeft') {
      this.prev();
    }
  };

  UnifiedTour.prototype._showStep = function (index, direction) {
    if (index >= this.options.steps.length) {
      this.stop(true);
      return;
    }

    if (index < 0) {
      return;
    }

    var step = this.options.steps[index];
    if (!step || !step.selector) {
      this._showStep(index + (direction || 1), direction || 1);
      return;
    }

    var target = document.querySelector(step.selector);
    if (!target) {
      this._showStep(index + (direction || 1), direction || 1);
      return;
    }

    this.currentStepIndex = index;

    if (this.activeTarget !== target) {
      this._clearActiveTarget();
      this.activeTarget = target;
      this.activeTarget.classList.add('ut-highlighted-target');
    }

    this._updateContent(step);

    var self = this;
    this._scrollToTarget(target).then(function () {
      if (!self.isRunning || self.activeTarget !== target) {
        return;
      }
      self._positionForTarget(target);
    });
  };

  UnifiedTour.prototype._updateContent = function (step) {
    var current = this.currentStepIndex + 1;
    var total = this.options.steps.length;

    this.titleEl.textContent = String(step.title || ('Step ' + current));
    this.contentEl.textContent = String(step.content || '');
    this.progressEl.textContent = 'Step ' + current + ' of ' + total;

    this.backBtn.disabled = this.currentStepIndex === 0;
    this.nextBtn.textContent = current >= total ? 'Finish' : 'Next';

    this.tooltip.setAttribute('data-enter', 'true');
    requestAnimationFrame(
      function () {
        this.tooltip.setAttribute('data-enter', 'false');
      }.bind(this)
    );
  };

  UnifiedTour.prototype._scrollToTarget = function (target) {
    var viewportPadding = 24;
    var rect = target.getBoundingClientRect();
    var outOfView =
      rect.top < viewportPadding ||
      rect.left < viewportPadding ||
      rect.bottom > window.innerHeight - viewportPadding ||
      rect.right > window.innerWidth - viewportPadding;

    if (!outOfView) {
      return Promise.resolve();
    }

    return new Promise(function (resolve) {
      var finished = false;
      var done = function () {
        if (finished) {
          return;
        }
        finished = true;
        resolve();
      };

      var timeoutId = setTimeout(done, 600);
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          clearTimeout(timeoutId);
          done();
        });
      });
    });
  };

  UnifiedTour.prototype._syncViewport = function () {
    if (!this.svgEl || !this.maskFillEl || !this.dimEl) {
      return;
    }

    var width = Math.max(window.innerWidth, 1);
    var height = Math.max(window.innerHeight, 1);

    this.svgEl.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    this.maskFillEl.setAttribute('width', String(width));
    this.maskFillEl.setAttribute('height', String(height));
    this.dimEl.setAttribute('width', String(width));
    this.dimEl.setAttribute('height', String(height));
  };

  UnifiedTour.prototype._setHoleRect = function (rect) {
    if (!this.holeEl) {
      return;
    }

    this.holeEl.setAttribute('x', String(rect.x));
    this.holeEl.setAttribute('y', String(rect.y));
    this.holeEl.setAttribute('width', String(rect.width));
    this.holeEl.setAttribute('height', String(rect.height));
    this.holeEl.setAttribute('rx', String(rect.rx));
    this.holeEl.setAttribute('ry', String(rect.rx));

    this.currentHoleRect = cloneRect(rect);
  };

  UnifiedTour.prototype._stopHoleAnimation = function () {
    if (this.holeRafId) {
      cancelAnimationFrame(this.holeRafId);
      this.holeRafId = 0;
    }
  };

  UnifiedTour.prototype._animateHole = function (nextRect) {
    this._stopHoleAnimation();

    if (!this.currentHoleRect) {
      this._setHoleRect(nextRect);
      return;
    }

    var startRect = cloneRect(this.currentHoleRect);
    var targetRect = cloneRect(nextRect);
    var startTime = performance.now();
    var duration = 260;
    var self = this;

    function easeInOut(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function frame(now) {
      var elapsed = now - startTime;
      var t = clamp(elapsed / duration, 0, 1);
      var eased = easeInOut(t);

      var interpolated = {
        x: startRect.x + (targetRect.x - startRect.x) * eased,
        y: startRect.y + (targetRect.y - startRect.y) * eased,
        width: startRect.width + (targetRect.width - startRect.width) * eased,
        height: startRect.height + (targetRect.height - startRect.height) * eased,
        rx: startRect.rx + (targetRect.rx - startRect.rx) * eased
      };

      self._setHoleRect(interpolated);

      if (t < 1) {
        self.holeRafId = requestAnimationFrame(frame);
      } else {
        self.holeRafId = 0;
        self._setHoleRect(targetRect);
      }
    }

    this.holeRafId = requestAnimationFrame(frame);
  };

  UnifiedTour.prototype._positionForTarget = function (target) {
    if (!this.backdrop || !this.tooltip) {
      return;
    }

    this._syncViewport();

    var rect = target.getBoundingClientRect();
    var padding = 10;
    var holeRect = {
      x: clamp(rect.left - padding, 0, window.innerWidth),
      y: clamp(rect.top - padding, 0, window.innerHeight),
      width: clamp(rect.width + padding * 2, 0, window.innerWidth),
      height: clamp(rect.height + padding * 2, 0, window.innerHeight),
      rx: 12
    };

    this._animateHole(holeRect);
    this._positionTooltip(rect);
  };

  UnifiedTour.prototype._positionTooltip = function (targetRect) {
    var margin = 12;
    var viewportPadding = 8;

    var tooltipWidth = this.tooltip.offsetWidth || 320;
    var tooltipHeight = this.tooltip.offsetHeight || 180;

    var space = {
      top: targetRect.top,
      bottom: window.innerHeight - targetRect.bottom,
      left: targetRect.left,
      right: window.innerWidth - targetRect.right
    };

    var placements = ['bottom', 'top', 'right', 'left'];
    placements.sort(function (a, b) {
      return space[b] - space[a];
    });

    function candidatePosition(placement) {
      if (placement === 'top') {
        return {
          x: targetRect.left + targetRect.width / 2 - tooltipWidth / 2,
          y: targetRect.top - tooltipHeight - margin
        };
      }

      if (placement === 'bottom') {
        return {
          x: targetRect.left + targetRect.width / 2 - tooltipWidth / 2,
          y: targetRect.bottom + margin
        };
      }

      if (placement === 'left') {
        return {
          x: targetRect.left - tooltipWidth - margin,
          y: targetRect.top + targetRect.height / 2 - tooltipHeight / 2
        };
      }

      return {
        x: targetRect.right + margin,
        y: targetRect.top + targetRect.height / 2 - tooltipHeight / 2
      };
    }

    function fits(pos) {
      return (
        pos.x >= viewportPadding &&
        pos.y >= viewportPadding &&
        pos.x + tooltipWidth <= window.innerWidth - viewportPadding &&
        pos.y + tooltipHeight <= window.innerHeight - viewportPadding
      );
    }

    var chosen = candidatePosition(placements[0]);
    for (var i = 0; i < placements.length; i += 1) {
      var candidate = candidatePosition(placements[i]);
      if (fits(candidate)) {
        chosen = candidate;
        break;
      }
    }

    var x = clamp(chosen.x, viewportPadding, window.innerWidth - tooltipWidth - viewportPadding);
    var y = clamp(chosen.y, viewportPadding, window.innerHeight - tooltipHeight - viewportPadding);

    this.tooltip.style.left = x + 'px';
    this.tooltip.style.top = y + 'px';
  };

  UnifiedTour.prototype.destroy = function () {
    this.stop(false);

    var style = document.getElementById(STYLE_ID);
    if (style && style.parentNode) {
      style.parentNode.removeChild(style);
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = UnifiedTour;
  }

  global.UnifiedTour = UnifiedTour;
})(typeof window !== 'undefined' ? window : globalThis);
