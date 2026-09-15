"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Full-screen WebGL "liquid paper": domain-warped marble in warm cream tones,
 * plus (on the landing page) an ember orb that refracts the paper around it.
 * Pure WebGL1, no dependencies. Falls back to the CSS paper colour.
 */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uOrb;      // px, origin top-left
uniform float uOrbR;    // px
uniform float uOrbOn;
uniform vec2 uMouse;    // px, origin top-left

vec2 hash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(vec2 p) {
  const float K1 = 0.366025404;
  const float K2 = 0.211324865;
  vec2 i = floor(p + (p.x + p.y) * K1);
  vec2 a = p - i + (i.x + i.y) * K2;
  float m = step(a.y, a.x);
  vec2 o = vec2(m, 1.0 - m);
  vec2 b = a - o + K2;
  vec2 c = a - 1.0 + 2.0 * K2;
  vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
  vec3 n = h * h * h * h * vec3(dot(a, hash(i)), dot(b, hash(i + o)), dot(c, hash(i + 1.0)));
  return dot(n, vec3(70.0));
}

float fbm(vec2 p) {
  float f = 0.0;
  float w = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) {
    f += w * noise(p);
    p = m * p;
    w *= 0.5;
  }
  return 0.5 + 0.5 * f;
}

vec3 paper(vec2 p, float t) {
  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.020)), fbm(p + vec2(5.2, 1.3) - t * 0.016));
  vec2 r = vec2(fbm(p + 3.2 * q + vec2(1.7, 9.2) + t * 0.030), fbm(p + 3.2 * q + vec2(8.3, 2.8) - t * 0.024));
  float f = fbm(p + 2.8 * r);

  vec3 shade = vec3(0.868, 0.849, 0.812);
  vec3 base  = vec3(0.929, 0.916, 0.886);
  vec3 light = vec3(0.968, 0.960, 0.943);

  vec3 col = mix(shade, base, smoothstep(0.18, 0.58, f));
  col = mix(col, light, smoothstep(0.50, 0.90, f + 0.22 * r.y));
  // fine pale filaments like pulled paint
  float v = abs(sin((f * 1.3 + 0.4 * q.x) * 11.0));
  col = mix(col, light * 1.01, (1.0 - smoothstep(0.0, 0.07, v)) * 0.35 * smoothstep(0.35, 0.75, r.x));
  col = mix(col, shade * 0.995, (1.0 - smoothstep(0.0, 0.05, abs(sin(f * 7.0 + r.y * 3.0)))) * 0.18);
  return col;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float s = min(uRes.x, uRes.y);
  float t = uTime;
  vec2 p = px / s * 1.12;

  // gentle push around the pointer
  vec2 md = px - uMouse;
  float mInf = exp(-dot(md, md) / (s * s * 0.02));
  p += normalize(md + 0.0001) * mInf * 0.045;

  vec3 col;
  if (uOrbOn > 0.5) {
    vec2 od = px - uOrb;
    float d = length(od) / uOrbR;
    vec2 dir = od / max(length(od), 1.0);

    // liquid lens: paper around the orb is pulled and swirled
    float lens = smoothstep(2.6, 0.9, d);
    float ang = lens * lens * 1.6 + 0.25 * sin(t * 0.4 + d * 3.0) * lens;
    mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
    vec2 orbP = uOrb / s * 1.12;
    vec2 lp = orbP + rot * (p - orbP) - dir * lens * lens * 0.10;
    col = paper(lp, t);

    // soft grey halo hugging the orb
    float halo = exp(-pow((d - 1.12) * 2.6, 2.0));
    col *= 1.0 - 0.085 * halo;
    col = mix(col, vec3(0.975, 0.97, 0.958), 0.45 * exp(-pow((d - 1.6) * 1.9, 2.0)) * (0.7 + 0.3 * fbm(od / uOrbR * 1.5 + t * 0.1)));

    // orb body with a living, noisy rim
    float a = atan(od.y, od.x);
    float rim = 1.0 + (fbm(vec2(a * 1.6, t * 0.25)) - 0.5) * 0.14;
    float body = 1.0 - smoothstep(0.80 * rim, 1.04 * rim, d);
    if (body > 0.0) {
      vec2 op = od / uOrbR;
      float z = sqrt(max(0.0, 1.0 - dot(op, op)));
      vec2 sp = op / (1.0 + z * 0.8);
      // brushy, blocky strokes
      vec2 cell = floor(sp * vec2(16.0, 22.0) + vec2(fbm(sp * 2.5 + t * 0.10), fbm(sp * 2.5 - t * 0.08)) * 3.0);
      float nc = fbm(cell * 0.31 + t * 0.06);
      float n2 = fbm(sp * 3.2 + vec2(t * 0.12, -t * 0.09));
      float n = mix(nc, n2, 0.45);
      vec3 c1 = vec3(0.975, 0.585, 0.320);
      vec3 c2 = vec3(0.925, 0.445, 0.215);
      vec3 c3 = vec3(0.820, 0.300, 0.165);
      vec3 orb = mix(c3, c2, smoothstep(0.32, 0.58, n));
      orb = mix(orb, c1, smoothstep(0.52, 0.80, n * 0.6 + n2 * 0.45));
      float light = clamp(0.74 + 0.30 * z + 0.18 * dot(op, normalize(vec2(-0.6, -0.8))), 0.0, 1.2);
      orb *= light;
      orb += vec3(1.0, 0.72, 0.45) * pow(max(0.0, 1.0 - length(op - vec2(-0.30, -0.36)) * 1.7), 3.0) * 0.22;
      col = mix(col, orb, body);
    }
    // ember bleed into the paper right at the rim
    col = mix(col, vec3(0.92, 0.60, 0.44), 0.16 * exp(-pow((d - 1.0) * 6.0, 2.0)));
  } else {
    col = paper(p, t);
  }

  // very light grain
  float g = fract(sin(dot(px + t, vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("liquid shader:", gl.getShaderInfoLog(sh));
    return null;
  }
  return sh;
}

export function LiquidBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pathname = usePathname();
  const orbOnRef = useRef(pathname === "/");
  orbOnRef.current = pathname === "/";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false, powerPreference: "high-performance" });
    const root = document.documentElement;
    if (!gl) {
      root.dataset.webgl = "0";
      return;
    }
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
      root.dataset.webgl = "0";
      return;
    }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      root.dataset.webgl = "0";
      return;
    }
    root.dataset.webgl = "1";
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = (n: string) => gl.getUniformLocation(prog, n);
    const uRes = u("uRes"), uTime = u("uTime"), uOrb = u("uOrb"), uOrbR = u("uOrbR"), uOrbOn = u("uOrbOn"), uMouse = u("uMouse");

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = 0, h = 0;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.25 : 1.5);
      w = Math.floor(window.innerWidth * dpr);
      h = Math.floor(window.innerHeight * dpr);
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    };
    resize();
    window.addEventListener("resize", resize);

    const mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999 };
    const onMove = (e: PointerEvent) => {
      mouse.tx = e.clientX;
      mouse.ty = e.clientY;
      if (mouse.x < -1000) { mouse.x = e.clientX; mouse.y = e.clientY; }
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let raf = 0;
    let last = performance.now();
    let time = Math.random() * 100;
    const orb = { x: 0, y: 0, init: false };

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      time += dt * (reduced ? 0.15 : 1);

      mouse.x += (mouse.tx - mouse.x) * 0.08;
      mouse.y += (mouse.ty - mouse.y) * 0.08;

      const vw = window.innerWidth, vh = window.innerHeight;
      const radius = Math.max(vw < 768 ? vw * 0.12 : vw * 0.061, 44);
      // Anchored to the hero (scrolls away with it) with a slight pointer drift.
      const hasMouse = mouse.tx > -1000;
      const baseX = vw * 0.5 + (hasMouse ? (mouse.x - vw / 2) * 0.035 : Math.sin(time * 0.3) * 6);
      const baseY = vh * 0.225 - window.scrollY + (hasMouse ? (mouse.y - vh / 2) * 0.03 : Math.cos(time * 0.25) * 5);
      if (!orb.init) { orb.x = baseX; orb.y = baseY; orb.init = true; }
      orb.x += (baseX - orb.x) * 0.06;
      orb.y += (baseY - orb.y) * 0.06;

      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uTime, time);
      gl.uniform2f(uOrb, orb.x * dpr, orb.y * dpr);
      gl.uniform1f(uOrbR, radius * dpr);
      gl.uniform1f(uOrbOn, orbOnRef.current ? 1 : 0);
      gl.uniform2f(uMouse, mouse.x * dpr, mouse.y * dpr);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    };

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />;
}
