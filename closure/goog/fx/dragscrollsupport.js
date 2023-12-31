/**
 * @license
 * Copyright The Closure Library Authors.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Class to support scrollable containers for drag and drop.
 */

goog.provide('goog.fx.DragScrollSupport');

goog.require('goog.Disposable');
goog.require('goog.Timer');
goog.require('goog.dom');
goog.require('goog.events.EventHandler');
goog.require('goog.events.EventType');
goog.require('goog.math.Coordinate');
goog.require('goog.style');
goog.requireType('goog.events.Event');
goog.requireType('goog.math.Rect');



/**
 * A scroll support class. Currently this class will automatically scroll
 * a scrollable container node and scroll it by a fixed amount at a timed
 * interval when the mouse is moved above or below the container or in vertical
 * margin areas. Intended for use in drag and drop. This could potentially be
 * made more general and could support horizontal scrolling.
 *
 * @param {Element} containerNode A container that can be scrolled.
 * @param {number=} opt_margin Optional margin to use while scrolling.
 * @param {boolean=} opt_externalMouseMoveTracking Whether mouse move events
 *     are tracked externally by the client object which calls the mouse move
 *     event handler, useful when events are generated for more than one source
 *     element and/or are not real mousemove events.
 * @constructor
 * @struct
 * @extends {goog.Disposable}
 * @see ../demos/dragscrollsupport.html
 */
goog.fx.DragScrollSupport = function(
    containerNode, opt_margin, opt_externalMouseMoveTracking) {
  'use strict';
  goog.fx.DragScrollSupport.base(this, 'constructor');

  /**
   * Whether scrolling should be constrained to happen only when the cursor is
   * inside the container node.
   * @private {boolean}
   */
  this.constrainScroll_ = false;

  /**
   * Whether horizontal scrolling is allowed.
   * @private {boolean}
   */
  this.horizontalScrolling_ = true;

  /**
   * The container to be scrolled.
   * @type {Element}
   * @private
   */
  this.containerNode_ = containerNode;

  /**
   * Scroll timer that will scroll the container until it is stopped.
   * It will scroll when the mouse is outside the scrolling area of the
   * container.
   *
   * @type {goog.Timer}
   * @private
   */
  this.scrollTimer_ = new goog.Timer(goog.fx.DragScrollSupport.TIMER_STEP_);

  /**
   * EventHandler used to set up and tear down listeners.
   * @type {goog.events.EventHandler<!goog.fx.DragScrollSupport>}
   * @private
   */
  this.eventHandler_ = new goog.events.EventHandler(this);

  /**
   * The current scroll delta.
   * @type {goog.math.Coordinate}
   * @private
   */
  this.scrollDelta_ = new goog.math.Coordinate();

  /**
   * Whether the container actually represents the scrollable content instead of
   * the parent of the scrollable content. For the entire page (BODY/HTML),
   * the behavior for hit detection is different because we care about events
   * relative to the viewport, which serves as the actual container.
   * @private
   * @const
   */
  this.containerIsActuallyContent_ =
      containerNode.tagName === 'BODY' || containerNode.tagName === 'HTML';

  /**
   * The container bounds.
   * @type {goog.math.Rect}
   * @private
   */
  this.containerBounds_ = goog.style.getBounds(containerNode);
  if (this.containerIsActuallyContent_) {
    var size = goog.dom.getViewportSize();
    this.containerBounds_.height = size.height;
    this.containerBounds_.width = size.width;
  }

  /**
   * The margin for triggering a scroll.
   * @type {number}
   * @private
   */
  this.margin_ = opt_margin || 0;

  /**
   * The bounding rectangle which if left triggers scrolling.
   * @type {goog.math.Rect}
   * @private
   */
  this.scrollBounds_ = opt_margin ?
      this.constrainBounds_(this.containerBounds_.clone()) :
      this.containerBounds_;

  this.setupListeners_(!!opt_externalMouseMoveTracking);
};
goog.inherits(goog.fx.DragScrollSupport, goog.Disposable);


/**
 * The scroll timer step in ms.
 * @type {number}
 * @private
 */
goog.fx.DragScrollSupport.TIMER_STEP_ = 50;


/**
 * The scroll step in pixels.
 * @type {number}
 * @private
 */
goog.fx.DragScrollSupport.SCROLL_STEP_ = 8;

/**
 * @type {!goog.math.Coordinate}
 * @private
 * @const
 */
goog.fx.DragScrollSupport.ORIGIN_COORDINATE_ = new goog.math.Coordinate(0, 0);

/**
 * The suggested scrolling margin.
 * @type {number}
 */
goog.fx.DragScrollSupport.MARGIN = 32;


/**
 * Sets whether scrolling should be constrained to happen only when the cursor
 * is inside the container node.
 * NOTE: If a margin is not set, then it does not make sense to
 * contain the scroll, because in that case scroll will never be triggered.
 * @param {boolean} constrain Whether scrolling should be constrained to happen
 *     only when the cursor is inside the container node.
 */
goog.fx.DragScrollSupport.prototype.setConstrainScroll = function(constrain) {
  'use strict';
  this.constrainScroll_ = !!this.margin_ && constrain;
};


/**
 * Sets whether horizontal scrolling is allowed.
 * @param {boolean} scrolling Whether horizontal scrolling is allowed.
 */
goog.fx.DragScrollSupport.prototype.setHorizontalScrolling = function(
    scrolling) {
  'use strict';
  this.horizontalScrolling_ = scrolling;
};


/**
 * Constrains the container bounds with respect to the margin.
 *
 * @param {goog.math.Rect} bounds The container element.
 * @return {goog.math.Rect} The bounding rectangle used to calculate scrolling
 *     direction.
 * @private
 */
goog.fx.DragScrollSupport.prototype.constrainBounds_ = function(bounds) {
  'use strict';
  var margin = this.margin_;
  if (margin) {
    var quarterHeight = bounds.height * 0.25;
    var yMargin = Math.min(margin, quarterHeight);
    bounds.top += yMargin;
    bounds.height -= 2 * yMargin;

    var quarterWidth = bounds.width * 0.25;
    var xMargin = Math.min(margin, quarterWidth);
    bounds.left += xMargin;
    bounds.width -= 2 * xMargin;
  }
  return bounds;
};


/**
 * Attaches listeners and activates automatic scrolling.
 * @param {boolean} externalMouseMoveTracking Whether to enable internal
 *     mouse move event handling.
 * @private
 */
goog.fx.DragScrollSupport.prototype.setupListeners_ = function(
    externalMouseMoveTracking) {
  'use strict';
  if (!externalMouseMoveTracking) {
    // Track mouse pointer position to determine scroll direction.
    this.eventHandler_.listen(
        goog.dom.getOwnerDocument(this.containerNode_),
        goog.events.EventType.MOUSEMOVE, this.onMouseMove);
  }

  // Scroll with a constant speed.
  this.eventHandler_.listen(this.scrollTimer_, goog.Timer.TICK, this.onTick_);
};


/**
 * Handler for timer tick event, scrolls the container by one scroll step if
 * needed.
 * @param {goog.events.Event} event Timer tick event.
 * @private
 */
goog.fx.DragScrollSupport.prototype.onTick_ = function(event) {
  'use strict';
  this.containerNode_.scrollTop += this.scrollDelta_.y;
  this.containerNode_.scrollLeft += this.scrollDelta_.x;
};


/**
 * Handler for mouse moves events.
 * @param {goog.events.Event} event Mouse move event.
 * @suppress {strictMissingProperties} Added to tighten compiler checks
 */
goog.fx.DragScrollSupport.prototype.onMouseMove = function(event) {
  'use strict';
  let eventOffset = this.containerIsActuallyContent_ ?
      goog.fx.DragScrollSupport.ORIGIN_COORDINATE_ :
      goog.dom.getDomHelper(this.containerNode_).getDocumentScroll();

  /** @suppress {strictMissingProperties} Added to tighten compiler checks */
  var deltaX = this.horizontalScrolling_ ?
      this.calculateScrollDelta(
          event.clientX + eventOffset.x, this.scrollBounds_.left,
          this.scrollBounds_.width) :
      0;
  /** @suppress {strictMissingProperties} Added to tighten compiler checks */
  var deltaY = this.calculateScrollDelta(
      event.clientY + eventOffset.y, this.scrollBounds_.top,
      this.scrollBounds_.height);
  this.scrollDelta_.x = deltaX;
  this.scrollDelta_.y = deltaY;

  // If the scroll data is 0 or the event fired outside of the
  // bounds of the container node.
  if ((!deltaX && !deltaY) ||
      (this.constrainScroll_ &&
       !this.isInContainerBounds_(
           event.clientX + eventOffset.x, event.clientY + eventOffset.y))) {
    this.scrollTimer_.stop();
  } else if (!this.scrollTimer_.enabled) {
    this.scrollTimer_.start();
  }
};


/**
 * Gets whether the input coordinate is in the container bounds.
 * @param {number} x The x coordinate.
 * @param {number} y The y coordinate.
 * @return {boolean} Whether the input coordinate is in the container bounds.
 * @private
 */
goog.fx.DragScrollSupport.prototype.isInContainerBounds_ = function(x, y) {
  'use strict';
  var containerBounds = this.containerBounds_;
  return containerBounds.left <= x &&
      containerBounds.left + containerBounds.width >= x &&
      containerBounds.top <= y &&
      containerBounds.top + containerBounds.height >= y;
};


/**
 * Calculates scroll delta.
 *
 * @param {number} coordinate Current mouse pointer coordinate.
 * @param {number} min The coordinate value below which scrolling up should be
 *     started.
 * @param {number} rangeLength The length of the range in which scrolling should
 *     be disabled and above which scrolling down should be started.
 * @return {number} The calculated scroll delta.
 * @protected
 */
goog.fx.DragScrollSupport.prototype.calculateScrollDelta = function(
    coordinate, min, rangeLength) {
  'use strict';
  var delta = 0;
  if (coordinate < min) {
    delta = -goog.fx.DragScrollSupport.SCROLL_STEP_;
  } else if (coordinate > min + rangeLength) {
    delta = goog.fx.DragScrollSupport.SCROLL_STEP_;
  }
  return delta;
};


/** @override */
goog.fx.DragScrollSupport.prototype.disposeInternal = function() {
  'use strict';
  goog.fx.DragScrollSupport.superClass_.disposeInternal.call(this);
  this.eventHandler_.dispose();
  this.scrollTimer_.dispose();
};
