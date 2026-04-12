import { jsx as G, jsxs as Dt } from "react/jsx-runtime";
import E, { createElement as Nt } from "react";
import ao from "react-dom";
const we = 0, Wt = 1, Zt = 2, kn = 4;
function un(t) {
  return () => t;
}
function fo(t) {
  t();
}
function re(t, e) {
  return (n) => t(e(n));
}
function an(t, e) {
  return () => t(e);
}
function mo(t, e) {
  return (n) => t(e, n);
}
function Ae(t) {
  return t !== void 0;
}
function po(...t) {
  return () => {
    t.map(fo);
  };
}
function Xt() {
}
function ye(t, e) {
  return e(t), t;
}
function ho(t, e) {
  return e(t);
}
function ot(...t) {
  return t;
}
function Y(t, e) {
  return t(Wt, e);
}
function _(t, e) {
  t(we, e);
}
function Me(t) {
  t(Zt);
}
function it(t) {
  return t(kn);
}
function L(t, e) {
  return Y(t, mo(e, we));
}
function yt(t, e) {
  const n = t(Wt, (o) => {
    n(), e(o);
  });
  return n;
}
function dn(t) {
  let e, n;
  return (o) => (r) => {
    e = r, n && clearTimeout(n), n = setTimeout(() => {
      o(e);
    }, t);
  };
}
function Ln(t, e) {
  return t === e;
}
function et(t = Ln) {
  let e;
  return (n) => (o) => {
    t(e, o) || (e = o, n(o));
  };
}
function W(t) {
  return (e) => (n) => {
    t(n) && e(n);
  };
}
function B(t) {
  return (e) => re(e, t);
}
function Bt(t) {
  return (e) => () => {
    e(t);
  };
}
function I(t, ...e) {
  const n = go(...e);
  return ((o, r) => {
    switch (o) {
      case Zt:
        Me(t);
        return;
      case Wt:
        return Y(t, n(r));
    }
  });
}
function Ot(t, e) {
  return (n) => (o) => {
    n(e = t(e, o));
  };
}
function $t(t) {
  return (e) => (n) => {
    t > 0 ? t-- : e(n);
  };
}
function zt(t) {
  let e = null, n;
  return (o) => (r) => {
    e = r, !n && (n = setTimeout(() => {
      n = void 0, o(e);
    }, t));
  };
}
function $(...t) {
  const e = new Array(t.length);
  let n = 0, o = null;
  const r = 2 ** t.length - 1;
  return t.forEach((s, i) => {
    const l = 2 ** i;
    Y(s, (c) => {
      const d = n;
      n |= l, e[i] = c, d !== r && n === r && o && (o(), o = null);
    });
  }), (s) => (i) => {
    const l = () => {
      s([i].concat(e));
    };
    n === r ? l() : o = l;
  };
}
function go(...t) {
  return (e) => t.reduceRight(ho, e);
}
function Io(t) {
  let e, n;
  const o = () => e?.();
  return function(r, s) {
    switch (r) {
      case Wt:
        return s ? n === s ? void 0 : (o(), n = s, e = Y(t, s), e) : (o(), Xt);
      case Zt:
        o(), n = null;
        return;
    }
  };
}
function v(t) {
  let e = t;
  const n = U();
  return ((o, r) => {
    switch (o) {
      case we:
        e = r;
        break;
      case Wt: {
        r(e);
        break;
      }
      case kn:
        return e;
    }
    return n(o, r);
  });
}
function ht(t, e) {
  return ye(v(e), (n) => L(t, n));
}
function U() {
  const t = [];
  return ((e, n) => {
    switch (e) {
      case we:
        t.slice().forEach((o) => {
          o(n);
        });
        return;
      case Zt:
        t.splice(0, t.length);
        return;
      case Wt:
        return t.push(n), () => {
          const o = t.indexOf(n);
          o > -1 && t.splice(o, 1);
        };
    }
  });
}
function vt(t) {
  return ye(U(), (e) => L(t, e));
}
function j(t, e = [], { singleton: n } = { singleton: !0 }) {
  return {
    constructor: t,
    dependencies: e,
    id: xo(),
    singleton: n
  };
}
const xo = () => Symbol();
function So(t) {
  const e = /* @__PURE__ */ new Map(), n = ({ constructor: o, dependencies: r, id: s, singleton: i }) => {
    if (i && e.has(s))
      return e.get(s);
    const l = o(r.map((c) => n(c)));
    return i && e.set(s, l), l;
  };
  return n(t);
}
function at(...t) {
  const e = U(), n = new Array(t.length);
  let o = 0;
  const r = 2 ** t.length - 1;
  return t.forEach((s, i) => {
    const l = 2 ** i;
    Y(s, (c) => {
      n[i] = c, o |= l, o === r && _(e, n);
    });
  }), function(s, i) {
    switch (s) {
      case Zt: {
        Me(e);
        return;
      }
      case Wt:
        return o === r && i(n), Y(e, i);
    }
  };
}
function P(t, e = Ln) {
  return I(t, et(e));
}
function ze(...t) {
  return function(e, n) {
    switch (e) {
      case Zt:
        return;
      case Wt:
        return po(...t.map((o) => Y(o, n)));
    }
  };
}
const ft = {
  /** Detailed debugging information including item measurements */
  DEBUG: 0,
  /** General informational messages */
  INFO: 1,
  /** Warning messages for potential issues */
  WARN: 2,
  /** Error messages for failures (default level) */
  ERROR: 3
}, To = {
  [ft.DEBUG]: "debug",
  [ft.ERROR]: "error",
  [ft.INFO]: "log",
  [ft.WARN]: "warn"
}, vo = () => typeof globalThis > "u" ? window : globalThis, Gt = j(
  () => {
    const t = v(ft.ERROR);
    return {
      log: v((n, o, r = ft.INFO) => {
        const s = vo().VIRTUOSO_LOG_LEVEL ?? it(t);
        r >= s && console[To[r]](
          "%creact-virtuoso: %c%s %o",
          "color: #0253b3; font-weight: bold",
          "color: initial",
          n,
          o
        );
      }),
      logLevel: t
    };
  },
  [],
  { singleton: !0 }
);
function kt(t, e, n) {
  return _e(t, e, n).callbackRef;
}
function _e(t, e, n) {
  const o = E.useRef(null);
  let r = (i) => {
  };
  const s = E.useMemo(() => typeof ResizeObserver < "u" ? new ResizeObserver((i) => {
    const l = () => {
      const c = i[0].target;
      c.offsetParent !== null && t(c);
    };
    n ? l() : requestAnimationFrame(l);
  }) : null, [t, n]);
  return r = (i) => {
    i && e ? (s?.observe(i), o.current = i) : (o.current && s?.unobserve(o.current), o.current = null);
  }, { callbackRef: r, ref: o };
}
function zn(t, e, n, o, r, s, i, l, c) {
  const d = E.useCallback(
    (m) => {
      const x = Co(m.children, e, l ? "offsetWidth" : "offsetHeight", r);
      let p = m.parentElement;
      for (; p.dataset.virtuosoScroller === void 0; )
        p = p.parentElement;
      const T = p.lastElementChild.dataset.viewportType === "window";
      let w;
      T && (w = p.ownerDocument.defaultView);
      const R = i ? l ? i.scrollLeft : i.scrollTop : T ? l ? w.scrollX || w.document.documentElement.scrollLeft : w.scrollY || w.document.documentElement.scrollTop : l ? p.scrollLeft : p.scrollTop, h = i ? l ? i.scrollWidth : i.scrollHeight : T ? l ? w.document.documentElement.scrollWidth : w.document.documentElement.scrollHeight : l ? p.scrollWidth : p.scrollHeight, f = i ? l ? i.offsetWidth : i.offsetHeight : T ? l ? w.innerWidth : w.innerHeight : l ? p.offsetWidth : p.offsetHeight;
      o({
        scrollHeight: h,
        scrollTop: Math.max(R, 0),
        viewportHeight: f
      }), s?.(
        l ? fn("column-gap", getComputedStyle(m).columnGap, r) : fn("row-gap", getComputedStyle(m).rowGap, r)
      ), x !== null && t(x);
    },
    [t, e, r, s, i, o, l]
  );
  return _e(d, n, c);
}
function Co(t, e, n, o) {
  const r = t.length;
  if (r === 0)
    return null;
  const s = [];
  for (let i = 0; i < r; i++) {
    const l = t.item(i);
    if (l.dataset.index === void 0)
      continue;
    const c = parseInt(l.dataset.index), d = parseFloat(l.dataset.knownSize), m = e(l, n);
    if (m === 0 && o("Zero-sized element, this should not happen", { child: l }, ft.ERROR), m === d)
      continue;
    const x = s[s.length - 1];
    s.length === 0 || x.size !== m || x.endIndex !== c - 1 ? s.push({ endIndex: c, size: m, startIndex: c }) : s[s.length - 1].endIndex++;
  }
  return s;
}
function fn(t, e, n) {
  return e !== "normal" && e?.endsWith("px") !== !0 && n(`${t} was not resolved to pixel value correctly`, e, ft.WARN), e === "normal" ? 0 : parseInt(e ?? "0", 10);
}
function Ne(t, e, n) {
  const o = E.useRef(null), r = E.useCallback(
    (c) => {
      if (!c?.offsetParent)
        return;
      const d = c.getBoundingClientRect(), m = d.width;
      let x, p;
      if (e) {
        const T = e.getBoundingClientRect(), w = d.top - T.top;
        p = T.height - Math.max(0, w), x = w + e.scrollTop;
      } else {
        const T = i.current.ownerDocument.defaultView;
        p = T.innerHeight - Math.max(0, d.top), x = d.top + T.scrollY;
      }
      o.current = {
        listHeight: d.height,
        offsetTop: x,
        visibleHeight: p,
        visibleWidth: m
      }, t(o.current);
    },
    // oxlint-disable-next-line exhaustive-deps
    [t, e]
  ), { callbackRef: s, ref: i } = _e(r, !0, n), l = E.useCallback(() => {
    r(i.current);
  }, [r, i]);
  return E.useEffect(() => {
    if (e) {
      e.addEventListener("scroll", l);
      const d = new ResizeObserver(() => {
        requestAnimationFrame(l);
      });
      return d.observe(e), () => {
        e.removeEventListener("scroll", l), d.unobserve(e);
      };
    }
    const c = i.current?.ownerDocument.defaultView;
    return c?.addEventListener("scroll", l), c?.addEventListener("resize", l), () => {
      c?.removeEventListener("scroll", l), c?.removeEventListener("resize", l);
    };
  }, [l, e, i]), s;
}
const It = j(
  () => {
    const t = U(), e = U(), n = v(0), o = U(), r = v(0), s = U(), i = U(), l = v(0), c = v(0), d = v(0), m = v(0), x = U(), p = U(), T = v(!1), w = v(!1), R = v(!1);
    return L(
      I(
        t,
        B(({ scrollTop: h }) => h)
      ),
      e
    ), L(
      I(
        t,
        B(({ scrollHeight: h }) => h)
      ),
      i
    ), L(e, r), {
      deviation: n,
      fixedFooterHeight: d,
      fixedHeaderHeight: c,
      footerHeight: m,
      headerHeight: l,
      horizontalDirection: w,
      scrollBy: p,
      // input
      scrollContainerState: t,
      scrollHeight: i,
      scrollingInProgress: T,
      // signals
      scrollTo: x,
      scrollTop: e,
      skipAnimationFrameInResizeObserver: R,
      smoothScrollTargetReached: o,
      // state
      statefulScrollTop: r,
      viewportHeight: s
    };
  },
  [],
  { singleton: !0 }
), se = { lvl: 0 };
function Fn(t, e) {
  const n = t.length;
  if (n === 0)
    return [];
  let { index: o, value: r } = e(t[0]);
  const s = [];
  for (let i = 1; i < n; i++) {
    const { index: l, value: c } = e(t[i]);
    s.push({ end: l - 1, start: o, value: r }), o = l, r = c;
  }
  return s.push({ end: 1 / 0, start: o, value: r }), s;
}
function J(t) {
  return t === se;
}
function ie(t, e) {
  if (!J(t))
    return e === t.k ? t.v : e < t.k ? ie(t.l, e) : ie(t.r, e);
}
function Rt(t, e, n = "k") {
  if (J(t))
    return [-1 / 0, void 0];
  if (Number(t[n]) === e)
    return [t.k, t.v];
  if (Number(t[n]) < e) {
    const o = Rt(t.r, e, n);
    return o[0] === -1 / 0 ? [t.k, t.v] : o;
  }
  return Rt(t.l, e, n);
}
function Tt(t, e, n) {
  return J(t) ? Wn(e, n, 1) : e === t.k ? dt(t, { k: e, v: n }) : e < t.k ? mn(dt(t, { l: Tt(t.l, e, n) })) : mn(dt(t, { r: Tt(t.r, e, n) }));
}
function qt() {
  return se;
}
function Yt(t, e, n) {
  if (J(t))
    return [];
  const o = Rt(t, e)[0];
  return wo(Ve(t, o, n));
}
function Fe(t, e) {
  if (J(t))
    return se;
  const { k: n, l: o, r } = t;
  if (e === n) {
    if (J(o))
      return r;
    if (J(r))
      return o;
    const [s, i] = Pn(o);
    return Se(dt(t, { k: s, l: Vn(o), v: i }));
  }
  return e < n ? Se(dt(t, { l: Fe(o, e) })) : Se(dt(t, { r: Fe(r, e) }));
}
function _t(t) {
  return J(t) ? [] : [..._t(t.l), { k: t.k, v: t.v }, ..._t(t.r)];
}
function Ve(t, e, n) {
  if (J(t))
    return [];
  const { k: o, l: r, r: s, v: i } = t;
  let l = [];
  return o > e && (l = l.concat(Ve(r, e, n))), o >= e && o <= n && l.push({ k: o, v: i }), o <= n && (l = l.concat(Ve(s, e, n))), l;
}
function Se(t) {
  const { l: e, lvl: n, r: o } = t;
  if (o.lvl >= n - 1 && e.lvl >= n - 1)
    return t;
  if (n > o.lvl + 1) {
    if (Ee(e))
      return Gn(dt(t, { lvl: n - 1 }));
    if (!J(e) && !J(e.r))
      return dt(e.r, {
        l: dt(e, { r: e.r.l }),
        lvl: n,
        r: dt(t, {
          l: e.r.r,
          lvl: n - 1
        })
      });
    throw new Error("Unexpected empty nodes");
  }
  if (Ee(t))
    return Pe(dt(t, { lvl: n - 1 }));
  if (!J(o) && !J(o.l)) {
    const r = o.l, s = Ee(r) ? o.lvl - 1 : o.lvl;
    return dt(r, {
      l: dt(t, {
        lvl: n - 1,
        r: r.l
      }),
      lvl: r.lvl + 1,
      r: Pe(dt(o, { l: r.r, lvl: s }))
    });
  }
  throw new Error("Unexpected empty nodes");
}
function dt(t, e) {
  return Wn(
    e.k !== void 0 ? e.k : t.k,
    e.v !== void 0 ? e.v : t.v,
    e.lvl !== void 0 ? e.lvl : t.lvl,
    e.l !== void 0 ? e.l : t.l,
    e.r !== void 0 ? e.r : t.r
  );
}
function Vn(t) {
  return J(t.r) ? t.l : Se(dt(t, { r: Vn(t.r) }));
}
function Ee(t) {
  return J(t) || t.lvl > t.r.lvl;
}
function Pn(t) {
  return J(t.r) ? [t.k, t.v] : Pn(t.r);
}
function Wn(t, e, n, o = se, r = se) {
  return { k: t, l: o, lvl: n, r, v: e };
}
function mn(t) {
  return Pe(Gn(t));
}
function Gn(t) {
  const { l: e } = t;
  return !J(e) && e.lvl === t.lvl ? dt(e, { r: dt(t, { l: e.r }) }) : t;
}
function Pe(t) {
  const { lvl: e, r: n } = t;
  return !J(n) && !J(n.r) && n.lvl === e && n.r.lvl === e ? dt(n, { l: dt(t, { r: n.l }), lvl: e + 1 }) : t;
}
function wo(t) {
  return Fn(t, ({ k: e, v: n }) => ({ index: e, value: n }));
}
function An(t, e) {
  return !!(t && t.startIndex === e.startIndex && t.endIndex === e.endIndex);
}
function le(t, e) {
  return !!(t && t[0] === e[0] && t[1] === e[1]);
}
const De = j(
  () => ({ recalcInProgress: v(!1) }),
  [],
  { singleton: !0 }
);
function Mn(t, e, n) {
  return t[ve(t, e, n)];
}
function ve(t, e, n, o = 0) {
  let r = t.length - 1;
  for (; o <= r; ) {
    const s = Math.floor((o + r) / 2), i = t[s], l = n(i, e);
    if (l === 0)
      return s;
    if (l === -1) {
      if (r - o < 2)
        return s - 1;
      r = s - 1;
    } else {
      if (r === o)
        return s;
      o = s + 1;
    }
  }
  throw new Error(`Failed binary finding record in array - ${t.join(",")}, searched for ${e}`);
}
function yo(t, e, n, o) {
  const r = ve(t, e, o), s = ve(t, n, o, r);
  return t.slice(r, s + 1);
}
function Ht(t, e) {
  return Math.round(t.getBoundingClientRect()[e]);
}
function be(t) {
  return !J(t.groupOffsetTree);
}
function $e({ index: t }, e) {
  return e === t ? 0 : e < t ? -1 : 1;
}
function bo() {
  return {
    groupIndices: [],
    groupOffsetTree: qt(),
    lastIndex: 0,
    lastOffset: 0,
    lastSize: 0,
    offsetTree: [],
    sizeTree: qt()
  };
}
function Ro(t, e) {
  let n = J(t) ? 0 : 1 / 0;
  for (const o of e) {
    const { endIndex: r, size: s, startIndex: i } = o;
    if (n = Math.min(n, i), J(t)) {
      t = Tt(t, 0, s);
      continue;
    }
    const l = Yt(t, i - 1, r + 1);
    if (l.some(zo(o)))
      continue;
    let c = !1, d = !1;
    for (const { end: m, start: x, value: p } of l)
      c ? (r >= x || s === p) && (t = Fe(t, x)) : (d = p !== s, c = !0), m > r && r >= x && p !== s && (t = Tt(t, r + 1, p));
    d && (t = Tt(t, i, s));
  }
  return [t, n];
}
function Ho(t) {
  return typeof t.groupIndex < "u";
}
function Eo({ offset: t }, e) {
  return e === t ? 0 : e < t ? -1 : 1;
}
function ce(t, e, n) {
  if (e.length === 0)
    return 0;
  const { index: o, offset: r, size: s } = Mn(e, t, $e), i = t - o, l = s * i + (i - 1) * n + r;
  return l > 0 ? l + n : l;
}
function _n(t, e) {
  if (!be(e))
    return t;
  let n = 0;
  for (; e.groupIndices[n] <= t + n; )
    n++;
  return t + n;
}
function Nn(t, e, n) {
  if (Ho(t))
    return e.groupIndices[t.groupIndex] + 1;
  const o = t.index === "LAST" ? n : t.index;
  let r = _n(o, e);
  return r = Math.max(0, r, Math.min(n, r)), r;
}
function Bo(t, e, n, o = 0) {
  return o > 0 && (e = Math.max(e, Mn(t, o, $e).offset)), Fn(yo(t, e, n, Eo), Lo);
}
function Oo(t, [e, n, o, r]) {
  e.length > 0 && o("received item sizes", e, ft.DEBUG);
  const s = t.sizeTree;
  let i = s, l = 0;
  if (n.length > 0 && J(s) && e.length === 2) {
    const p = e[0].size, T = e[1].size;
    i = n.reduce((w, R) => Tt(Tt(w, R, p), R + 1, T), i);
  } else
    [i, l] = Ro(i, e);
  if (i === s)
    return t;
  const { lastIndex: c, lastOffset: d, lastSize: m, offsetTree: x } = We(t.offsetTree, l, i, r);
  return {
    groupIndices: n,
    groupOffsetTree: n.reduce((p, T) => Tt(p, T, ce(T, x, r)), qt()),
    lastIndex: c,
    lastOffset: d,
    lastSize: m,
    offsetTree: x,
    sizeTree: i
  };
}
function ko(t) {
  return _t(t).map(({ k: e, v: n }, o, r) => {
    const s = r[o + 1];
    return { endIndex: s !== void 0 ? s.k - 1 : 1 / 0, size: n, startIndex: e };
  });
}
function pn(t, e) {
  let n = 0, o = 0;
  for (; n < t; )
    n += e[o + 1] - e[o] - 1, o++;
  return o - (n === t ? 0 : 1);
}
function We(t, e, n, o) {
  let r = t, s = 0, i = 0, l = 0, c = 0;
  if (e !== 0) {
    c = ve(r, e - 1, $e), l = r[c].offset;
    const m = Rt(n, e - 1);
    s = m[0], i = m[1], r.length && r[c].size === Rt(n, e)[1] && (c -= 1), r = r.slice(0, c + 1);
  } else
    r = [];
  for (const { start: d, value: m } of Yt(n, e, 1 / 0)) {
    const x = d - s, p = x * i + l + x * o;
    r.push({
      index: d,
      offset: p,
      size: m
    }), s = d, l = p, i = m;
  }
  return {
    lastIndex: s,
    lastOffset: l,
    lastSize: i,
    offsetTree: r
  };
}
function Lo(t) {
  return { index: t.index, value: t };
}
function zo(t) {
  const { endIndex: e, size: n, startIndex: o } = t;
  return (r) => r.start === o && (r.end === e || r.end === 1 / 0) && r.value === n;
}
const Fo = {
  offsetHeight: "height",
  offsetWidth: "width"
}, Lt = j(
  ([{ log: t }, { recalcInProgress: e }]) => {
    const n = U(), o = U(), r = ht(o, 0), s = U(), i = U(), l = v(0), c = v([]), d = v(void 0), m = v(void 0), x = v(void 0), p = v(void 0), T = v((u, g) => Ht(u, Fo[g])), w = v(void 0), R = v(0), h = bo(), f = ht(
      I(n, $(c, t, R), Ot(Oo, h), et()),
      h
    ), a = ht(
      I(
        c,
        et(),
        Ot((u, g) => ({ current: g, prev: u.current }), {
          current: [],
          prev: []
        }),
        B(({ prev: u }) => u)
      ),
      []
    );
    L(
      I(
        c,
        W((u) => u.length > 0),
        $(f, R),
        B(([u, g, C]) => {
          const z = u.reduce((O, V, N) => Tt(O, V, ce(V, g.offsetTree, C) || N), qt());
          return {
            ...g,
            groupIndices: u,
            groupOffsetTree: z
          };
        })
      ),
      f
    ), L(
      I(
        o,
        $(f),
        W(([u, { lastIndex: g }]) => u < g),
        B(([u, { lastIndex: g, lastSize: C }]) => [
          {
            endIndex: g,
            size: C,
            startIndex: u
          }
        ])
      ),
      n
    ), L(d, m);
    const S = ht(
      I(
        d,
        B((u) => u === void 0)
      ),
      !0
    );
    L(
      I(
        m,
        W((u) => u !== void 0 && J(it(f).sizeTree)),
        B((u) => {
          const g = it(x), C = it(c).length > 0;
          return g !== void 0 && g !== 0 ? C ? [
            { endIndex: 0, size: g, startIndex: 0 },
            { endIndex: 1, size: u, startIndex: 1 }
          ] : [] : [{ endIndex: 0, size: u, startIndex: 0 }];
        })
      ),
      n
    ), L(
      I(
        p,
        W((u) => u !== void 0 && u.length > 0 && J(it(f).sizeTree)),
        B((u) => {
          const g = [];
          let C = u[0], z = 0;
          for (let O = 1; O < u.length; O++) {
            const V = u[O];
            V !== C && (g.push({
              endIndex: O - 1,
              size: C,
              startIndex: z
            }), C = V, z = O);
          }
          return g.push({
            endIndex: u.length - 1,
            size: C,
            startIndex: z
          }), g;
        })
      ),
      n
    ), L(
      I(
        c,
        $(x, m),
        W(([, u, g]) => u !== void 0 && g !== void 0),
        B(([u, g, C]) => {
          const z = [];
          for (let O = 0; O < u.length; O++) {
            const V = u[O], N = u[O + 1];
            z.push({
              startIndex: V,
              endIndex: V,
              size: g
            }), N !== void 0 && z.push({
              startIndex: V + 1,
              endIndex: N - 1,
              size: C
            });
          }
          return z;
        })
      ),
      n
    );
    const H = vt(
      I(
        n,
        $(f),
        Ot(
          ({ sizes: u }, [g, C]) => ({
            changed: C !== u,
            sizes: C
          }),
          { changed: !1, sizes: h }
        ),
        B((u) => u.changed)
      )
    );
    Y(
      I(
        l,
        Ot(
          (u, g) => ({ diff: u.prev - g, prev: g }),
          { diff: 0, prev: 0 }
        ),
        B((u) => u.diff)
      ),
      (u) => {
        const { groupIndices: g } = it(f);
        if (u > 0)
          _(e, !0), _(s, u + pn(u, g));
        else if (u < 0) {
          const C = it(a);
          C.length > 0 && (u -= pn(-u, C)), _(i, u);
        }
      }
    ), Y(I(l, $(t)), ([u, g]) => {
      u < 0 && g(
        "`firstItemIndex` prop should not be set to less than zero. If you don't know the total count, just use a very high value",
        { firstItemIndex: l },
        ft.ERROR
      );
    });
    const y = vt(s);
    L(
      I(
        s,
        $(f),
        B(([u, g]) => {
          const C = g.groupIndices.length > 0, z = [], O = g.lastSize;
          if (C) {
            const V = ie(g.sizeTree, 0);
            let N = 0, Z = 0;
            for (; N < u; ) {
              const q = g.groupIndices[Z], Q = g.groupIndices.length === Z + 1 ? 1 / 0 : g.groupIndices[Z + 1] - q - 1;
              z.push({
                endIndex: q,
                size: V,
                startIndex: q
              }), z.push({
                endIndex: q + 1 + Q - 1,
                size: O,
                startIndex: q + 1
              }), Z++, N += Q + 1;
            }
            const F = _t(g.sizeTree);
            return N !== u && F.shift(), F.reduce(
              (q, { k: Q, v: gt }) => {
                let ut = q.ranges;
                return q.prevSize !== 0 && (ut = [
                  ...q.ranges,
                  {
                    endIndex: Q + u - 1,
                    size: q.prevSize,
                    startIndex: q.prevIndex
                  }
                ]), {
                  prevIndex: Q + u,
                  prevSize: gt,
                  ranges: ut
                };
              },
              {
                prevIndex: u,
                prevSize: 0,
                ranges: z
              }
            ).ranges;
          }
          return _t(g.sizeTree).reduce(
            (V, { k: N, v: Z }) => ({
              prevIndex: N + u,
              prevSize: Z,
              ranges: [...V.ranges, { endIndex: N + u - 1, size: V.prevSize, startIndex: V.prevIndex }]
            }),
            {
              prevIndex: 0,
              prevSize: O,
              ranges: []
            }
          ).ranges;
        })
      ),
      n
    );
    const k = vt(
      I(
        i,
        $(f, R),
        B(([u, { offsetTree: g }, C]) => {
          const z = -u;
          return ce(z, g, C);
        })
      )
    );
    return L(
      I(
        i,
        $(f, R),
        B(([u, g, C]) => {
          if (g.groupIndices.length > 0) {
            if (J(g.sizeTree))
              return g;
            let V = qt();
            const N = it(a);
            let Z = 0, F = 0, mt = 0;
            for (; Z < -u; ) {
              mt = N[F];
              const Q = N[F + 1] - mt - 1;
              F++, Z += Q + 1;
            }
            if (V = _t(g.sizeTree).reduce((Q, { k: gt, v: ut }) => Tt(Q, Math.max(0, gt + u), ut), V), Z !== -u) {
              const Q = ie(g.sizeTree, mt);
              V = Tt(V, 0, Q);
              const gt = Rt(g.sizeTree, -u + 1)[1];
              V = Tt(V, 1, gt);
            }
            return {
              ...g,
              sizeTree: V,
              ...We(g.offsetTree, 0, V, C)
            };
          }
          const O = _t(g.sizeTree).reduce((V, { k: N, v: Z }) => Tt(V, Math.max(0, N + u), Z), qt());
          return {
            ...g,
            sizeTree: O,
            ...We(g.offsetTree, 0, O, C)
          };
        })
      ),
      f
    ), {
      beforeUnshiftWith: y,
      // input
      data: w,
      defaultItemSize: m,
      firstItemIndex: l,
      fixedItemSize: d,
      fixedGroupSize: x,
      gap: R,
      groupIndices: c,
      heightEstimates: p,
      itemSize: T,
      listRefresh: H,
      shiftWith: i,
      shiftWithOffset: k,
      sizeRanges: n,
      // output
      sizes: f,
      statefulTotalCount: r,
      totalCount: o,
      trackItemSizes: S,
      unshiftWith: s
    };
  },
  ot(Gt, De),
  { singleton: !0 }
);
function Vo(t) {
  return t.reduce(
    (e, n) => (e.groupIndices.push(e.totalCount), e.totalCount += n + 1, e),
    {
      groupIndices: [],
      totalCount: 0
    }
  );
}
const Dn = j(
  ([{ groupIndices: t, sizes: e, totalCount: n }, { headerHeight: o, scrollTop: r }]) => {
    const s = U(), i = U(), l = vt(I(s, B(Vo)));
    return L(
      I(
        l,
        B((c) => c.totalCount)
      ),
      n
    ), L(
      I(
        l,
        B((c) => c.groupIndices)
      ),
      t
    ), L(
      I(
        at(r, e, o),
        W(([c, d]) => be(d)),
        B(([c, d, m]) => Rt(d.groupOffsetTree, Math.max(c - m, 0), "v")[0]),
        et(),
        B((c) => [c])
      ),
      i
    ), { groupCounts: s, topItemsIndexes: i };
  },
  ot(Lt, It)
), At = j(
  ([{ log: t }]) => {
    const e = v(!1), n = vt(
      I(
        e,
        W((o) => o),
        et()
      )
    );
    return Y(e, (o) => {
      o && it(t)("props updated", {}, ft.DEBUG);
    }), { didMount: n, propsReady: e };
  },
  ot(Gt),
  { singleton: !0 }
), Po = typeof document < "u" && "scrollBehavior" in document.documentElement.style;
function $n(t) {
  const e = typeof t == "number" ? { index: t } : t;
  return e.align || (e.align = "start"), (!e.behavior || !Po) && (e.behavior = "auto"), e.offset === void 0 && (e.offset = 0), e;
}
const fe = j(
  ([
    { gap: t, listRefresh: e, sizes: n, totalCount: o },
    {
      fixedFooterHeight: r,
      fixedHeaderHeight: s,
      footerHeight: i,
      headerHeight: l,
      scrollingInProgress: c,
      scrollTo: d,
      smoothScrollTargetReached: m,
      viewportHeight: x
    },
    { log: p }
  ]) => {
    const T = U(), w = U(), R = v(0);
    let h = null, f = null, a = null;
    function S() {
      h !== null && (h(), h = null), a !== null && (a(), a = null), f && (clearTimeout(f), f = null), _(c, !1);
    }
    return L(
      I(
        T,
        $(n, x, o, R, l, i, p),
        $(t, s, r),
        B(
          ([
            [H, y, k, u, g, C, z, O],
            V,
            N,
            Z
          ]) => {
            const F = $n(H), { align: mt, behavior: q, offset: Q } = F, gt = u - 1, ut = Nn(F, y, gt);
            let xt = ce(ut, y.offsetTree, V) + C;
            mt === "end" ? (xt += N + Rt(y.sizeTree, ut)[1] - k + Z, ut === gt && (xt += z)) : mt === "center" ? xt += (N + Rt(y.sizeTree, ut)[1] - k + Z) / 2 : xt -= g, Q !== void 0 && Q !== 0 && (xt += Q);
            const Ft = (pt) => {
              S(), pt ? (O("retrying to scroll to", { location: H }, ft.DEBUG), _(T, H)) : (_(w, !0), O("list did not change, scroll successful", {}, ft.DEBUG));
            };
            if (S(), q === "smooth") {
              let pt = !1;
              a = Y(e, (Kt) => {
                pt = pt || Kt;
              }), h = yt(m, () => {
                Ft(pt);
              });
            } else
              h = yt(I(e, Wo(150)), Ft);
            return f = setTimeout(() => {
              S();
            }, 1200), _(c, !0), O("scrolling from index to", { behavior: q, index: ut, top: xt }, ft.DEBUG), { behavior: q, top: xt };
          }
        )
      ),
      d
    ), {
      scrollTargetReached: w,
      scrollToIndex: T,
      topListHeight: R
    };
  },
  ot(Lt, It, Gt),
  { singleton: !0 }
);
function Wo(t) {
  return (e) => {
    const n = setTimeout(() => {
      e(!1);
    }, t);
    return (o) => {
      o && (e(!0), clearTimeout(n));
    };
  };
}
function Ue(t, e) {
  t === 0 ? e() : requestAnimationFrame(() => {
    Ue(t - 1, e);
  });
}
function Ke(t, e) {
  const n = e - 1;
  return typeof t == "number" ? t : t.index === "LAST" ? n : t.index;
}
const me = j(
  ([{ defaultItemSize: t, listRefresh: e, sizes: n }, { scrollTop: o }, { scrollTargetReached: r, scrollToIndex: s }, { didMount: i }]) => {
    const l = v(!0), c = v(0), d = v(!0);
    return L(
      I(
        i,
        $(c),
        W(([m, x]) => x !== 0),
        Bt(!1)
      ),
      l
    ), L(
      I(
        i,
        $(c),
        W(([m, x]) => x !== 0),
        Bt(!1)
      ),
      d
    ), Y(
      I(
        at(e, i),
        $(l, n, t, d),
        W(([[, m], x, { sizeTree: p }, T, w]) => m && (!J(p) || Ae(T)) && !x && !w),
        $(c)
      ),
      ([, m]) => {
        yt(r, () => {
          _(d, !0);
        }), Ue(4, () => {
          yt(o, () => {
            _(l, !0);
          }), _(s, m);
        });
      }
    ), {
      initialItemFinalLocationReached: d,
      initialTopMostItemIndex: c,
      scrolledToInitialItem: l
    };
  },
  ot(Lt, It, fe, At),
  { singleton: !0 }
);
function Un(t, e) {
  return Math.abs(t - e) < 1.01;
}
const ue = "up", ne = "down", Go = "none", Ao = {
  atBottom: !1,
  notAtBottomBecause: "NOT_SHOWING_LAST_ITEM",
  state: {
    offsetBottom: 0,
    scrollHeight: 0,
    scrollTop: 0,
    viewportHeight: 0
  }
}, Mo = 0, pe = j(([{ footerHeight: t, headerHeight: e, scrollBy: n, scrollContainerState: o, scrollTop: r, viewportHeight: s }]) => {
  const i = v(!1), l = v(!0), c = U(), d = U(), m = v(4), x = v(Mo), p = ht(
    I(
      ze(I(P(r), $t(1), Bt(!0)), I(P(r), $t(1), Bt(!1), dn(100))),
      et()
    ),
    !1
  ), T = ht(
    I(ze(I(n, Bt(!0)), I(n, Bt(!1), dn(200))), et()),
    !1
  );
  L(
    I(
      at(P(r), P(x)),
      B(([a, S]) => a <= S),
      et()
    ),
    l
  ), L(I(l, zt(50)), d);
  const w = vt(
    I(
      at(o, P(s), P(e), P(t), P(m)),
      Ot((a, [{ scrollHeight: S, scrollTop: H }, y, k, u, g]) => {
        const C = H + y - S > -g, z = {
          scrollHeight: S,
          scrollTop: H,
          viewportHeight: y
        };
        if (C) {
          let V, N;
          return H > a.state.scrollTop ? (V = "SCROLLED_DOWN", N = a.state.scrollTop - H) : (V = "SIZE_DECREASED", N = a.state.scrollTop - H || a.scrollTopDelta), {
            atBottom: !0,
            atBottomBecause: V,
            scrollTopDelta: N,
            state: z
          };
        }
        let O;
        return z.scrollHeight > a.state.scrollHeight ? O = "SIZE_INCREASED" : y < a.state.viewportHeight ? O = "VIEWPORT_HEIGHT_DECREASING" : H < a.state.scrollTop ? O = "SCROLLING_UPWARDS" : O = "NOT_FULLY_SCROLLED_TO_LAST_ITEM_BOTTOM", {
          atBottom: !1,
          notAtBottomBecause: O,
          state: z
        };
      }, Ao),
      et((a, S) => a !== void 0 && a.atBottom === S.atBottom)
    )
  ), R = ht(
    I(
      o,
      Ot(
        (a, { scrollHeight: S, scrollTop: H, viewportHeight: y }) => {
          if (!Un(a.scrollHeight, S)) {
            const k = S - (H + y) < 1;
            return a.scrollTop !== H && k ? {
              changed: !0,
              jump: a.scrollTop - H,
              scrollHeight: S,
              scrollTop: H
            } : {
              changed: !0,
              jump: 0,
              scrollHeight: S,
              scrollTop: H
            };
          }
          return {
            changed: !1,
            jump: 0,
            scrollHeight: S,
            scrollTop: H
          };
        },
        { changed: !1, jump: 0, scrollHeight: 0, scrollTop: 0 }
      ),
      W((a) => a.changed),
      B((a) => a.jump)
    ),
    0
  );
  L(
    I(
      w,
      B((a) => a.atBottom)
    ),
    i
  ), L(I(i, zt(50)), c);
  const h = v(ne);
  L(
    I(
      o,
      B(({ scrollTop: a }) => a),
      et(),
      Ot(
        (a, S) => it(T) ? { direction: a.direction, prevScrollTop: S } : { direction: S < a.prevScrollTop ? ue : ne, prevScrollTop: S },
        { direction: ne, prevScrollTop: 0 }
      ),
      B((a) => a.direction)
    ),
    h
  ), L(I(o, zt(50), Bt(Go)), h);
  const f = v(0);
  return L(
    I(
      p,
      W((a) => !a),
      Bt(0)
    ),
    f
  ), L(
    I(
      r,
      zt(100),
      $(p),
      W(([a, S]) => S),
      Ot(([a, S], [H]) => [S, H], [0, 0]),
      B(([a, S]) => S - a)
    ),
    f
  ), {
    atBottomState: w,
    atBottomStateChange: c,
    atBottomThreshold: m,
    atTopStateChange: d,
    atTopThreshold: x,
    isAtBottom: i,
    isAtTop: l,
    isScrolling: p,
    lastJumpDueToItemResize: R,
    scrollDirection: h,
    scrollVelocity: f
  };
}, ot(It)), ae = "top", de = "bottom", hn = "none";
function gn(t, e, n) {
  return typeof t == "number" ? n === ue && e === ae || n === ne && e === de ? t : 0 : n === ue ? e === ae ? t.main : t.reverse : e === de ? t.main : t.reverse;
}
function In(t, e) {
  return typeof t == "number" ? t : t[e] ?? 0;
}
const je = j(
  ([{ deviation: t, fixedHeaderHeight: e, headerHeight: n, scrollTop: o, viewportHeight: r }]) => {
    const s = U(), i = v(0), l = v(0), c = v(0), d = ht(
      I(
        at(
          P(o),
          P(r),
          P(n),
          P(s, le),
          P(c),
          P(i),
          P(e),
          P(t),
          P(l)
        ),
        B(
          ([
            m,
            x,
            p,
            [T, w],
            R,
            h,
            f,
            a,
            S
          ]) => {
            const H = m - a, y = h + f, k = Math.max(p - H, 0);
            let u = hn;
            const g = In(S, ae), C = In(S, de);
            return T -= a, T += p + f, w += p + f, w -= a, T > m + y - g && (u = ue), w < m - k + x + C && (u = ne), u !== hn ? [
              Math.max(H - p - gn(R, ae, u) - g, 0),
              H - k - f + x + gn(R, de, u) + C
            ] : null;
          }
        ),
        W((m) => m !== null),
        et(le)
      ),
      [0, 0]
    );
    return {
      increaseViewportBy: l,
      // input
      listBoundary: s,
      overscan: c,
      topListHeight: i,
      // output
      visibleRange: d
    };
  },
  ot(It),
  { singleton: !0 }
);
function _o(t, e, n) {
  if (be(e)) {
    const o = _n(t, e);
    return [
      { index: Rt(e.groupOffsetTree, o)[0], offset: 0, size: 0 },
      { data: n?.[0], index: o, offset: 0, size: 0 }
    ];
  }
  return [{ data: n?.[0], index: t, offset: 0, size: 0 }];
}
const Be = {
  bottom: 0,
  firstItemIndex: 0,
  items: [],
  offsetBottom: 0,
  offsetTop: 0,
  top: 0,
  topItems: [],
  topListHeight: 0,
  totalCount: 0
};
function Te(t, e, n, o, r, s) {
  const { lastIndex: i, lastOffset: l, lastSize: c } = r;
  let d = 0, m = 0;
  if (t.length > 0) {
    d = t[0].offset;
    const R = t[t.length - 1];
    m = R.offset + R.size;
  }
  const x = n - i, p = l + x * c + (x - 1) * o, T = d, w = p - m;
  return {
    bottom: m,
    firstItemIndex: s,
    items: xn(t, r, s),
    offsetBottom: w,
    offsetTop: d,
    top: T,
    topItems: xn(e, r, s),
    topListHeight: e.reduce((R, h) => h.size + R, 0),
    totalCount: n
  };
}
function Kn(t, e, n, o, r, s) {
  let i = 0;
  if (n.groupIndices.length > 0)
    for (const m of n.groupIndices) {
      if (m - i >= t)
        break;
      i++;
    }
  const l = t + i, c = Ke(e, l), d = Array.from({ length: l }).map((m, x) => ({
    data: s[x + c],
    index: x + c,
    offset: 0,
    size: 0
  }));
  return Te(d, [], l, r, n, o);
}
function xn(t, e, n) {
  if (t.length === 0)
    return [];
  if (!be(e))
    return t.map((d) => ({ ...d, index: d.index + n, originalIndex: d.index }));
  const o = t[0].index, r = t[t.length - 1].index, s = [], i = Yt(e.groupOffsetTree, o, r);
  let l, c = 0;
  for (const d of t) {
    (!l || l.end < d.index) && (l = i.shift(), c = e.groupIndices.indexOf(l.start));
    let m;
    d.index === l.start ? m = {
      index: c,
      type: "group"
    } : m = {
      groupIndex: c,
      index: d.index - (c + 1) + n
    }, s.push({
      ...m,
      data: d.data,
      offset: d.offset,
      originalIndex: d.index,
      size: d.size
    });
  }
  return s;
}
function Sn(t, e) {
  return t === void 0 ? 0 : typeof t == "number" ? t : t[e] ?? 0;
}
const Ut = j(
  ([
    { data: t, firstItemIndex: e, gap: n, sizes: o, totalCount: r },
    s,
    { listBoundary: i, topListHeight: l, visibleRange: c },
    { initialTopMostItemIndex: d, scrolledToInitialItem: m },
    { topListHeight: x },
    p,
    { didMount: T },
    { recalcInProgress: w }
  ]) => {
    const R = v([]), h = v(0), f = U(), a = v(0);
    L(s.topItemsIndexes, R);
    const S = ht(
      I(
        at(
          T,
          w,
          P(c, le),
          P(r),
          P(o),
          P(d),
          m,
          P(R),
          P(e),
          P(n),
          P(a),
          t
        ),
        W(([u, g, , C, , , , , , , , z]) => {
          const O = z !== void 0 && z.length !== C;
          return u && !g && !O;
        }),
        B(
          ([
            ,
            ,
            [u, g],
            C,
            z,
            O,
            V,
            N,
            Z,
            F,
            mt,
            q
          ]) => {
            const Q = z, { offsetTree: gt, sizeTree: ut } = Q, xt = it(h);
            if (C === 0)
              return { ...Be, totalCount: C };
            if (u === 0 && g === 0)
              return xt === 0 ? { ...Be, totalCount: C } : Kn(xt, O, z, Z, F, q || []);
            if (J(ut))
              return xt > 0 ? null : Te(
                _o(Ke(O, C), Q, q),
                [],
                C,
                F,
                Q,
                Z
              );
            const Ft = [];
            if (N.length > 0) {
              const D = N[0], K = N[N.length - 1];
              let rt = 0;
              for (const tt of Yt(ut, D, K)) {
                const X = tt.value, lt = Math.max(tt.start, D), St = Math.min(tt.end, K);
                for (let ct = lt; ct <= St; ct++)
                  Ft.push({ data: q?.[ct], index: ct, offset: rt, size: X }), rt += X;
              }
            }
            if (!V)
              return Te([], Ft, C, F, Q, Z);
            const pt = N.length > 0 ? N[N.length - 1] + 1 : 0, Kt = Bo(gt, u, g, pt);
            if (Kt.length === 0)
              return null;
            const Qt = C - 1, Et = ye([], (D) => {
              for (const K of Kt) {
                const rt = K.value;
                let tt = rt.offset, X = K.start;
                const lt = rt.size;
                if (rt.offset < u) {
                  X += Math.floor((u - rt.offset + F) / (lt + F));
                  const ct = X - K.start;
                  tt += ct * lt + ct * F;
                }
                X < pt && (tt += (pt - X) * lt, X = pt);
                const St = Math.min(K.end, Qt);
                for (let ct = X; ct <= St && !(tt >= g); ct++)
                  D.push({ data: q?.[ct], index: ct, offset: tt, size: lt }), tt += lt + F;
              }
            }), te = Sn(mt, ae), b = Sn(mt, de);
            if (Et.length > 0 && (te > 0 || b > 0)) {
              const D = Et[0], K = Et[Et.length - 1];
              if (te > 0 && D.index > pt) {
                const rt = Math.min(te, D.index - pt), tt = [];
                let X = D.offset;
                for (let lt = D.index - 1; lt >= D.index - rt; lt--) {
                  const ct = Yt(ut, lt, lt)[0]?.value ?? D.size;
                  X -= ct + F, tt.unshift({ data: q?.[lt], index: lt, offset: X, size: ct });
                }
                Et.unshift(...tt);
              }
              if (b > 0 && K.index < Qt) {
                const rt = Math.min(b, Qt - K.index);
                let tt = K.offset + K.size + F;
                for (let X = K.index + 1; X <= K.index + rt; X++) {
                  const St = Yt(ut, X, X)[0]?.value ?? K.size;
                  Et.push({ data: q?.[X], index: X, offset: tt, size: St }), tt += St + F;
                }
              }
            }
            return Te(Et, Ft, C, F, Q, Z);
          }
        ),
        //@ts-expect-error filter needs to be fixed
        W((u) => u !== null),
        et()
      ),
      Be
    );
    L(
      I(
        t,
        W(Ae),
        B((u) => u?.length)
      ),
      r
    ), L(
      I(
        S,
        B((u) => u.topListHeight)
      ),
      x
    ), L(x, l), L(
      I(
        S,
        B((u) => [u.top, u.bottom])
      ),
      i
    ), L(
      I(
        S,
        B((u) => u.items)
      ),
      f
    );
    const H = vt(
      I(
        S,
        W(({ items: u }) => u.length > 0),
        $(r, t),
        W(([{ items: u }, g]) => u[u.length - 1].originalIndex === g - 1),
        B(([, u, g]) => [u - 1, g]),
        et(le),
        B(([u]) => u)
      )
    ), y = vt(
      I(
        S,
        zt(200),
        W(({ items: u, topItems: g }) => u.length > 0 && u[0].originalIndex === g.length),
        B(({ items: u }) => u[0].index),
        et()
      )
    ), k = vt(
      I(
        S,
        W(({ items: u }) => u.length > 0),
        B(({ items: u }) => {
          let g = 0, C = u.length - 1;
          for (; u[g].type === "group" && g < C; )
            g++;
          for (; u[C].type === "group" && C > g; )
            C--;
          return {
            endIndex: u[C].index,
            startIndex: u[g].index
          };
        }),
        et(An)
      )
    );
    return {
      endReached: H,
      initialItemCount: h,
      itemsRendered: f,
      listState: S,
      minOverscanItemCount: a,
      rangeChanged: k,
      startReached: y,
      topItemsIndexes: R,
      ...p
    };
  },
  ot(
    Lt,
    Dn,
    je,
    me,
    fe,
    pe,
    At,
    De
  ),
  { singleton: !0 }
), jn = j(
  ([{ fixedFooterHeight: t, fixedHeaderHeight: e, footerHeight: n, headerHeight: o }, { listState: r }]) => {
    const s = U(), i = ht(
      I(
        at(n, t, o, e, r),
        B(([l, c, d, m, x]) => l + c + d + m + x.offsetBottom + x.bottom)
      ),
      0
    );
    return L(P(i), s), { totalListHeight: i, totalListHeightChanged: s };
  },
  ot(It, Ut),
  { singleton: !0 }
), No = j(
  ([{ viewportHeight: t }, { totalListHeight: e }]) => {
    const n = v(!1), o = ht(
      I(
        at(n, t, e),
        W(([r]) => r),
        B(([, r, s]) => Math.max(0, r - s)),
        zt(0),
        et()
      ),
      0
    );
    return { alignToBottom: n, paddingTopAddition: o };
  },
  ot(It, jn),
  { singleton: !0 }
), qn = j(() => ({
  context: v(null)
})), Do = ({
  itemBottom: t,
  itemTop: e,
  locationParams: { align: n, behavior: o, ...r },
  viewportBottom: s,
  viewportTop: i
}) => e < i ? { ...r, align: n ?? "start", ...o !== void 0 ? { behavior: o } : {} } : t > s ? { ...r, align: n ?? "end", ...o !== void 0 ? { behavior: o } : {} } : null, Yn = j(
  ([
    { gap: t, sizes: e, totalCount: n },
    { fixedFooterHeight: o, fixedHeaderHeight: r, headerHeight: s, scrollingInProgress: i, scrollTop: l, viewportHeight: c },
    { scrollToIndex: d }
  ]) => {
    const m = U();
    return L(
      I(
        m,
        $(e, c, n, s, r, o, l),
        $(t),
        B(([[x, p, T, w, R, h, f, a], S]) => {
          const { calculateViewLocation: H = Do, done: y, ...k } = x, u = Nn(x, p, w - 1), g = ce(u, p.offsetTree, S) + R + h, C = g + Rt(p.sizeTree, u)[1], z = a + h, O = a + T - f, V = H({
            itemBottom: C,
            itemTop: g,
            locationParams: k,
            viewportBottom: O,
            viewportTop: z
          });
          return V !== null ? y && yt(
            I(
              i,
              W((N) => !N),
              // skips the initial publish of false, and the cleanup call.
              // but if scrollingInProgress is true, we skip the initial publish.
              $t(it(i) ? 1 : 2)
            ),
            y
          ) : y?.(), V;
        }),
        W((x) => x !== null)
      ),
      d
    ), {
      scrollIntoView: m
    };
  },
  ot(Lt, It, fe, Ut, Gt),
  { singleton: !0 }
);
function Tn(t) {
  return t === !1 ? !1 : t === "smooth" ? "smooth" : "auto";
}
const $o = (t, e) => typeof t == "function" ? Tn(t(e)) : e && Tn(t), Uo = j(
  ([
    { listRefresh: t, totalCount: e, fixedItemSize: n, data: o },
    { atBottomState: r, isAtBottom: s },
    { scrollToIndex: i },
    { scrolledToInitialItem: l },
    { didMount: c, propsReady: d },
    { log: m },
    { scrollingInProgress: x },
    { context: p },
    { scrollIntoView: T }
  ]) => {
    const w = v(!1), R = U();
    let h = null;
    function f(y) {
      _(i, {
        align: "end",
        behavior: y,
        index: "LAST"
      });
    }
    Y(
      I(
        at(I(P(e), $t(1)), c),
        $(P(w), s, l, x),
        B(([[y, k], u, g, C, z]) => {
          let O = k && C, V = "auto";
          return O && (V = $o(u, g || z), O = O && V !== !1), { followOutputBehavior: V, shouldFollow: O, totalCount: y };
        }),
        W(({ shouldFollow: y }) => y)
      ),
      ({ followOutputBehavior: y, totalCount: k }) => {
        h !== null && (h(), h = null), it(n) !== void 0 ? requestAnimationFrame(() => {
          it(m)("following output to ", { totalCount: k }, ft.DEBUG), f(y);
        }) : h = yt(t, () => {
          it(m)("following output to ", { totalCount: k }, ft.DEBUG), f(y), h = null;
        });
      }
    );
    function a(y) {
      const k = yt(r, (u) => {
        y && !u.atBottom && u.notAtBottomBecause === "SIZE_INCREASED" && h === null && (it(m)("scrolling to bottom due to increased size", {}, ft.DEBUG), f("auto"));
      });
      setTimeout(k, 100);
    }
    Y(
      I(
        at(P(w), e, d),
        W(([y, , k]) => y !== !1 && k),
        Ot(
          ({ value: y }, [, k]) => ({ refreshed: y === k, value: k }),
          { refreshed: !1, value: 0 }
        ),
        W(({ refreshed: y }) => y),
        $(w, e)
      ),
      ([, y]) => {
        it(l) && a(y !== !1);
      }
    ), Y(R, () => {
      a(it(w) !== !1);
    }), Y(at(P(w), r), ([y, k]) => {
      y !== !1 && !k.atBottom && k.notAtBottomBecause === "VIEWPORT_HEIGHT_DECREASING" && f("auto");
    });
    const S = v(null), H = U();
    return L(
      ze(
        I(
          P(o),
          B((y) => y?.length ?? 0)
        ),
        I(P(e))
      ),
      H
    ), Y(
      I(
        at(I(H, $t(1)), c),
        $(P(S), l, x, p),
        B(([[y, k], u, g, C, z]) => k && g && u?.({ context: z, totalCount: y, scrollingInProgress: C })),
        W((y) => !!y),
        zt(0)
      ),
      (y) => {
        h !== null && (h(), h = null), it(n) !== void 0 ? requestAnimationFrame(() => {
          it(m)("scrolling into view", {}), _(T, y);
        }) : h = yt(t, () => {
          it(m)("scrolling into view", {}), _(T, y), h = null;
        });
      }
    ), { autoscrollToBottom: R, followOutput: w, scrollIntoViewOnChange: S };
  },
  ot(
    Lt,
    pe,
    fe,
    me,
    At,
    Gt,
    It,
    qn,
    Yn
  )
), Ko = j(
  ([{ data: t, firstItemIndex: e, gap: n, sizes: o }, { initialTopMostItemIndex: r }, { initialItemCount: s, listState: i }, { didMount: l }]) => (L(
    I(
      l,
      $(s),
      W(([, c]) => c !== 0),
      $(r, o, e, n, t),
      B(([[, c], d, m, x, p, T = []]) => Kn(c, d, m, x, p, T))
    ),
    i
  ), {}),
  ot(Lt, me, Ut, At),
  { singleton: !0 }
), jo = j(
  ([{ didMount: t }, { scrollTo: e }, { listState: n }]) => {
    const o = v(0);
    return Y(
      I(
        t,
        $(o),
        W(([, r]) => r !== 0),
        B(([, r]) => ({ top: r }))
      ),
      (r) => {
        yt(
          I(
            n,
            $t(1),
            W((s) => s.items.length > 1)
          ),
          () => {
            requestAnimationFrame(() => {
              _(e, r);
            });
          }
        );
      }
    ), {
      initialScrollTop: o
    };
  },
  ot(At, It, Ut),
  { singleton: !0 }
), Zn = j(
  ([{ scrollVelocity: t }]) => {
    const e = v(!1), n = U(), o = v(!1);
    return L(
      I(
        t,
        $(o, e, n),
        W(([r, s]) => s !== !1 && s !== void 0),
        B(([r, s, i, l]) => {
          const { enter: c, exit: d } = s;
          if (i) {
            if (d(r, l))
              return !1;
          } else if (c(r, l))
            return !0;
          return i;
        }),
        et()
      ),
      e
    ), Y(
      I(at(e, t, n), $(o)),
      ([[r, s, i], l]) => {
        r && l !== !1 && l !== void 0 && l.change && l.change(s, i);
      }
    ), { isSeeking: e, scrollSeekConfiguration: o, scrollSeekRangeChanged: n, scrollVelocity: t };
  },
  ot(pe),
  { singleton: !0 }
), qe = j(([{ scrollContainerState: t, scrollTo: e }]) => {
  const n = U(), o = U(), r = U(), s = v(!1), i = v(void 0);
  return L(
    I(
      at(n, o),
      B(([{ scrollTop: l, viewportHeight: c }, { offsetTop: d, listHeight: m }]) => ({
        scrollHeight: m,
        scrollTop: Math.max(0, l - d),
        viewportHeight: c
      }))
    ),
    t
  ), L(
    I(
      e,
      $(o),
      B(([l, { offsetTop: c }]) => ({
        ...l,
        top: l.top + c
      }))
    ),
    r
  ), {
    customScrollParent: i,
    // config
    useWindowScroll: s,
    // input
    windowScrollContainerState: n,
    // signals
    windowScrollTo: r,
    windowViewportRect: o
  };
}, ot(It)), qo = j(
  ([
    { sizeRanges: t, sizes: e },
    { headerHeight: n, scrollTop: o },
    { initialTopMostItemIndex: r },
    { didMount: s },
    { useWindowScroll: i, windowScrollContainerState: l, windowViewportRect: c }
  ]) => {
    const d = U(), m = v(void 0), x = v(null), p = v(null);
    return L(l, x), L(c, p), Y(
      I(
        d,
        $(e, o, i, x, p, n)
      ),
      ([T, w, R, h, f, a, S]) => {
        const H = ko(w.sizeTree);
        h && f !== null && a !== null && (R = f.scrollTop - a.offsetTop), R -= S, T({ ranges: H, scrollTop: R });
      }
    ), L(I(m, W(Ae), B(Yo)), r), L(
      I(
        s,
        $(m),
        W(([, T]) => T !== void 0),
        et(),
        B(([, T]) => T.ranges)
      ),
      t
    ), {
      getState: d,
      restoreStateFrom: m
    };
  },
  ot(Lt, It, me, At, qe)
);
function Yo(t) {
  return { align: "start", index: 0, offset: t.scrollTop };
}
const Zo = j(([{ topItemsIndexes: t }]) => {
  const e = v(0);
  return L(
    I(
      e,
      W((n) => n >= 0),
      B((n) => Array.from({ length: n }).map((o, r) => r))
    ),
    t
  ), { topItemCount: e };
}, ot(Ut));
function Xn(t) {
  let e = !1, n;
  return (() => (e || (e = !0, n = t()), n));
}
const Xo = Xn(() => /iP(ad|od|hone)/i.test(navigator.userAgent) && /WebKit/i.test(navigator.userAgent)), Jo = j(
  ([
    { deviation: t, scrollBy: e, scrollingInProgress: n, scrollTop: o },
    { isAtBottom: r, isScrolling: s, lastJumpDueToItemResize: i, scrollDirection: l },
    { listState: c },
    { beforeUnshiftWith: d, gap: m, shiftWithOffset: x, sizes: p },
    { log: T },
    { recalcInProgress: w }
  ]) => {
    const R = vt(
      I(
        c,
        $(i),
        Ot(
          ([, f, a, S], [{ bottom: H, items: y, offsetBottom: k, totalCount: u }, g]) => {
            const C = H + k;
            let z = 0;
            return a === u && f.length > 0 && y.length > 0 && (y[0].originalIndex === 0 && f[0].originalIndex === 0 || (z = C - S, z !== 0 && (z += g))), [z, y, u, C];
          },
          [0, [], 0, 0]
        ),
        W(([f]) => f !== 0),
        $(o, l, n, r, T, w),
        W(([, f, a, S, , , H]) => !H && !S && f !== 0 && a === ue),
        B(([[f], , , , , a]) => (a("Upward scrolling compensation", { amount: f }, ft.DEBUG), f))
      )
    );
    function h(f) {
      f > 0 ? (_(e, { behavior: "auto", top: -f }), _(t, 0)) : (_(t, 0), _(e, { behavior: "auto", top: -f }));
    }
    return Y(I(R, $(t, s)), ([f, a, S]) => {
      S && Xo() ? _(t, a - f) : h(-f);
    }), Y(
      I(
        at(ht(s, !1), t, w),
        W(([f, a, S]) => !f && !S && a !== 0),
        B(([f, a]) => a),
        zt(1)
      ),
      h
    ), L(
      I(
        x,
        B((f) => ({ top: -f }))
      ),
      e
    ), Y(
      I(
        d,
        $(p, m),
        B(([f, { groupIndices: a, lastSize: S, sizeTree: H }, y]) => {
          function k(O) {
            return O * (S + y);
          }
          if (a.length === 0)
            return k(f);
          let u = 0;
          const g = ie(H, 0);
          let C = 0, z = 0;
          for (; C < f; ) {
            C++, u += g;
            let O = a.length === z + 1 ? 1 / 0 : a[z + 1] - a[z] - 1;
            C + O > f && (u -= g, O = f - C + 1), C += O, u += k(O), z++;
          }
          return u;
        })
      ),
      (f) => {
        _(t, f), requestAnimationFrame(() => {
          _(e, { top: f }), requestAnimationFrame(() => {
            _(t, 0), _(w, !1);
          });
        });
      }
    ), { deviation: t };
  },
  ot(It, pe, Ut, Lt, Gt, De)
), Qo = j(
  ([
    t,
    e,
    n,
    o,
    r,
    s,
    i,
    l,
    c,
    d,
    m
  ]) => ({
    ...t,
    ...e,
    ...n,
    ...o,
    ...r,
    ...s,
    ...i,
    ...l,
    ...c,
    ...d,
    ...m
  }),
  ot(
    je,
    Ko,
    At,
    Zn,
    jn,
    jo,
    No,
    qe,
    Yn,
    Gt,
    qn
  )
), Jn = j(
  ([
    {
      data: t,
      defaultItemSize: e,
      firstItemIndex: n,
      fixedItemSize: o,
      fixedGroupSize: r,
      gap: s,
      groupIndices: i,
      heightEstimates: l,
      itemSize: c,
      sizeRanges: d,
      sizes: m,
      statefulTotalCount: x,
      totalCount: p,
      trackItemSizes: T
    },
    { initialItemFinalLocationReached: w, initialTopMostItemIndex: R, scrolledToInitialItem: h },
    f,
    a,
    S,
    H,
    { scrollToIndex: y },
    k,
    { topItemCount: u },
    { groupCounts: g },
    C
  ]) => {
    const { listState: z, minOverscanItemCount: O, topItemsIndexes: V, rangeChanged: N, ...Z } = H;
    return L(N, C.scrollSeekRangeChanged), L(
      I(
        C.windowViewportRect,
        B((F) => F.visibleHeight)
      ),
      f.viewportHeight
    ), {
      data: t,
      defaultItemHeight: e,
      firstItemIndex: n,
      fixedItemHeight: o,
      fixedGroupHeight: r,
      gap: s,
      groupCounts: g,
      heightEstimates: l,
      initialItemFinalLocationReached: w,
      initialTopMostItemIndex: R,
      scrolledToInitialItem: h,
      sizeRanges: d,
      topItemCount: u,
      topItemsIndexes: V,
      // input
      totalCount: p,
      ...S,
      groupIndices: i,
      itemSize: c,
      listState: z,
      minOverscanItemCount: O,
      scrollToIndex: y,
      // output
      statefulTotalCount: x,
      trackItemSizes: T,
      // exported from stateFlagsSystem
      rangeChanged: N,
      ...Z,
      // the bag of IO from featureGroup1System
      ...C,
      ...f,
      sizes: m,
      ...a
    };
  },
  ot(
    Lt,
    me,
    It,
    qo,
    Uo,
    Ut,
    fe,
    Jo,
    Zo,
    Dn,
    Qo
  )
);
function tr(t, e) {
  const n = {}, o = {};
  let r = 0;
  const s = t.length;
  for (; r < s; )
    o[t[r]] = 1, r += 1;
  for (const i in e)
    Object.hasOwn(o, i) || (n[i] = e[i]);
  return n;
}
const Ie = typeof document < "u" ? E.useLayoutEffect : E.useEffect;
function Ye(t, e, n) {
  const o = Object.keys(e.required || {}), r = Object.keys(e.optional || {}), s = Object.keys(e.methods || {}), i = Object.keys(e.events || {}), l = E.createContext({});
  function c(f, a) {
    f.propsReady !== void 0 && _(f.propsReady, !1);
    for (const S of o) {
      const H = f[e.required[S]];
      _(H, a[S]);
    }
    for (const S of r)
      if (S in a) {
        const H = f[e.optional[S]];
        _(H, a[S]);
      }
    f.propsReady !== void 0 && _(f.propsReady, !0);
  }
  function d(f) {
    return s.reduce((a, S) => (a[S] = (H) => {
      const y = f[e.methods[S]];
      _(y, H);
    }, a), {});
  }
  function m(f) {
    return i.reduce((a, S) => (a[S] = Io(f[e.events[S]]), a), {});
  }
  const x = E.forwardRef(function(a, S) {
    const { children: H, ...y } = a, [k] = E.useState(() => ye(So(t), (C) => {
      c(C, y);
    })), [u] = E.useState(an(m, k));
    Ie(() => {
      for (const C of i)
        C in y && Y(u[C], y[C]);
      return () => {
        Object.values(u).map(Me);
      };
    }, [y, u, k]), Ie(() => {
      c(k, y);
    }), E.useImperativeHandle(S, un(d(k)));
    const g = n;
    return /* @__PURE__ */ G(l.Provider, { value: k, children: n !== void 0 ? /* @__PURE__ */ G(g, { ...tr([...o, ...r, ...i], y), children: H }) : H });
  }), p = (f) => {
    const a = E.useContext(l);
    return E.useCallback(
      (S) => {
        _(a[f], S);
      },
      [a, f]
    );
  }, T = (f) => {
    const S = E.useContext(l)[f], H = E.useCallback(
      (y) => Y(S, y),
      [S]
    );
    return E.useSyncExternalStore(
      H,
      () => it(S),
      () => it(S)
    );
  }, w = (f) => {
    const S = E.useContext(l)[f], [H, y] = E.useState(an(it, S));
    return Ie(
      () => Y(S, (k) => {
        k !== H && y(un(k));
      }),
      [S, H]
    ), H;
  }, R = E.version.startsWith("18") ? T : w;
  return {
    Component: x,
    useEmitter: (f, a) => {
      const H = E.useContext(l)[f];
      Ie(() => Y(H, a), [a, H]);
    },
    useEmitterValue: R,
    usePublisher: p
  };
}
const Re = E.createContext(void 0), Qn = E.createContext(void 0), Oe = "-webkit-sticky", vn = "sticky", Ze = Xn(() => {
  if (typeof document > "u")
    return vn;
  const t = document.createElement("div");
  return t.style.position = Oe, t.style.position === Oe ? Oe : vn;
}), to = typeof document < "u" ? E.useLayoutEffect : E.useEffect;
function ke(t) {
  return "self" in t;
}
function er(t) {
  return "body" in t;
}
function eo(t, e, n, o = Xt, r, s) {
  const i = E.useRef(null), l = E.useRef(null), c = E.useRef(null), d = E.useCallback(
    (p) => {
      let T, w, R;
      const h = p.target;
      if (er(h) || ke(h)) {
        const a = ke(h) ? h : h.defaultView;
        R = s === !0 ? a.scrollX : a.scrollY, T = s === !0 ? a.document.documentElement.scrollWidth : a.document.documentElement.scrollHeight, w = s === !0 ? a.innerWidth : a.innerHeight;
      } else
        R = s === !0 ? h.scrollLeft : h.scrollTop, T = s === !0 ? h.scrollWidth : h.scrollHeight, w = s === !0 ? h.offsetWidth : h.offsetHeight;
      const f = () => {
        t({
          scrollHeight: T,
          scrollTop: Math.max(R, 0),
          viewportHeight: w
        });
      };
      p.suppressFlushSync === !0 ? f() : ao.flushSync(f), l.current !== null && (R === l.current || R <= 0 || R === T - w) && (l.current = null, e(!0), c.current && (clearTimeout(c.current), c.current = null));
    },
    [t, e, s]
  );
  E.useEffect(() => {
    const p = r || i.current;
    return o(r || i.current), d({ suppressFlushSync: !0, target: p }), p.addEventListener("scroll", d, { passive: !0 }), () => {
      o(null), p.removeEventListener("scroll", d);
    };
  }, [i, d, n, o, r]);
  function m(p) {
    const T = i.current;
    if (!T || (s === !0 ? "offsetWidth" in T && T.offsetWidth === 0 : "offsetHeight" in T && T.offsetHeight === 0))
      return;
    const w = p.behavior === "smooth";
    let R, h, f;
    ke(T) ? (h = Math.max(
      Ht(T.document.documentElement, s === !0 ? "width" : "height"),
      s === !0 ? T.document.documentElement.scrollWidth : T.document.documentElement.scrollHeight
    ), R = s === !0 ? T.innerWidth : T.innerHeight, f = s === !0 ? window.scrollX : window.scrollY) : (h = T[s === !0 ? "scrollWidth" : "scrollHeight"], R = Ht(T, s === !0 ? "width" : "height"), f = T[s === !0 ? "scrollLeft" : "scrollTop"]);
    const a = h - R;
    if (p.top = Math.ceil(Math.max(Math.min(a, p.top), 0)), Un(R, h) || p.top === f) {
      t({ scrollHeight: h, scrollTop: f, viewportHeight: R }), w && e(!0);
      return;
    }
    w ? (l.current = p.top, c.current && clearTimeout(c.current), c.current = setTimeout(() => {
      c.current = null, l.current = null, e(!0);
    }, 1e3)) : l.current = null, s === !0 && (p = { ...p.behavior !== void 0 ? { behavior: p.behavior } : {}, left: p.top }), T.scrollTo(p);
  }
  function x(p) {
    s === !0 && (p = {
      ...p.behavior !== void 0 ? { behavior: p.behavior } : {},
      ...p.top !== void 0 ? { left: p.top } : {}
    }), i.current.scrollBy(p);
  }
  return { scrollByCallback: x, scrollerRef: i, scrollToCallback: m };
}
function Xe(t) {
  return t;
}
const nr = /* @__PURE__ */ j(() => {
  const t = v((l) => `Item ${l}`), e = v((l) => `Group ${l}`), n = v({}), o = v(Xe), r = v("div"), s = v(Xt), i = (l, c = null) => ht(
    I(
      n,
      B((d) => d[l]),
      et()
    ),
    c
  );
  return {
    components: n,
    computeItemKey: o,
    EmptyPlaceholder: i("EmptyPlaceholder"),
    FooterComponent: i("Footer"),
    GroupComponent: i("Group", "div"),
    groupContent: e,
    HeaderComponent: i("Header"),
    HeaderFooterTag: r,
    ItemComponent: i("Item", "div"),
    itemContent: t,
    ListComponent: i("List", "div"),
    ScrollerComponent: i("Scroller", "div"),
    scrollerRef: s,
    ScrollSeekPlaceholder: i("ScrollSeekPlaceholder"),
    TopItemListComponent: i("TopItemList")
  };
}), or = /* @__PURE__ */ j(
  ([t, e]) => ({ ...t, ...e }),
  ot(Jn, nr)
), rr = ({ height: t }) => /* @__PURE__ */ G("div", { style: { height: t } }), sr = { overflowAnchor: "none", position: Ze(), zIndex: 1 }, no = { overflowAnchor: "none" }, ir = { ...no, display: "inline-block", height: "100%" }, Cn = /* @__PURE__ */ E.memo(function({ showTopList: e = !1 }) {
  const n = A("listState"), o = Ct("sizeRanges"), r = A("useWindowScroll"), s = A("customScrollParent"), i = Ct("windowScrollContainerState"), l = Ct("scrollContainerState"), c = s || r ? i : l, d = A("itemContent"), m = A("context"), x = A("groupContent"), p = A("trackItemSizes"), T = A("itemSize"), w = A("log"), R = Ct("gap"), h = A("horizontalDirection"), { callbackRef: f } = zn(
    o,
    T,
    p,
    e ? Xt : c,
    w,
    R,
    s,
    h,
    A("skipAnimationFrameInResizeObserver")
  ), [a, S] = E.useState(0);
  tn("deviation", (F) => {
    a !== F && S(F);
  });
  const H = A("EmptyPlaceholder"), y = A("ScrollSeekPlaceholder") ?? rr, k = A("ListComponent"), u = A("ItemComponent"), g = A("GroupComponent"), C = A("computeItemKey"), z = A("isSeeking"), O = A("groupIndices").length > 0, V = A("alignToBottom"), N = A("initialItemFinalLocationReached"), Z = e ? {} : {
    boxSizing: "border-box",
    ...h ? {
      display: "inline-block",
      height: "100%",
      marginLeft: a !== 0 ? a : V ? "auto" : 0,
      paddingLeft: n.offsetTop,
      paddingRight: n.offsetBottom,
      whiteSpace: "nowrap"
    } : {
      marginTop: a !== 0 ? a : V ? "auto" : 0,
      paddingBottom: n.offsetBottom,
      paddingTop: n.offsetTop
    },
    ...N ? {} : { visibility: "hidden" }
  };
  return !e && n.totalCount === 0 && H !== null && H !== void 0 ? /* @__PURE__ */ G(H, { ...nt(H, m) }) : /* @__PURE__ */ G(
    k,
    {
      ...nt(k, m),
      "data-testid": e ? "virtuoso-top-item-list" : "virtuoso-item-list",
      ref: f,
      style: Z,
      children: (e ? n.topItems : n.items).map((F) => {
        const mt = F.originalIndex, q = C(mt + n.firstItemIndex, F.data, m);
        return z ? /* @__PURE__ */ Nt(
          y,
          {
            ...nt(y, m),
            height: F.size,
            index: F.index,
            key: q,
            type: F.type || "item",
            ...F.type === "group" ? {} : { groupIndex: F.groupIndex }
          }
        ) : F.type === "group" ? /* @__PURE__ */ Nt(
          g,
          {
            ...nt(g, m),
            "data-index": mt,
            "data-item-index": F.index,
            "data-known-size": F.size,
            key: q,
            style: sr
          },
          x(F.index, m)
        ) : /* @__PURE__ */ Nt(
          u,
          {
            ...nt(u, m),
            ...oo(u, F.data),
            "data-index": mt,
            "data-item-group-index": F.groupIndex,
            "data-item-index": F.index,
            "data-known-size": F.size,
            key: q,
            style: h ? ir : no
          },
          O ? d(F.index, F.groupIndex, F.data, m) : d(F.index, F.data, m)
        );
      })
    }
  );
}), lr = {
  height: "100%",
  outline: "none",
  overflowY: "auto",
  position: "relative",
  WebkitOverflowScrolling: "touch"
}, cr = {
  outline: "none",
  overflowX: "auto",
  position: "relative"
}, Jt = (t) => ({
  height: "100%",
  position: "absolute",
  top: 0,
  width: "100%",
  ...t ? { display: "flex", flexDirection: "column" } : void 0
}), ur = {
  position: Ze(),
  top: 0,
  width: "100%",
  zIndex: 1
};
function nt(t, e) {
  if (typeof t != "string")
    return { context: e };
}
function oo(t, e) {
  return { item: typeof t == "string" ? void 0 : e };
}
const ar = /* @__PURE__ */ E.memo(function() {
  const e = A("HeaderComponent"), n = Ct("headerHeight"), o = A("HeaderFooterTag"), r = kt(
    E.useMemo(
      () => (i) => {
        n(Ht(i, "height"));
      },
      [n]
    ),
    !0,
    A("skipAnimationFrameInResizeObserver")
  ), s = A("context");
  return e != null ? /* @__PURE__ */ G(o, { ref: r, children: /* @__PURE__ */ G(e, { ...nt(e, s) }) }) : null;
}), dr = /* @__PURE__ */ E.memo(function() {
  const e = A("FooterComponent"), n = Ct("footerHeight"), o = A("HeaderFooterTag"), r = kt(
    E.useMemo(
      () => (i) => {
        n(Ht(i, "height"));
      },
      [n]
    ),
    !0,
    A("skipAnimationFrameInResizeObserver")
  ), s = A("context");
  return e != null ? /* @__PURE__ */ G(o, { ref: r, children: /* @__PURE__ */ G(e, { ...nt(e, s) }) }) : null;
});
function Je({ useEmitter: t, useEmitterValue: e, usePublisher: n }) {
  return E.memo(function({ children: s, style: i, context: l, ...c }) {
    const d = n("scrollContainerState"), m = e("ScrollerComponent"), x = n("smoothScrollTargetReached"), p = e("scrollerRef"), T = e("horizontalDirection") || !1, { scrollByCallback: w, scrollerRef: R, scrollToCallback: h } = eo(
      d,
      x,
      m,
      p,
      void 0,
      T
    );
    return t("scrollTo", h), t("scrollBy", w), /* @__PURE__ */ G(
      m,
      {
        "data-testid": "virtuoso-scroller",
        "data-virtuoso-scroller": !0,
        ref: R,
        style: { ...T ? cr : lr, ...i },
        tabIndex: 0,
        ...c,
        ...nt(m, l),
        children: s
      }
    );
  });
}
function Qe({ useEmitter: t, useEmitterValue: e, usePublisher: n }) {
  return E.memo(function({ children: s, style: i, context: l, ...c }) {
    const d = n("windowScrollContainerState"), m = e("ScrollerComponent"), x = n("smoothScrollTargetReached"), p = e("totalListHeight"), T = e("deviation"), w = e("customScrollParent"), R = E.useRef(null), h = e("scrollerRef"), { scrollByCallback: f, scrollerRef: a, scrollToCallback: S } = eo(
      d,
      x,
      m,
      h,
      w
    );
    return to(() => (a.current = w || R.current?.ownerDocument.defaultView, () => {
      a.current = null;
    }), [a, w]), t("windowScrollTo", S), t("scrollBy", f), /* @__PURE__ */ G(
      m,
      {
        ref: R,
        "data-virtuoso-scroller": !0,
        style: { position: "relative", ...i, ...p !== 0 ? { height: p + T } : void 0 },
        ...c,
        ...nt(m, l),
        children: s
      }
    );
  });
}
const fr = ({ children: t }) => {
  const e = E.useContext(Re), n = Ct("viewportHeight"), o = Ct("fixedItemHeight"), r = A("alignToBottom"), s = A("horizontalDirection"), i = E.useMemo(
    () => re(n, (c) => Ht(c, s ? "width" : "height")),
    [n, s]
  ), l = kt(i, !0, A("skipAnimationFrameInResizeObserver"));
  return E.useEffect(() => {
    e && (n(e.viewportHeight), o(e.itemHeight));
  }, [e, n, o]), /* @__PURE__ */ G("div", { "data-viewport-type": "element", ref: l, style: Jt(r), children: t });
}, mr = ({ children: t }) => {
  const e = E.useContext(Re), n = Ct("windowViewportRect"), o = Ct("fixedItemHeight"), r = A("customScrollParent"), s = Ne(
    n,
    r,
    A("skipAnimationFrameInResizeObserver")
  ), i = A("alignToBottom");
  return E.useEffect(() => {
    e && (o(e.itemHeight), n({ listHeight: 0, offsetTop: 0, visibleHeight: e.viewportHeight, visibleWidth: 100 }));
  }, [e, n, o]), /* @__PURE__ */ G("div", { "data-viewport-type": "window", ref: s, style: Jt(i), children: t });
}, pr = ({ children: t }) => {
  const e = A("TopItemListComponent") ?? "div", n = A("headerHeight"), o = { ...ur, marginTop: `${n}px` }, r = A("context");
  return /* @__PURE__ */ G(e, { style: o, ...nt(e, r), children: t });
}, hr = /* @__PURE__ */ E.memo(function(e) {
  const n = A("useWindowScroll"), o = A("topItemsIndexes").length > 0, r = A("customScrollParent"), s = A("context");
  return /* @__PURE__ */ Dt(r || n ? Ir : gr, { ...e, context: s, children: [
    o && /* @__PURE__ */ G(pr, { children: /* @__PURE__ */ G(Cn, { showTopList: !0 }) }),
    /* @__PURE__ */ Dt(r || n ? mr : fr, { children: [
      /* @__PURE__ */ G(ar, {}),
      /* @__PURE__ */ G(Cn, {}),
      /* @__PURE__ */ G(dr, {})
    ] })
  ] });
}), {
  Component: ro,
  useEmitter: tn,
  useEmitterValue: A,
  usePublisher: Ct
} = /* @__PURE__ */ Ye(
  or,
  {
    optional: {
      restoreStateFrom: "restoreStateFrom",
      context: "context",
      followOutput: "followOutput",
      scrollIntoViewOnChange: "scrollIntoViewOnChange",
      itemContent: "itemContent",
      groupContent: "groupContent",
      overscan: "overscan",
      increaseViewportBy: "increaseViewportBy",
      minOverscanItemCount: "minOverscanItemCount",
      totalCount: "totalCount",
      groupCounts: "groupCounts",
      topItemCount: "topItemCount",
      firstItemIndex: "firstItemIndex",
      initialTopMostItemIndex: "initialTopMostItemIndex",
      components: "components",
      atBottomThreshold: "atBottomThreshold",
      atTopThreshold: "atTopThreshold",
      computeItemKey: "computeItemKey",
      defaultItemHeight: "defaultItemHeight",
      fixedGroupHeight: "fixedGroupHeight",
      // Must be set above 'fixedItemHeight'
      fixedItemHeight: "fixedItemHeight",
      heightEstimates: "heightEstimates",
      itemSize: "itemSize",
      scrollSeekConfiguration: "scrollSeekConfiguration",
      headerFooterTag: "HeaderFooterTag",
      data: "data",
      initialItemCount: "initialItemCount",
      initialScrollTop: "initialScrollTop",
      alignToBottom: "alignToBottom",
      useWindowScroll: "useWindowScroll",
      customScrollParent: "customScrollParent",
      scrollerRef: "scrollerRef",
      logLevel: "logLevel",
      horizontalDirection: "horizontalDirection",
      skipAnimationFrameInResizeObserver: "skipAnimationFrameInResizeObserver"
    },
    methods: {
      scrollToIndex: "scrollToIndex",
      scrollIntoView: "scrollIntoView",
      scrollTo: "scrollTo",
      scrollBy: "scrollBy",
      autoscrollToBottom: "autoscrollToBottom",
      getState: "getState"
    },
    events: {
      isScrolling: "isScrolling",
      endReached: "endReached",
      startReached: "startReached",
      rangeChanged: "rangeChanged",
      atBottomStateChange: "atBottomStateChange",
      atTopStateChange: "atTopStateChange",
      totalListHeightChanged: "totalListHeightChanged",
      itemsRendered: "itemsRendered",
      groupIndices: "groupIndices"
    }
  },
  hr
), gr = /* @__PURE__ */ Je({ useEmitter: tn, useEmitterValue: A, usePublisher: Ct }), Ir = /* @__PURE__ */ Qe({ useEmitter: tn, useEmitterValue: A, usePublisher: Ct }), qr = ro, Yr = ro, xr = /* @__PURE__ */ j(() => {
  const t = v((d) => /* @__PURE__ */ Dt("td", { children: [
    "Item $",
    d
  ] })), e = v(null), n = v((d) => /* @__PURE__ */ Dt("td", { colSpan: 1e3, children: [
    "Group ",
    d
  ] })), o = v(null), r = v(null), s = v({}), i = v(Xe), l = v(Xt), c = (d, m = null) => ht(
    I(
      s,
      B((x) => x[d]),
      et()
    ),
    m
  );
  return {
    components: s,
    computeItemKey: i,
    context: e,
    EmptyPlaceholder: c("EmptyPlaceholder"),
    FillerRow: c("FillerRow"),
    fixedFooterContent: r,
    fixedHeaderContent: o,
    itemContent: t,
    groupContent: n,
    ScrollerComponent: c("Scroller", "div"),
    scrollerRef: l,
    ScrollSeekPlaceholder: c("ScrollSeekPlaceholder"),
    TableBodyComponent: c("TableBody", "tbody"),
    TableComponent: c("Table", "table"),
    TableFooterComponent: c("TableFoot", "tfoot"),
    TableHeadComponent: c("TableHead", "thead"),
    TableRowComponent: c("TableRow", "tr"),
    GroupComponent: c("Group", "tr")
  };
}), Sr = /* @__PURE__ */ j(
  ([t, e]) => ({ ...t, ...e }),
  ot(Jn, xr)
), Tr = ({ height: t }) => /* @__PURE__ */ G("tr", { children: /* @__PURE__ */ G("td", { style: { height: t } }) }), vr = ({ height: t }) => /* @__PURE__ */ G("tr", { children: /* @__PURE__ */ G("td", { style: { border: 0, height: t, padding: 0 } }) }), Cr = { overflowAnchor: "none" }, wn = { position: Ze(), zIndex: 2, overflowAnchor: "none" }, yn = /* @__PURE__ */ E.memo(function({ showTopList: e = !1 }) {
  const n = M("listState"), o = M("computeItemKey"), r = M("firstItemIndex"), s = M("context"), i = M("isSeeking"), l = M("fixedHeaderHeight"), c = M("groupIndices").length > 0, d = M("itemContent"), m = M("groupContent"), x = M("ScrollSeekPlaceholder") ?? Tr, p = M("GroupComponent"), T = M("TableRowComponent"), w = (e ? n.topItems : []).reduce((h, f, a) => (a === 0 ? h.push(f.size) : h.push(h[a - 1] + f.size), h), []);
  return (e ? n.topItems : n.items).map((h) => {
    const f = h.originalIndex, a = o(f + r, h.data, s), S = e ? f === 0 ? 0 : w[f - 1] : 0;
    return i ? /* @__PURE__ */ Nt(
      x,
      {
        ...nt(x, s),
        height: h.size,
        index: h.index,
        key: a,
        type: h.type || "item"
      }
    ) : h.type === "group" ? /* @__PURE__ */ Nt(
      p,
      {
        ...nt(p, s),
        "data-index": f,
        "data-item-index": h.index,
        "data-known-size": h.size,
        key: a,
        style: {
          ...wn,
          top: l
        }
      },
      m(h.index, s)
    ) : /* @__PURE__ */ Nt(
      T,
      {
        ...nt(T, s),
        ...oo(T, h.data),
        "data-index": f,
        "data-item-index": h.index,
        "data-known-size": h.size,
        "data-item-group-index": h.groupIndex,
        key: a,
        style: e ? { ...wn, top: l + S } : Cr
      },
      c ? d(h.index, h.groupIndex, h.data, s) : d(h.index, h.data, s)
    );
  });
}), wr = /* @__PURE__ */ E.memo(function() {
  const e = M("listState"), n = M("topItemsIndexes").length > 0, o = bt("sizeRanges"), r = M("useWindowScroll"), s = M("customScrollParent"), i = bt("windowScrollContainerState"), l = bt("scrollContainerState"), c = s || r ? i : l, d = M("trackItemSizes"), m = M("itemSize"), x = M("log"), { callbackRef: p, ref: T } = zn(
    o,
    m,
    d,
    c,
    x,
    void 0,
    s,
    !1,
    M("skipAnimationFrameInResizeObserver")
  ), [w, R] = E.useState(0);
  en("deviation", (O) => {
    w !== O && (T.current.style.marginTop = `${O}px`, R(O));
  });
  const h = M("EmptyPlaceholder"), f = M("FillerRow") ?? vr, a = M("TableBodyComponent"), S = M("paddingTopAddition"), H = M("statefulTotalCount"), y = M("context");
  if (H === 0 && h !== null && h !== void 0)
    return /* @__PURE__ */ G(h, { ...nt(h, y) });
  const k = (n ? e.topItems : []).reduce((O, V) => O + V.size, 0), u = e.offsetTop + S + w - k, g = e.offsetBottom, C = u > 0 ? /* @__PURE__ */ G(f, { context: y, height: u }, "padding-top") : null, z = g > 0 ? /* @__PURE__ */ G(f, { context: y, height: g }, "padding-bottom") : null;
  return /* @__PURE__ */ Dt(a, { "data-testid": "virtuoso-item-list", ref: p, ...nt(a, y), children: [
    C,
    n && /* @__PURE__ */ G(yn, { showTopList: !0 }),
    /* @__PURE__ */ G(yn, {}),
    z
  ] });
}), yr = ({ children: t }) => {
  const e = E.useContext(Re), n = bt("viewportHeight"), o = bt("fixedItemHeight"), r = kt(
    E.useMemo(() => re(n, (s) => Ht(s, "height")), [n]),
    !0,
    M("skipAnimationFrameInResizeObserver")
  );
  return E.useEffect(() => {
    e && (n(e.viewportHeight), o(e.itemHeight));
  }, [e, n, o]), /* @__PURE__ */ G("div", { "data-viewport-type": "element", ref: r, style: Jt(!1), children: t });
}, br = ({ children: t }) => {
  const e = E.useContext(Re), n = bt("windowViewportRect"), o = bt("fixedItemHeight"), r = M("customScrollParent"), s = Ne(
    n,
    r,
    M("skipAnimationFrameInResizeObserver")
  );
  return E.useEffect(() => {
    e && (o(e.itemHeight), n({ listHeight: 0, offsetTop: 0, visibleHeight: e.viewportHeight, visibleWidth: 100 }));
  }, [e, n, o]), /* @__PURE__ */ G("div", { "data-viewport-type": "window", ref: s, style: Jt(!1), children: t });
}, Rr = /* @__PURE__ */ E.memo(function(e) {
  const n = M("useWindowScroll"), o = M("customScrollParent"), r = bt("fixedHeaderHeight"), s = bt("fixedFooterHeight"), i = M("fixedHeaderContent"), l = M("fixedFooterContent"), c = M("context"), d = kt(
    E.useMemo(() => re(r, (a) => Ht(a, "height")), [r]),
    !0,
    M("skipAnimationFrameInResizeObserver")
  ), m = kt(
    E.useMemo(() => re(s, (a) => Ht(a, "height")), [s]),
    !0,
    M("skipAnimationFrameInResizeObserver")
  ), x = o || n ? Er : Hr, p = o || n ? br : yr, T = M("TableComponent"), w = M("TableHeadComponent"), R = M("TableFooterComponent"), h = i ? /* @__PURE__ */ G(
    w,
    {
      ref: d,
      style: { position: "sticky", top: 0, zIndex: 2 },
      ...nt(w, c),
      children: i()
    },
    "TableHead"
  ) : null, f = l ? /* @__PURE__ */ G(
    R,
    {
      ref: m,
      style: { bottom: 0, position: "sticky", zIndex: 1 },
      ...nt(R, c),
      children: l()
    },
    "TableFoot"
  ) : null;
  return /* @__PURE__ */ G(x, { ...e, ...nt(x, c), children: /* @__PURE__ */ G(p, { children: /* @__PURE__ */ Dt(T, { style: { borderSpacing: 0, overflowAnchor: "none" }, ...nt(T, c), children: [
    h,
    /* @__PURE__ */ G(wr, {}, "TableBody"),
    f
  ] }) }) });
}), {
  Component: so,
  useEmitter: en,
  useEmitterValue: M,
  usePublisher: bt
} = /* @__PURE__ */ Ye(
  Sr,
  {
    optional: {
      restoreStateFrom: "restoreStateFrom",
      context: "context",
      followOutput: "followOutput",
      firstItemIndex: "firstItemIndex",
      itemContent: "itemContent",
      groupContent: "groupContent",
      fixedHeaderContent: "fixedHeaderContent",
      fixedFooterContent: "fixedFooterContent",
      overscan: "overscan",
      increaseViewportBy: "increaseViewportBy",
      minOverscanItemCount: "minOverscanItemCount",
      totalCount: "totalCount",
      topItemCount: "topItemCount",
      initialTopMostItemIndex: "initialTopMostItemIndex",
      components: "components",
      groupCounts: "groupCounts",
      atBottomThreshold: "atBottomThreshold",
      atTopThreshold: "atTopThreshold",
      computeItemKey: "computeItemKey",
      defaultItemHeight: "defaultItemHeight",
      fixedGroupHeight: "fixedGroupHeight",
      // Must be set above 'fixedItemHeight'
      fixedItemHeight: "fixedItemHeight",
      itemSize: "itemSize",
      scrollSeekConfiguration: "scrollSeekConfiguration",
      data: "data",
      initialItemCount: "initialItemCount",
      initialScrollTop: "initialScrollTop",
      alignToBottom: "alignToBottom",
      useWindowScroll: "useWindowScroll",
      customScrollParent: "customScrollParent",
      scrollerRef: "scrollerRef",
      logLevel: "logLevel"
    },
    methods: {
      scrollToIndex: "scrollToIndex",
      scrollIntoView: "scrollIntoView",
      scrollTo: "scrollTo",
      scrollBy: "scrollBy",
      getState: "getState"
    },
    events: {
      isScrolling: "isScrolling",
      endReached: "endReached",
      startReached: "startReached",
      rangeChanged: "rangeChanged",
      atBottomStateChange: "atBottomStateChange",
      atTopStateChange: "atTopStateChange",
      totalListHeightChanged: "totalListHeightChanged",
      itemsRendered: "itemsRendered",
      groupIndices: "groupIndices"
    }
  },
  Rr
), Hr = /* @__PURE__ */ Je({ useEmitter: en, useEmitterValue: M, usePublisher: bt }), Er = /* @__PURE__ */ Qe({ useEmitter: en, useEmitterValue: M, usePublisher: bt }), Zr = so, Xr = so, bn = {
  bottom: 0,
  itemHeight: 0,
  items: [],
  itemWidth: 0,
  offsetBottom: 0,
  offsetTop: 0,
  top: 0
}, Br = {
  bottom: 0,
  itemHeight: 0,
  items: [{ index: 0 }],
  itemWidth: 0,
  offsetBottom: 0,
  offsetTop: 0,
  top: 0
}, { ceil: Rn, floor: Ce, max: oe, min: Le, round: Hn } = Math;
function En(t, e, n) {
  return Array.from({ length: e - t + 1 }).map((o, r) => ({ data: n === null ? null : n[r + t], index: r + t }));
}
function Or(t) {
  return {
    ...Br,
    items: t
  };
}
function xe(t, e) {
  return t !== void 0 && t.width === e.width && t.height === e.height;
}
function kr(t, e) {
  return t !== void 0 && t.column === e.column && t.row === e.row;
}
const Lr = /* @__PURE__ */ j(
  ([
    { increaseViewportBy: t, listBoundary: e, overscan: n, visibleRange: o },
    { footerHeight: r, headerHeight: s, scrollBy: i, scrollContainerState: l, scrollTo: c, scrollTop: d, smoothScrollTargetReached: m, viewportHeight: x },
    p,
    T,
    { didMount: w, propsReady: R },
    { customScrollParent: h, useWindowScroll: f, windowScrollContainerState: a, windowScrollTo: S, windowViewportRect: H },
    y
  ]) => {
    const k = v(0), u = v(0), g = v(bn), C = v({ height: 0, width: 0 }), z = v({ height: 0, width: 0 }), O = U(), V = U(), N = v(0), Z = v(null), F = v({ column: 0, row: 0 }), mt = U(), q = U(), Q = v(!1), gt = v(0), ut = v(!0), xt = v(!1), Ft = v(!1);
    Y(
      I(
        w,
        $(gt),
        W(([b, D]) => D !== 0)
      ),
      () => {
        _(ut, !1);
      }
    ), Y(
      I(
        at(w, ut, z, C, gt, xt),
        W(([b, D, K, rt, , tt]) => b && !D && K.height !== 0 && rt.height !== 0 && !tt)
      ),
      ([, , , , b]) => {
        _(xt, !0), Ue(1, () => {
          _(O, b);
        }), yt(I(d), () => {
          _(e, [0, 0]), _(ut, !0);
        });
      }
    ), L(
      I(
        q,
        W((b) => b != null && b.scrollTop > 0),
        Bt(0)
      ),
      u
    ), Y(
      I(
        w,
        $(q),
        W(([, b]) => b != null)
      ),
      ([, b]) => {
        b && (_(C, b.viewport), _(z, b.item), _(F, b.gap), b.scrollTop > 0 && (_(Q, !0), yt(I(d, $t(1)), (D) => {
          _(Q, !1);
        }), _(c, { top: b.scrollTop })));
      }
    ), L(
      I(
        C,
        B(({ height: b }) => b)
      ),
      x
    ), L(
      I(
        at(
          P(C, xe),
          P(z, xe),
          P(F, (b, D) => b !== void 0 && b.column === D.column && b.row === D.row),
          P(d)
        ),
        B(([b, D, K, rt]) => ({
          gap: K,
          item: D,
          scrollTop: rt,
          viewport: b
        }))
      ),
      mt
    ), L(
      I(
        at(
          P(k),
          o,
          P(F, kr),
          P(z, xe),
          P(C, xe),
          P(Z),
          P(u),
          P(Q),
          P(ut),
          P(gt)
        ),
        W(([, , , , , , , b]) => !b),
        B(
          ([
            b,
            [D, K],
            rt,
            tt,
            X,
            lt,
            St,
            ,
            ct,
            Vt
          ]) => {
            const { column: Pt, row: ee } = rt, { height: he, width: He } = tt, { width: nn } = X;
            if (St === 0 && (b === 0 || nn === 0))
              return bn;
            if (He === 0) {
              const cn = Ke(Vt, b), uo = cn + Math.max(St - 1, 0);
              return Or(En(cn, uo, lt));
            }
            const ge = io(nn, He, Pt);
            let jt, Mt;
            ct ? D === 0 && K === 0 && St > 0 ? (jt = 0, Mt = St - 1) : (jt = ge * Ce((D + ee) / (he + ee)), Mt = ge * Rn((K + ee) / (he + ee)) - 1, Mt = Le(b - 1, oe(Mt, ge - 1)), jt = Le(Mt, oe(0, jt))) : (jt = 0, Mt = -1);
            const on = En(jt, Mt, lt), { bottom: rn, top: sn } = Bn(X, rt, tt, on), ln = Rn(b / ge), co = ln * he + (ln - 1) * ee - rn;
            return { bottom: rn, itemHeight: he, items: on, itemWidth: He, offsetBottom: co, offsetTop: sn, top: sn };
          }
        )
      ),
      g
    ), L(
      I(
        Z,
        W((b) => b !== null),
        B((b) => b.length)
      ),
      k
    ), L(
      I(
        at(C, z, g, F),
        W(([b, D, { items: K }]) => K.length > 0 && D.height !== 0 && b.height !== 0),
        B(([b, D, { items: K }, rt]) => {
          const { bottom: tt, top: X } = Bn(b, rt, D, K);
          return [X, tt];
        }),
        et(le)
      ),
      e
    );
    const pt = v(!1);
    L(
      I(
        d,
        $(pt),
        B(([b, D]) => D || b !== 0)
      ),
      pt
    );
    const Kt = vt(
      I(
        at(g, k),
        W(([{ items: b }]) => b.length > 0),
        $(pt),
        W(([[b, D], K]) => {
          const tt = b.items[b.items.length - 1].index === D - 1;
          return (K || b.bottom > 0 && b.itemHeight > 0 && b.offsetBottom === 0 && b.items.length === D) && tt;
        }),
        B(([[, b]]) => b - 1),
        et()
      )
    ), Qt = vt(
      I(
        P(g),
        W(({ items: b }) => b.length > 0 && b[0].index === 0),
        Bt(0),
        et()
      )
    ), Et = vt(
      I(
        P(g),
        $(Q),
        W(([{ items: b }, D]) => b.length > 0 && !D),
        B(([{ items: b }]) => ({
          endIndex: b[b.length - 1].index,
          startIndex: b[0].index
        })),
        et(An),
        zt(0)
      )
    );
    L(Et, T.scrollSeekRangeChanged), L(
      I(
        O,
        $(C, z, k, F),
        B(([b, D, K, rt, tt]) => {
          const X = $n(b), { align: lt, behavior: St, offset: ct } = X;
          let Vt = X.index;
          Vt === "LAST" && (Vt = rt - 1), Vt = oe(0, Vt, Le(rt - 1, Vt));
          let Pt = Ge(D, tt, K, Vt);
          return lt === "end" ? Pt = Hn(Pt - D.height + K.height) : lt === "center" && (Pt = Hn(Pt - D.height / 2 + K.height / 2)), ct !== void 0 && ct !== 0 && (Pt += ct), { behavior: St, top: Pt };
        })
      ),
      c
    );
    const te = ht(
      I(
        g,
        B((b) => b.offsetBottom + b.bottom)
      ),
      0
    );
    return L(
      I(
        H,
        B((b) => ({ height: b.visibleHeight, width: b.visibleWidth }))
      ),
      C
    ), {
      customScrollParent: h,
      // input
      data: Z,
      deviation: N,
      footerHeight: r,
      gap: F,
      headerHeight: s,
      increaseViewportBy: t,
      initialItemCount: u,
      itemDimensions: z,
      overscan: n,
      restoreStateFrom: q,
      scrollBy: i,
      scrollContainerState: l,
      scrollHeight: V,
      scrollTo: c,
      scrollToIndex: O,
      scrollTop: d,
      smoothScrollTargetReached: m,
      totalCount: k,
      useWindowScroll: f,
      viewportDimensions: C,
      windowScrollContainerState: a,
      windowScrollTo: S,
      windowViewportRect: H,
      ...T,
      // output
      gridState: g,
      horizontalDirection: Ft,
      initialTopMostItemIndex: gt,
      totalListHeight: te,
      ...p,
      endReached: Kt,
      propsReady: R,
      rangeChanged: Et,
      startReached: Qt,
      stateChanged: mt,
      stateRestoreInProgress: Q,
      ...y
    };
  },
  ot(je, It, pe, Zn, At, qe, Gt)
);
function io(t, e, n) {
  return oe(1, Ce((t + n) / (Ce(e) + n)));
}
function Bn(t, e, n, o) {
  const { height: r } = n;
  if (r === void 0 || o.length === 0)
    return { bottom: 0, top: 0 };
  const s = Ge(t, e, n, o[0].index);
  return { bottom: Ge(t, e, n, o[o.length - 1].index) + r, top: s };
}
function Ge(t, e, n, o) {
  const r = io(t.width, n.width, e.column), s = Ce(o / r), i = s * n.height + oe(0, s - 1) * e.row;
  return i > 0 ? i + e.row : i;
}
const zr = /* @__PURE__ */ j(() => {
  const t = v((x) => `Item ${x}`), e = v({}), n = v(null), o = v("virtuoso-grid-item"), r = v("virtuoso-grid-list"), s = v(Xe), i = v("div"), l = v(Xt), c = (x, p = null) => ht(
    I(
      e,
      B((T) => T[x]),
      et()
    ),
    p
  ), d = v(!1), m = v(!1);
  return L(P(m), d), {
    components: e,
    computeItemKey: s,
    context: n,
    FooterComponent: c("Footer"),
    HeaderComponent: c("Header"),
    headerFooterTag: i,
    itemClassName: o,
    ItemComponent: c("Item", "div"),
    itemContent: t,
    listClassName: r,
    ListComponent: c("List", "div"),
    readyStateChanged: d,
    reportReadyState: m,
    ScrollerComponent: c("Scroller", "div"),
    scrollerRef: l,
    ScrollSeekPlaceholder: c("ScrollSeekPlaceholder", "div")
  };
}), Fr = /* @__PURE__ */ j(
  ([t, e]) => ({ ...t, ...e }),
  ot(Lr, zr)
), Vr = /* @__PURE__ */ E.memo(function() {
  const e = st("gridState"), n = st("listClassName"), o = st("itemClassName"), r = st("itemContent"), s = st("computeItemKey"), i = st("isSeeking"), l = wt("scrollHeight"), c = st("ItemComponent"), d = st("ListComponent"), m = st("ScrollSeekPlaceholder"), x = st("context"), p = wt("itemDimensions"), T = wt("gap"), w = st("log"), R = st("stateRestoreInProgress"), h = wt("reportReadyState"), f = kt(
    E.useMemo(
      () => (a) => {
        const S = a.parentElement.parentElement.scrollHeight;
        l(S);
        const H = a.firstChild;
        if (H !== null) {
          const { height: y, width: k } = H.getBoundingClientRect();
          p({ height: y, width: k });
        }
        T({
          column: On("column-gap", getComputedStyle(a).columnGap, w),
          row: On("row-gap", getComputedStyle(a).rowGap, w)
        });
      },
      [l, p, T, w]
    ),
    !0,
    !1
  );
  return to(() => {
    e.itemHeight > 0 && e.itemWidth > 0 && h(!0);
  }, [e]), R ? null : /* @__PURE__ */ G(
    d,
    {
      className: n,
      ref: f,
      ...nt(d, x),
      "data-testid": "virtuoso-item-list",
      style: { paddingBottom: e.offsetBottom, paddingTop: e.offsetTop },
      children: e.items.map((a) => {
        const S = s(a.index, a.data, x);
        return i ? /* @__PURE__ */ G(
          m,
          {
            ...nt(m, x),
            height: e.itemHeight,
            index: a.index,
            width: e.itemWidth
          },
          S
        ) : /* @__PURE__ */ Nt(
          c,
          {
            ...nt(c, x),
            className: o,
            "data-index": a.index,
            key: S
          },
          r(a.index, a.data, x)
        );
      })
    }
  );
}), Pr = E.memo(function() {
  const e = st("HeaderComponent"), n = wt("headerHeight"), o = st("headerFooterTag"), r = kt(
    E.useMemo(
      () => (i) => {
        n(Ht(i, "height"));
      },
      [n]
    ),
    !0,
    !1
  ), s = st("context");
  return e != null ? /* @__PURE__ */ G(o, { ref: r, children: /* @__PURE__ */ G(e, { ...nt(e, s) }) }) : null;
}), Wr = E.memo(function() {
  const e = st("FooterComponent"), n = wt("footerHeight"), o = st("headerFooterTag"), r = kt(
    E.useMemo(
      () => (i) => {
        n(Ht(i, "height"));
      },
      [n]
    ),
    !0,
    !1
  ), s = st("context");
  return e != null ? /* @__PURE__ */ G(o, { ref: r, children: /* @__PURE__ */ G(e, { ...nt(e, s) }) }) : null;
}), Gr = ({ children: t }) => {
  const e = E.useContext(Qn), n = wt("itemDimensions"), o = wt("viewportDimensions"), r = kt(
    E.useMemo(
      () => (s) => {
        o(s.getBoundingClientRect());
      },
      [o]
    ),
    !0,
    !1
  );
  return E.useEffect(() => {
    e && (o({ height: e.viewportHeight, width: e.viewportWidth }), n({ height: e.itemHeight, width: e.itemWidth }));
  }, [e, o, n]), /* @__PURE__ */ G("div", { ref: r, style: Jt(!1), children: t });
}, Ar = ({ children: t }) => {
  const e = E.useContext(Qn), n = wt("windowViewportRect"), o = wt("itemDimensions"), r = st("customScrollParent"), s = Ne(n, r, !1);
  return E.useEffect(() => {
    e && (o({ height: e.itemHeight, width: e.itemWidth }), n({ listHeight: 0, offsetTop: 0, visibleHeight: e.viewportHeight, visibleWidth: e.viewportWidth }));
  }, [e, n, o]), /* @__PURE__ */ G("div", { ref: s, style: Jt(!1), children: t });
}, Mr = /* @__PURE__ */ E.memo(function({ ...e }) {
  const n = st("useWindowScroll"), o = st("customScrollParent"), r = o || n ? Dr : Nr, s = o || n ? Ar : Gr, i = st("context");
  return /* @__PURE__ */ G(r, { ...e, ...nt(r, i), children: /* @__PURE__ */ Dt(s, { children: [
    /* @__PURE__ */ G(Pr, {}),
    /* @__PURE__ */ G(Vr, {}),
    /* @__PURE__ */ G(Wr, {})
  ] }) });
}), {
  Component: _r,
  useEmitter: lo,
  useEmitterValue: st,
  usePublisher: wt
} = /* @__PURE__ */ Ye(
  Fr,
  {
    optional: {
      context: "context",
      totalCount: "totalCount",
      overscan: "overscan",
      itemContent: "itemContent",
      components: "components",
      computeItemKey: "computeItemKey",
      data: "data",
      initialItemCount: "initialItemCount",
      scrollSeekConfiguration: "scrollSeekConfiguration",
      headerFooterTag: "headerFooterTag",
      listClassName: "listClassName",
      itemClassName: "itemClassName",
      useWindowScroll: "useWindowScroll",
      customScrollParent: "customScrollParent",
      scrollerRef: "scrollerRef",
      logLevel: "logLevel",
      restoreStateFrom: "restoreStateFrom",
      initialTopMostItemIndex: "initialTopMostItemIndex",
      increaseViewportBy: "increaseViewportBy"
    },
    methods: {
      scrollTo: "scrollTo",
      scrollBy: "scrollBy",
      scrollToIndex: "scrollToIndex"
    },
    events: {
      isScrolling: "isScrolling",
      endReached: "endReached",
      startReached: "startReached",
      rangeChanged: "rangeChanged",
      atBottomStateChange: "atBottomStateChange",
      atTopStateChange: "atTopStateChange",
      stateChanged: "stateChanged",
      readyStateChanged: "readyStateChanged"
    }
  },
  Mr
), Nr = /* @__PURE__ */ Je({ useEmitter: lo, useEmitterValue: st, usePublisher: wt }), Dr = /* @__PURE__ */ Qe({ useEmitter: lo, useEmitterValue: st, usePublisher: wt });
function On(t, e, n) {
  return e !== "normal" && e?.endsWith("px") !== !0 && n(`${t} was not resolved to pixel value correctly`, e, ft.WARN), e === "normal" ? 0 : parseInt(e ?? "0", 10);
}
const Jr = _r;
export {
  Xr as GroupedTableVirtuoso,
  Yr as GroupedVirtuoso,
  ft as LogLevel,
  Zr as TableVirtuoso,
  qr as Virtuoso,
  Jr as VirtuosoGrid,
  Qn as VirtuosoGridMockContext,
  Re as VirtuosoMockContext
};
