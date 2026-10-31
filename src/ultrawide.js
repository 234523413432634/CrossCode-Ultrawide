// CrossCode ultrawide patch
// 1) Widen the internal resolution to match the monitor's aspect ratio (height stays 320).
// 2) Keep HUD/menus in a centered 16:9 "safe area" (568px wide), the original layout.
(function(){
  var BASE = 568;
  var sw = (window.screen && screen.width) || 0, sh = (window.screen && screen.height) || 0;
  if (sw > 0 && sh > 0) {
    var w = Math.round(320 * sw / sh / 2) * 2;
    if (w > window.IG_WIDTH) window.IG_WIDTH = w;
  }
  window.IG_BASE_WIDTH = BASE;

  // GUI classes that must not be shifted into the safe area:
  // - placed in screen coordinates taken from the world, the mouse or other elements
  // - small boxes that paint the whole screen (fades, overlays)
  var SKIP_CLASSES = [
    "sc.QuickMenuTypesBase", "sc.QuickArrowBox", "sc.QuickMenuAnalysisCursor", "sc.RhombusMenuLocation",
    "ig.OverlayGui", "ig.DreamCircleShadowGui", "ig.DreamSideGui", "ig.GUI.SergeyMode", "sc.LineBoxGui",
    // area map: placed with sc.menu.mapAreaOffset, which is already a real screen offset
    "sc.MapNameGui", "sc.StampEditMenu",
    // the area map itself: centered by the game against the full screen width (small
    // areas would otherwise be shifted, since only areas wider than 16:9 were left alone)
    "sc.MapArea",
    // popups placed next to world-anchored elements (quick ring, analysis targets, arena map)
    "sc.QuickItemMenu", "sc.QuickPartyStrategyMenu", "sc.QUICK_INFO_BOXES.Enemy", "sc.RhombusMenuInfo",
    "sc.QuickFocusScreen",  // holds the analysis info boxes (and their target labels)
    // follow entities / the skill-tree camera in real screen coordinates
    "ig.GUI.ARBox", "sc.DreamMsgGui", "sc.CircuitInfoBox",
    // circuit tree node highlight: placed in the scrolled tree's coordinates
    "sc.CiruitCursor",  // (sic, the game's class name)
    // popups placed at the on-screen position of the button that opened them
    "sc.ShopQuantitySelect", "sc.OptionLangPopUp"
  ];
  // Methods whose layout math uses ig.system.width but whose results are 16:9 coordinates.
  // They run with ig.system.width temporarily set to the 16:9 width.
  var SAFE_SPACE_METHODS = [
    ["ig.MessageAreaGui", "modelChanged"],      // dialog portraits, message bubbles, choice box
    ["ig.MessageAreaGui", "_reorderPortraits"],
    ["sc.HelpInfoBox", "show"]
  ];
  var ready = false;
  function setup() {
    ready = true;
    SKIP_CLASSES = SKIP_CLASSES.map(lookup).filter(Boolean);

    // World map: its background image is 568px wide but was drawn at full screen width,
    // which draws nothing. Center it in the safe area (where the area markers are) and
    // fill the sides with the image's border color.
    if (sc.MapWorldMap) sc.MapWorldMap.prototype.updateDrawables = function(r) {
      var W = this.hook.size.x, H = this.hook.size.y, iw = this.gfx.width || BASE;
      if (W <= iw) { r.addGfx(this.gfx, 0, 0, 0, 0, W, H); return; }
      r.addColor("rgb(8,8,8)", 0, 0, W, H);
      r.addGfx(this.gfx, Math.floor((W - BASE) / 2), 0, 0, 0, iw, H);
    };
    // Any element that converts map -> screen coordinates during its own update is
    // following something in the world (HP bars, interact icons, item pickups...).
    var orig = ig.system.getScreenFromMapPos;
    ig.system.getScreenFromMapPos = function() {
      if (window.uwCur) window.uwCur.uwWorld = true;
      return orig.apply(this, arguments);
    };
    patchParallax();
    patchCamera();
    patchTutorials();
    patchPortraits();
    // Social menu: its member options popups (sc.SortMenu instances) are placed at the
    // clicked entry's on-screen position. Other sort menus use 16:9 layout, so only
    // these two instances are excluded.
    var SM = sc.SocialMenu && sc.SocialMenu.prototype;
    if (SM && SM.openOptionsMenu && !SM.uwPatched) {
      SM.uwPatched = true;
      var openOpts = SM.openOptionsMenu;
      SM.openOptionsMenu = function() {
        if (this.options) this.options.hook.uwWorld = true;
        if (this.optionsContacts) this.optionsContacts.hook.uwWorld = true;
        return openOpts.apply(this, arguments);
      };
    }
    // Scripted mouse (SET_AUTO_CTRL_MOUSE, used by tutorials that click through menus or
    // aim): positions are 16:9 screen pixels, so shift them into the centered 16:9 area.
    var AC = sc.AutoControl && sc.AutoControl.prototype;
    if (AC && AC.setMouse && !AC.uwPatched) {
      AC.uwPatched = true;
      var setMouse = AC.setMouse;
      AC.setMouse = function(x, y, duration) {
        return setMouse.call(this, x + safeOffset(), y, duration);
      };
    }

    SAFE_SPACE_METHODS.forEach(function(m) {
      var C = lookup(m[0]);
      if (!C || !C.prototype[m[1]]) return;
      var fn = C.prototype[m[1]];
      C.prototype[m[1]] = function() {
        var W = ig.system.width;
        if (W <= BASE) return fn.apply(this, arguments);
        ig.system.width = BASE;
        try { return fn.apply(this, arguments); } finally { ig.system.width = W; }
      };
    });
    // Dialog: the right "off-screen speaker" slot is placed at the screen's right edge
    // in init; put it at the 16:9 edge. Both off-screen slots are meant to sit partly past
    // the edge, so they get a plain shift instead of the push-off-screen treatment.
    fixInstances(ig.MessageAreaGui, function(m) {
      if (m.rightOffEntry && ig.system.width > BASE) m.rightOffEntry.hook.pos.x = BASE - 24;
      if (m.leftOffEntry) m.leftOffEntry.hook.uwNoStretch = true;
      if (m.rightOffEntry) m.rightOffEntry.hook.uwNoStretch = true;
    });
    // Analysis mode (quick menu inspect): the scanline background and the four corner
    // glows belong to the whole screen, not to the 16:9 area.
    fixInstances(sc.QuickMenuAnalysis, function(m) {
      if (m.background) m.background.hook.uwWorld = true;
      (m.corners || []).forEach(function(c) { c.hook.uwWorld = true; });
    });
    // Combat bar: the line and its teal/red end piece are drawn across the full screen
    // width, so the rank display on that end piece and the "skip" box beside it stay at
    // the real screen edge.
    fixInstances(sc.CombatUpperHud, function(m) {
      for (var k in m.sub) if (m.sub[k] && m.sub[k].hook) m.sub[k].hook.uwWorld = true;
    });
    fixInstances(sc.CombatHudGui, function(m) {
      if (m.skipGui) m.skipGui.hook.uwWorld = true;
    });

    // World map markers are laid out in 16:9 coordinates (and drawn shifted into the
    // safe area), but test the mouse against their unshifted position. Shift the mouse
    // into the same space while they check.
    if (sc.AreaButton) {
      var origOver = sc.AreaButton.prototype.isMouseOver;
      sc.AreaButton.prototype.isMouseOver = function() {
        var c = sc.control, getX = c.getMouseX, o = safeOffset();
        if (!o) return origOver.apply(this, arguments);
        c.getMouseX = function() { return getX.apply(c, arguments) - o; };
        try { return origOver.apply(this, arguments); } finally { c.getMouseX = getX; }
      };
    }
    // Gamepad cursor on the world map: start in the middle of the 16:9 map and keep it
    // inside it (the game used the full screen width).
    if (sc.MapWorldMap) {
      var P = sc.MapWorldMap.prototype, origInit = P._initCursor, origLimit = P._limitCursorPos;
      P._initCursor = function(a) {
        if (!safeOffset()) return origInit.apply(this, arguments);
        if (a.x <= -1E4 || a.y <= -1E4) { a.x = BASE / 2; a.y = ig.system.height / 2; }
      };
      P._limitCursorPos = function() {
        origLimit.apply(this, arguments);
        if (!safeOffset()) return;
        var cur = sc.menu.mapWorldCursor;
        cur.x = cur.x.limit(5, BASE - Math.floor(this.cursor.hook.size.x / 2));
      };
    }
  }

  // Parallax map layers (distance != 1: distant sky/sea backdrops, cloud layers...).
  // The game pins a layer's left edge to the view's left edge, so on a wider view the
  // layer drifts left and fixed-size backdrops end before the right edge. Instead:
  // - frame each layer so the middle of the screen shows what the 16:9 view showed,
  //   keeping non-repeating layers inside the screen as far as their size allows;
  // - if a distant non-repeating backdrop is still narrower than the screen, fill the
  //   strips beside it with a mirrored copy of its edge instead of black.
  function patchParallax() {
    var M = ig.ChunkedMap && ig.ChunkedMap.prototype;
    if (!M || M.uwPatched) return;
    M.uwPatched = true;
    var origSet = M.setScreenPos, origDraw = M.draw;
    M.setScreenPos = function(x, y) {
      // Map files may store the distance as a string ("1"), so compare numerically.
      var d = Number(this.distance), o = safeOffset();
      if (!o || !d || d === 1) return origSet.apply(this, arguments);
      // Works at any camera zoom (combat arts zoom in a little):
      //   k  = 1 - 1/zoom
      //   c  = the game's own zoom correction, (W/2 - focus) * k
      //   f  = how far the view's left edge sits past the layer's scroll, focus * k
      // The 16:9 view (left edge x + o, same zoom focus) would show the layer from L0.
      // The wide view is centered on the same layer point, so it starts o/zoom earlier.
      var sys = ig.system, z = sys.zoom || 1, W = sys.width, k = 1 - 1 / z, zf = sys.zoomFocus.x;
      var c0 = (BASE / 2 - (zf - o)) * k;
      var L = (x + o - c0) / d + c0 + (zf - o) * k - o / z;   // wide view's left edge in the layer
      // Distant non-repeating backdrops stay inside the screen as far as their size allows;
      // repeating layers and layers in front of the map (d < 1) are only centered.
      // The correction is worked out at normal zoom and kept while zoomed, so a zoom
      // scales the backdrop around the same point as in the original game instead of
      // sliding it (any edge a zoom-out uncovers is filled by mirrorEdges).
      if (d > 1 && !this.repeat) {
        var spare = this.width * this.tilesize - W, L1 = (x + o) / d - o;
        L += Math.max(Math.min(0, spare), Math.min(Math.max(0, spare), L1)) - L1;
      }
      var s = L - zf * k, c = (W / 2 - zf) * k;
      return origSet.call(this, (s - c) * d + c, y);  // the game computes scroll = (x - c)/d + c
    };
    M.draw = function() {
      var r = origDraw.apply(this, arguments);
      if (Number(this.distance) > 1 && !this.repeat && this.enabled && safeOffset())
        mirrorEdges(this);
      return r;
    };
  }
  // Camera bounds: the game keeps the camera inside the map with
  // x.limit(W/2, mapWidth - W/2). For a map narrower than the screen the limits cross and
  // the map ends up pinned to the right edge (e.g. the 592px Rhombus Square panorama).
  // Center such maps instead.
  function patchCamera() {
    var C = ig.Camera && ig.Camera.prototype;
    if (!C || !C._limitPos || C.uwPatched) return;
    C.uwPatched = true;
    // Settled camera position (same clamp, done inline, with the zoomed view width).
    var origNew = C._getNewPos;
    C._getNewPos = function(pos, rawPos, zoomPos) {
      var r = origNew.apply(this, arguments);
      var mapW = ig.game && ig.game.size && ig.game.size.x;
      if (this._cameraInBounds && safeOffset() && mapW) {
        var t = this.targets.length ? this.targets[this.targets.length - 1] : null;
        var keepFocus = !!(t && t.keepZoomFocusAligned);
        var viewW = ig.system.width / (keepFocus ? 1 : (ig.system.zoom || 1));
        if (mapW < viewW) {
          pos.x = mapW / 2;
          if (!keepFocus && zoomPos) zoomPos.x = pos.x;   // the game copies pos into zoomPos here
        }
      }
      return r;
    };
    // Camera position while moving between targets.
    var orig = C._limitPos;
    C._limitPos = function(pos, zoomPos, withZoom) {
      var r = orig.apply(this, arguments);
      var mapW = ig.game && ig.game.size && ig.game.size.x;
      if (safeOffset() && mapW && mapW < ig.system.width) {
        var dx = mapW / 2 - pos.x;
        pos.x += dx;
        if (withZoom && zoomPos) zoomPos.x += dx;
      }
      return r;
    };
  }
  // Tutorial highlights (sc.TutorialMarkerGui): the marked square is given in 16:9
  // coordinates. Its white frame and pointer box are shifted into the safe area like other
  // HUD elements, but the full-screen dark overlay cut its hole at the unshifted position.
  // - shift the overlay's hole into the safe area;
  // - SHOW_TUTORIAL_PLAYER_MSG measures the player/enemy in real screen coordinates, so
  //   run it in 16:9 space (position and side choice as in the original game) and then
  //   give the marker and overlay their full width back.
  function patchTutorials() {
    var S = sc.TutorialShadowGui && sc.TutorialShadowGui.prototype;
    if (S && !S.uwPatched) {
      S.uwPatched = true;
      var draw = S.updateDrawables;
      S.updateDrawables = function() {
        var o = safeOffset();
        if (!o) return draw.apply(this, arguments);
        this.x += o;
        try { return draw.apply(this, arguments); } finally { this.x -= o; }
      };
    }
    var P = ig.EVENT_STEP && ig.EVENT_STEP.SHOW_TUTORIAL_PLAYER_MSG && ig.EVENT_STEP.SHOW_TUTORIAL_PLAYER_MSG.prototype;
    if (P && !P.uwPatched) {
      P.uwPatched = true;
      var start = P.start;
      P.start = function() {
        var W = ig.system.width, o = safeOffset();
        if (!o) return start.apply(this, arguments);
        var sys = ig.system, toScreen = sys.getScreenFromMapPos, gui = ig.gui, add = gui.addGuiElement, made = [];
        sys.getScreenFromMapPos = function() { var r = toScreen.apply(this, arguments); r.x -= o; return r; };
        gui.addGuiElement = function(g) { made.push(g); return add.apply(this, arguments); };
        sys.width = BASE;
        try { return start.apply(this, arguments); }
        finally {
          sys.width = W; sys.getScreenFromMapPos = toScreen; gui.addGuiElement = add;
          made.forEach(function(g) {
            if (g instanceof sc.TutorialMarkerGui) {
              g.hook.size.x = W;
              if (g.shadowGui) g.shadowGui.hook.size.x = W;
            }
          });
        }
      };
    }
  }
  // Dialog portraits: a portrait is built from parts cut out of a face sheet. If a part's
  // rectangle runs into another part's sprite (the designer's "broken" body is 299px wide
  // on a sheet laid out in 200px columns), the extra sprites get drawn beside the portrait.
  // At 16:9 that overflow fell off the screen edge; in the wider view it is visible.
  // Cut such parts off where the neighbouring sprite starts (checked once per character;
  // across the game's 111 portrait characters this only changes that one part).
  function patchPortraits() {
    var T = sc.MsgGuiTools;
    if (!T || !T.drawPortrait || T.uwPatched) return;
    T.uwPatched = true;
    var draw = T.drawPortrait;
    T.drawPortrait = function(r, expr) {
      try {
        fixFaceParts(expr && expr.character && expr.character.data);
        if (sc.playerSkins && sc.playerSkins.replaceFace) {
          var e2 = sc.playerSkins.replaceFace(expr);
          fixFaceParts(e2 && e2.character && e2.character.data);
        }
      } catch (e) {}
      return draw.apply(this, arguments);
    };
  }
  function fixFaceParts(data) {
    var face = data && data.face;
    if (!face || face.uwChecked || !face.parts) return;
    face.uwChecked = true;
    var rects = [];
    face.parts.forEach(function(group) {
      for (var k in group) {
        var p = group[k];
        if (p && typeof p.srcX === "number") rects.push(p);
      }
    });
    rects.forEach(function(p) {
      var cut = null;
      rects.forEach(function(q) {
        if (q === p || (q.img || "") !== (p.img || "")) return;
        if (q.srcX === p.srcX && q.srcY === p.srcY && q.width === p.width && q.height === p.height) return;
        if (q.srcX > p.srcX && q.srcX < p.srcX + p.width &&
            q.srcY < p.srcY + p.height && p.srcY < q.srcY + q.height) {
          var w = q.srcX - p.srcX;
          cut = cut === null ? w : Math.min(cut, w);
        }
      });
      if (cut !== null) p.width = cut;
    });
  }
  function mirrorEdges(map) {
    var ctx = ig.system.context, cv = ctx && ctx.canvas;
    if (!cv) return;
    var sys = ig.system, z = sys.zoom || 1;
    var Wpx = cv.width, Hpx = cv.height, sc = Wpx / sys.width;  // canvas pixels per game pixel
    var viewX = map.scroll.x + sys.getZoomMinOffset({x: 0, y: 0}).x;  // layer x at the screen's left edge
    var left = Math.round(-viewX * z * sc), layerPx = map.width * map.tilesize * z * sc;
    var right = left + layerPx;
    if (left <= 0 && right >= Wpx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.scale(-1, 1);
    var g = Math.min(left, layerPx);
    if (g > 0) ctx.drawImage(cv, left, 0, g, Hpx, -left, 0, g, Hpx);
    g = Math.min(Wpx - right, layerPx);
    if (g > 0) ctx.drawImage(cv, right - g, 0, g, Hpx, -(right + g), 0, g, Hpx);
    ctx.restore();
  }
  // Runs fn on every future instance of GUI class C (after its init) and on the ones that
  // already exist (most HUD parts are created before this setup runs).
  function fixInstances(C, fn) {
    if (!C || !C.prototype.init) return;
    var init = C.prototype.init;
    C.prototype.init = function() {
      var r = init.apply(this, arguments);
      fn(this);
      return r;
    };
    (function walk(hooks) {
      hooks.forEach(function(h) {
        if (h.gui instanceof C) fn(h.gui);
        walk(h.children);
      });
    })(ig.gui.guiHooks);
  }
  // "sc.QUICK_INFO_BOXES.Enemy" -> the object, or undefined.
  function lookup(path) {
    return path.split(".").reduce(function(o, k){ return o && o[k]; }, window);
  }
  // Left edge of the 16:9 safe area on screen (0 when the screen is not wider than 16:9).
  function safeOffset() {
    var W = ig.system.width;
    return W > BASE ? Math.floor((W - BASE) / 2) : 0;
  }
  function isWorld(hook) {
    if (hook.uwWorld !== undefined && hook.uwWorld !== false) return hook.uwWorld;
    // Area-map pin uses real screen offsets; the world-map cursor (_worldmap) uses 16:9 ones.
    if (sc.MapCursor && hook.gui instanceof sc.MapCursor && !hook.gui._worldmap) return (hook.uwWorld = true);
    for (var i = 0; i < SKIP_CLASSES.length; i++)
      if (hook.gui instanceof SKIP_CLASSES[i]) return (hook.uwWorld = true);
    return false;
  }

  // Called by the GUI system for every element. Returns the element's x position
  // within its parent, or null to keep the game's own positioning.
  // Only elements whose parent spans the whole screen are confined; elements as wide
  // as the screen (fades, backgrounds) are left alone. Set hook.uwFullWidth = true to
  // opt a single element out.
  window.uwX = function(hook, parentW, offsetX) {
    if (!ready) setup();
    var W = ig.system.width;
    if (parentW !== W || W <= BASE || hook.size.x > BASE || hook.uwFullWidth || isWorld(hook)) return null;
    var A = ig.GUI_ALIGN, w = Math.max(hook.size.x, 1), x;
    switch (hook.align.x) {
      case A.X_LEFT:   x = hook.pos.x + offsetX; break;
      case A.X_RIGHT:  x = BASE - hook.size.x - hook.pos.x - offsetX; break;
      case A.X_CENTER: x = Math.floor(BASE / 2 - hook.size.x / 2 + hook.pos.x) + offsetX; break;
      default: return null;
    }
    var o = Math.floor((W - BASE) / 2);
    if (hook.uwNoStretch) return x + o;
    // Inside the box: plain offset. Leaving the box: stretch the motion so an element
    // that would be fully off the 16:9 edge ends up fully off the real screen edge.
    if (x < 0) return x + o - o * Math.min(1, -x / w);
    var over = x + w - BASE;
    if (over > 0) return x + o + o * Math.min(1, over / w);
    return x + o;
  };
})();
