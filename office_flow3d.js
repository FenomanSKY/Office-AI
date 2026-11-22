/* V18 [Diubah oleh Gemini - 2026-11-21] Renderer sinar cahaya emissive (GPU continuous ribbon + additive bloom + inti filamen terang) dengan partikel aliran transfer hidup, kometa paket kembali berekor + percikan tiba, pendaran simpul bintang (bukan bola), pola aksesibilitas berbasis ritme/lencana, nol alokasi per frame, 2 geometri dasar. */
(function (root) {
  'use strict';

  const MAX = 128;
  const CURVE_SEGS = 48;
  const MAX_SPRITES = 2048;
  const MAX_CARRIERS = 1536;
  const SPARK_POOL = 96;
  const FADE_DELAY_MS = 1100;
  const FADE_DUR_MS = 900;
  const RETIRE_MS = 2100;
  const STALE_COMPLETED_MS = 12000;
  const HOP_DUR_MS = 240;
  const TAIL_STEPS = 6;
  const FAILED_STATUSES = new Set(['failed', 'rate_limited', 'timed_out', 'cancelled']);
  const SKIP_RETURN_STATUSES = new Set(['expired', 'superseded']);
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Palet sinar 3D bercahaya (hue setia ke office_flow_map.json, kontras tinggi di lantai kayu oranye terang & tema gelap, tanpa cokelat kusam).
  const LUMINOUS_PRESETS = {
    '#967029': { body: '#d97706', glow: '#ffe047' }, // Secretary / Short Video Coach -> emas amber bercahaya
    '#b6673e': { body: '#e03a16', glow: '#ff7043' }, // Claude -> oranye-koral menyala tajam
    '#258675': { body: '#05967e', glow: '#2effdc' }, // Codex / Researcher -> teal-sian neon
    '#6076c6': { body: '#2554e6', glow: '#6ca6ff' }, // Gemini -> biru safir menyala
    '#9270b7': { body: '#7c3aed', glow: '#c084fc' }, // OpenCode / Software Architect -> violet elektrik
    '#a17424': { body: '#d98a00', glow: '#fde047' }, // Hermes / Social Media -> amber cerah
    '#23875f': { body: '#059e5e', glow: '#3dffab' }, // Return packet -> hijau zamrud menyala
    '#c44e59': { body: '#d90429', glow: '#ff2a4b' }, // Failed / Reality Checker -> merah kirmizi terang
    '#347fc0': { body: '#0f73d6', glow: '#5cc8ff' }, // Frontend Developer -> biru langit menyala
    '#27898a': { body: '#0491b0', glow: '#4ce8ff' }, // Mobile App Builder -> sian cerah
    '#b15c99': { body: '#d41b88', glow: '#ff6ec7' }, // UI Designer -> magenta neon
    '#7f74b9': { body: '#5c4ce0', glow: '#a99eff' }, // Technical Writer -> indigo lavender
    '#9b7358': { body: '#d95f1e', glow: '#ffa96b' }, // Project Shepherd -> aprikot hangat
    '#687787': { body: '#376eb0', glow: '#8cc8ff' }  // Boss / General / Desktop / Other -> biru es perak
  };

  function boostLuminousColor(T, hex, target) {
    const key = typeof hex === 'string' ? hex.toLowerCase() : '#687787';
    const preset = LUMINOUS_PRESETS[key];
    if (preset) {
      target.body.set(preset.body);
      target.glow.set(preset.glow);
      return target;
    }
    const hsl = { h: 0, s: 0, l: 0 };
    target.body.set(key);
    target.body.getHSL(hsl);
    target.body.setHSL(hsl.h, Math.min(1, Math.max(0.76, hsl.s * 1.35)), Math.min(0.60, Math.max(0.48, hsl.l * 1.12)));
    target.glow.setHSL(hsl.h, Math.min(1, Math.max(0.88, hsl.s * 1.45)), Math.min(0.78, Math.max(0.66, hsl.l * 1.38)));
    return target;
  }

  function buildBeamGeometry(T) {
    const vertsPerBeam = (CURVE_SEGS + 1) * 2;
    const positions = new Float32Array(vertsPerBeam * 3);
    const uvs = new Float32Array(vertsPerBeam * 2);
    const indices = new Uint16Array(CURVE_SEGS * 6);
    for (let i = 0; i <= CURVE_SEGS; i++) {
      const u = i / CURVE_SEGS;
      const vi = i * 2;
      positions[vi * 3] = u;
      positions[vi * 3 + 1] = -1;
      positions[(vi + 1) * 3] = u;
      positions[(vi + 1) * 3 + 1] = 1;
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = -1;
      uvs[(vi + 1) * 2] = u;
      uvs[(vi + 1) * 2 + 1] = 1;
      if (i < CURVE_SEGS) {
        const ii = i * 6;
        indices[ii] = vi;
        indices[ii + 1] = vi + 1;
        indices[ii + 2] = vi + 2;
        indices[ii + 3] = vi + 1;
        indices[ii + 4] = vi + 3;
        indices[ii + 5] = vi + 2;
      }
    }
    const geo = new T.InstancedBufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(positions, 3));
    geo.setAttribute('aUv', new T.BufferAttribute(uvs, 2));
    geo.setIndex(new T.BufferAttribute(indices, 1));
    const dyn = (arr, itemSize) => {
      const attr = new T.InstancedBufferAttribute(arr, itemSize);
      attr.setUsage(T.DynamicDrawUsage);
      return attr;
    };
    geo.setAttribute('aStart', dyn(new Float32Array(MAX * 3), 3));
    geo.setAttribute('aEnd', dyn(new Float32Array(MAX * 3), 3));
    geo.setAttribute('aBodyColor', dyn(new Float32Array(MAX * 3), 3));
    geo.setAttribute('aGlowColor', dyn(new Float32Array(MAX * 3), 3));
    // aMeta: x=arch, y=lateralOffset, z=halfWidth, w=alpha
    geo.setAttribute('aMeta', dyn(new Float32Array(MAX * 4), 4));
    // aState: x=grow(0..1), y=patternId(0/1/2), z=statusMode(0=dispatch,1=work,2=done,3=fail), w=phaseSeed
    geo.setAttribute('aState', dyn(new Float32Array(MAX * 4), 4));
    // aLen: arcLen in world meters
    geo.setAttribute('aLen', dyn(new Float32Array(MAX), 1));
    geo.instanceCount = 0;
    return geo;
  }

  function buildSpriteGeometry(T, capacity) {
    const positions = new Float32Array([
      -1, -1, 0,
       1, -1, 0,
      -1,  1, 0,
       1,  1, 0
    ]);
    const uvs = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1
    ]);
    const indices = new Uint16Array([0, 1, 2, 1, 3, 2]);
    const geo = new T.InstancedBufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(positions, 3));
    geo.setAttribute('aQuad', new T.BufferAttribute(uvs, 2));
    geo.setIndex(new T.BufferAttribute(indices, 1));
    const dyn = (arr, itemSize) => {
      const attr = new T.InstancedBufferAttribute(arr, itemSize);
      attr.setUsage(T.DynamicDrawUsage);
      return attr;
    };
    geo.setAttribute('aPos', dyn(new Float32Array(capacity * 3), 3));
    geo.setAttribute('aDir', dyn(new Float32Array(capacity * 3), 3));
    geo.setAttribute('aColor', dyn(new Float32Array(capacity * 3), 3));
    // aParams: x=length, y=width, z=alpha, w=kind(0=transfer,1=node,2=comet,3=spark)
    geo.setAttribute('aParams', dyn(new Float32Array(capacity * 4), 4));
    geo.instanceCount = 0;
    return geo;
  }

  const BEAM_VERT = `
    attribute vec2 aUv;
    attribute vec3 aStart;
    attribute vec3 aEnd;
    attribute vec3 aBodyColor;
    attribute vec3 aGlowColor;
    attribute vec4 aMeta;
    attribute vec4 aState;
    attribute float aLen;
    uniform float uWidthMul;
    varying vec2 vUv;
    varying vec3 vBodyColor;
    varying vec3 vGlowColor;
    varying vec4 vState;
    varying float vAlpha;
    varying float vArcLen;
    varying float vRawU;
    void main() {
      float grow = max(0.02, aState.x);
      float u = aUv.x * grow;
      float arch = aMeta.x;
      float latOff = aMeta.y;
      float halfW = aMeta.z * uWidthMul;
      vec3 chord = aEnd - aStart;
      float hLen = length(chord.xz);
      vec3 lateral = hLen > 0.001 ? normalize(vec3(-chord.z, 0.0, chord.x)) : vec3(0.0, 0.0, 1.0);
      float s = sin(3.14159265 * u);
      float c = cos(3.14159265 * u);
      vec3 center = mix(aStart, aEnd, u);
      center.y += s * arch;
      center += lateral * (s * latOff);
      vec3 tangent = chord;
      tangent.y += 3.14159265 * c * arch;
      tangent += lateral * (3.14159265 * c * latOff);
      tangent = normalize(tangent + vec3(1e-5, 0.0, 0.0));
      vec3 viewDir = normalize(cameraPosition - center);
      vec3 side = cross(tangent, viewDir);
      float sLen = length(side);
      side = sLen > 0.0001 ? (side / sLen) : lateral;
      // Ramping lembut di dekat ujung agar menyatu dengan pendaran simpul
      float endTaper = smoothstep(0.0, 0.06, aUv.x) * smoothstep(1.0, 0.94, aUv.x);
      float w = halfW * (0.72 + 0.28 * endTaper);
      vec3 worldPos = center + side * (aUv.y * w);
      vUv = vec2(u, aUv.y);
      vRawU = aUv.x;
      vBodyColor = aBodyColor;
      vGlowColor = aGlowColor;
      vState = aState;
      vAlpha = aMeta.w;
      vArcLen = aLen;
      gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
    }
  `;

  const BEAM_BASE_FRAG = `
    uniform float uTime;
    uniform float uDarkScene;
    varying vec2 vUv;
    varying vec3 vBodyColor;
    varying vec3 vGlowColor;
    varying vec4 vState;
    varying float vAlpha;
    varying float vArcLen;
    varying float vRawU;
    void main() {
      float absV = abs(vUv.y);
      float edgeMask = smoothstep(1.0, 0.42, absV);
      if (edgeMask <= 0.001 || vAlpha <= 0.001) discard;
      float dist = vUv.x * vArcLen;
      float pat = vState.y;
      float mode = vState.z;
      float phase = vState.w;
      float speed = mode < 0.5 ? 6.2 : (mode < 1.5 ? 3.2 : (mode < 2.5 ? 1.4 : 6.8));

      float core = exp(-absV * absV * 11.0);
      float aura = exp(-absV * absV * 3.4) * edgeMask;
      float endFade = smoothstep(0.0, 0.032, vRawU) * smoothstep(1.0, 0.968, vRawU);

      float rhythm = 1.0;
      if (mode > 2.5) {
        // Gagal / limit: merah kirmizi murni (linear RGB) berkedip putus-putus yang sangat jelas bahkan di lantai terang
        float dash = smoothstep(0.10, 0.35, sin(dist * 3.2 - uTime * 7.2 + phase));
        float blink = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 10.5 + phase * 1.7));
        rhythm = (0.06 + 0.94 * dash) * blink;
        vec3 redCol = mix(vec3(0.82, 0.006, 0.010), vec3(1.0, 0.04, 0.04), core * 0.65);
        float redAlpha = (aura * 0.88 + core * 0.86) * rhythm * endFade * vAlpha;
        gl_FragColor = vec4(redCol, clamp(redAlpha, 0.0, 0.96));
        #include <tonemapping_fragment>
        #include <encodings_fragment>
        return;
      } else if (pat > 1.5) {
        // Dotted: sinar halus ber-ritme manik cepat (bukan blok putus)
        float beads = pow(0.5 + 0.5 * sin(dist * 3.8 - uTime * speed * 1.2 + phase), 2.4);
        rhythm = 0.54 + 0.46 * beads;
      } else if (pat > 0.5) {
        // Dashed: sinar kontinu dengan gelombang pasangan denyut berirama
        float wave = smoothstep(-0.15, 0.55, sin(dist * 1.75 - uTime * speed + phase));
        rhythm = 0.60 + 0.40 * wave;
      } else {
        // Solid: aliran shimmer lembut kontinu
        float shimmer = 0.86 + 0.14 * sin(dist * 1.35 - uTime * speed + phase);
        rhythm = shimmer;
      }

      // Warna kaya jenuh di lantai kayu oranye terang (tanpa outline hitam); lebih ringan di adegan malam
      vec3 deepTint = vBodyColor * mix(0.72, 0.92, uDarkScene);
      vec3 col = mix(deepTint, vGlowColor, core * 0.46);
      float dayBoost = mix(1.0, 0.66, uDarkScene);
      float alpha = (aura * 0.72 + core * 0.68) * dayBoost * rhythm * endFade * vAlpha;
      gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95));
      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }
  `;

  const BEAM_GLOW_FRAG = `
    uniform float uTime;
    uniform float uDarkScene;
    varying vec2 vUv;
    varying vec3 vBodyColor;
    varying vec3 vGlowColor;
    varying vec4 vState;
    varying float vAlpha;
    varying float vArcLen;
    varying float vRawU;
    void main() {
      float absV = abs(vUv.y);
      float edgeMask = smoothstep(1.0, 0.22, absV);
      if (edgeMask <= 0.001 || vAlpha <= 0.001) discard;
      float dist = vUv.x * vArcLen;
      float grow = vState.x;
      float pat = vState.y;
      float mode = vState.z;
      float phase = vState.w;
      float speed = mode < 0.5 ? 6.5 : (mode < 1.5 ? 3.4 : (mode < 2.5 ? 1.5 : 7.0));
      float modeEnergy = mode < 0.5 ? 1.15 : (mode < 1.5 ? 0.84 : (mode < 2.5 ? 0.54 : 1.18));

      // Inti filamen sangat tajam & tipis + halo warna lembut (bahu sinar tetap berwarna kaya, tidak memutih polos)
      float filament = exp(-absV * absV * 195.0);
      float innerBloom = exp(-absV * absV * 28.0);
      float outerHalo = exp(-absV * absV * 4.4) * edgeMask;
      float endFade = smoothstep(0.0, 0.03, vRawU) * smoothstep(1.0, 0.96, vRawU);

      float breathe = 0.86 + 0.14 * sin(uTime * 2.8 + phase);
      float pulseFlow = 0.5 + 0.5 * sin(dist * 1.45 - uTime * speed + phase);
      float travelWave = pow(pulseFlow, 3.2);
      float rhythm = 1.0;

      if (mode > 2.5) {
        float dash = smoothstep(0.10, 0.35, sin(dist * 3.2 - uTime * 7.2 + phase));
        float blink = 0.22 + 0.78 * (0.5 + 0.5 * sin(uTime * 10.5 + phase * 1.7));
        rhythm = (0.04 + 0.96 * dash) * blink;
        vec3 redHot = mix(vec3(1.0, 0.03, 0.03), vec3(1.0, 0.45, 0.42), filament * 0.55);
        float redAlpha = (filament * 0.82 + innerBloom * 0.58 + outerHalo * mix(0.26, 0.60, uDarkScene)) * rhythm * endFade * vAlpha;
        gl_FragColor = vec4(redHot, clamp(redAlpha, 0.0, 1.0));
        #include <tonemapping_fragment>
        #include <encodings_fragment>
        return;
      } else if (pat > 1.5) {
        float beads = pow(0.5 + 0.5 * sin(dist * 3.8 - uTime * speed * 1.2 + phase), 3.4);
        rhythm = 0.42 + 0.72 * beads;
        travelWave = beads;
      } else if (pat > 0.5) {
        float pair = smoothstep(-0.15, 0.65, sin(dist * 1.75 - uTime * speed + phase));
        rhythm = 0.48 + 0.62 * pair;
        travelWave = pair * 0.90;
      } else {
        rhythm = 0.76 + 0.38 * travelWave;
      }

      float growTip = (1.0 - smoothstep(0.92, 0.995, grow)) * smoothstep(0.76, 1.0, vRawU) * 1.2;

      vec3 whiteHot = mix(vGlowColor, vec3(1.0, 0.99, 0.97), 0.54);
      vec3 col = mix(vGlowColor, whiteHot, clamp(filament * 0.92 + travelWave * 0.22 + growTip * 0.55, 0.0, 1.0));
      float haloStrength = mix(0.22, 0.58, uDarkScene);
      float coreStrength = mix(0.76, 1.08, uDarkScene);
      float alpha = (filament * coreStrength + innerBloom * (0.40 + 0.36 * travelWave) + outerHalo * haloStrength + growTip * innerBloom)
        * modeEnergy * breathe * rhythm * endFade * vAlpha;

      gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }
  `;

  const SPRITE_VERT = `
    attribute vec2 aQuad;
    attribute vec3 aPos;
    attribute vec3 aDir;
    attribute vec3 aColor;
    attribute vec4 aParams;
    varying vec2 vQuad;
    varying vec3 vColor;
    varying float vAlpha;
    varying float vKind;
    void main() {
      vec3 viewDir = normalize(cameraPosition - aPos);
      vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 axisA;
      vec3 axisB;
      float dirLen = length(aDir);
      if (dirLen > 0.001) {
        // Proyeksikan vektor arah gerak ke bidang kamera agar partikel/kometa sejajar kurva
        vec3 proj = aDir - viewDir * dot(aDir, viewDir);
        float pLen = length(proj);
        axisA = pLen > 0.0005 ? (proj / pLen) : camRight;
        axisB = normalize(cross(viewDir, axisA));
      } else {
        axisA = camRight;
        axisB = camUp;
      }
      vec3 worldPos = aPos + axisA * (aQuad.x * aParams.x) + axisB * (aQuad.y * aParams.y);
      vQuad = aQuad;
      vColor = aColor;
      vAlpha = aParams.z;
      vKind = aParams.w;
      gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
    }
  `;

  const SPRITE_CARRIER_FRAG = `
    uniform float uDarkScene;
    varying vec2 vQuad;
    varying vec3 vColor;
    varying float vAlpha;
    varying float vKind;
    void main() {
      float r2 = dot(vQuad, vQuad);
      if (r2 >= 1.0 || vAlpha <= 0.001) discard;
      float soft = exp(-r2 * 4.5) * smoothstep(1.0, 0.35, sqrt(r2));
      float core = exp(-r2 * 14.0);
      // Carrier lembut berwarna kaya agar kometa, partikel & simpul kontras tegas di lantai oranye terang
      float strength = vKind > 1.5 && vKind < 2.5 ? 0.96 : (vKind > 0.5 && vKind < 1.5 ? 0.64 : 0.88);
      float dayBoost = mix(1.0, 0.64, uDarkScene);
      vec3 col = mix(vColor * 0.72, vColor, core);
      float alpha = (soft * 0.70 + core * 0.78) * strength * dayBoost * vAlpha;
      gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.96));
      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }
  `;

  const SPRITE_GLOW_FRAG = `
    uniform float uDarkScene;
    varying vec2 vQuad;
    varying vec3 vColor;
    varying float vAlpha;
    varying float vKind;
    void main() {
      float r2 = dot(vQuad, vQuad);
      if (r2 >= 1.0 || vAlpha <= 0.001) discard;
      float r = sqrt(r2);
      float edge = smoothstep(1.0, 0.25, r);
      float halo = exp(-r2 * 4.2) * edge;
      float core = exp(-r2 * 24.0);
      vec3 whiteHot = mix(vColor, vec3(1.0, 1.0, 0.98), 0.84);
      float alpha = 0.0;
      vec3 col = vColor;
      if (vKind > 0.5 && vKind < 1.5) {
        // Kind 1: Ujung simpul berpendar kecil + bintang 4-arah mikro (bukan bola)
        float starH = exp(-abs(vQuad.y) * 13.0) * exp(-abs(vQuad.x) * 3.0);
        float starV = exp(-abs(vQuad.x) * 13.0) * exp(-abs(vQuad.y) * 3.0);
        float star = (starH + starV) * 0.72 * edge;
        col = mix(vColor, whiteHot, clamp(core * 0.9 + star * 0.45, 0.0, 1.0));
        alpha = (core * 0.95 + star * 0.65 + halo * mix(0.36, 0.58, uDarkScene)) * vAlpha;
      } else if (vKind > 1.5 && vKind < 2.5) {
        // Kind 2: Kepala kometa paket kembali (sangat terang, inti putih-hijau + kilau bintang)
        float starH = exp(-abs(vQuad.y) * 11.0) * exp(-abs(vQuad.x) * 2.4);
        float starV = exp(-abs(vQuad.x) * 11.0) * exp(-abs(vQuad.y) * 2.4);
        float star = (starH + starV) * 0.55 * edge;
        col = mix(vColor, vec3(1.0, 1.0, 1.0), clamp(core * 0.98 + star * 0.35, 0.0, 1.0));
        alpha = (core * 1.25 + star * 0.55 + halo * mix(0.62, 0.85, uDarkScene)) * vAlpha;
      } else if (vKind > 2.5) {
        // Kind 3: Percikan tiba kecil tajam
        float sharp = exp(-r2 * 18.0);
        col = mix(vColor, vec3(1.0, 1.0, 0.98), sharp * 0.92);
        alpha = (sharp * 1.15 + halo * 0.45) * vAlpha;
      } else {
        // Kind 0: Partikel transfer cahaya memanjang dengan kepala terang + ekor tipis
        float tailBias = smoothstep(-1.0, 0.45, vQuad.x);
        float head = exp(-(pow(vQuad.x - 0.18, 2.0) * 9.0 + vQuad.y * vQuad.y * 22.0));
        float streak = exp(-(vQuad.x * vQuad.x * 2.4 + vQuad.y * vQuad.y * 12.0)) * (0.45 + 0.55 * tailBias) * edge;
        col = mix(vColor, whiteHot, clamp(head * 0.92 + streak * 0.28, 0.0, 1.0));
        alpha = (head * 1.05 + streak * 0.65 + halo * mix(0.28, 0.48, uDarkScene)) * vAlpha;
      }
      gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }
  `;

  function buildBadgeSvg(pattern, accent, isFailed, showPattern) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 18 10');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('office-flow-badge');
    const col = isFailed ? '#eb263e' : accent;
    if (!showPattern && !isFailed) {
      const glow = document.createElementNS(SVG_NS, 'circle');
      glow.setAttribute('cx', '9');
      glow.setAttribute('cy', '5');
      glow.setAttribute('r', '4');
      glow.setAttribute('fill', col);
      glow.setAttribute('opacity', '0.35');
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', '9');
      dot.setAttribute('cy', '5');
      dot.setAttribute('r', '2.2');
      dot.setAttribute('fill', col);
      svg.append(glow, dot);
      return svg;
    }
    if (isFailed || pattern === 'dashed') {
      // Dua ruas berpasangan yang jelas (mudah dibedakan dari solid di tema terang & gelap)
      for (const [x1, x2] of [[1.5, 7.2], [10.8, 16.5]]) {
        const seg = document.createElementNS(SVG_NS, 'line');
        seg.setAttribute('x1', String(x1));
        seg.setAttribute('y1', '5');
        seg.setAttribute('x2', String(x2));
        seg.setAttribute('y2', '5');
        seg.setAttribute('stroke', col);
        seg.setAttribute('stroke-width', '2.4');
        seg.setAttribute('stroke-linecap', 'round');
        svg.append(seg);
      }
      return svg;
    }
    if (pattern === 'dotted') {
      // Tiga titik berkilau terpisah jelas
      for (const cx of [3.2, 9, 14.8]) {
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', String(cx));
        dot.setAttribute('cy', '5');
        dot.setAttribute('r', '1.85');
        dot.setAttribute('fill', col);
        svg.append(dot);
      }
      return svg;
    }
    // Solid: garis utuh penuh dengan simpul bercahaya berwarna (tidak terbelah di latar putih)
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', '1.5');
    line.setAttribute('y1', '5');
    line.setAttribute('x2', '16.5');
    line.setAttribute('y2', '5');
    line.setAttribute('stroke', col);
    line.setAttribute('stroke-width', '2.5');
    line.setAttribute('stroke-linecap', 'round');
    const ring = document.createElementNS(SVG_NS, 'circle');
    ring.setAttribute('cx', '9');
    ring.setAttribute('cy', '5');
    ring.setAttribute('r', '2.4');
    ring.setAttribute('fill', col);
    const spark = document.createElementNS(SVG_NS, 'circle');
    spark.setAttribute('cx', '9');
    spark.setAttribute('cy', '5');
    spark.setAttribute('r', '0.95');
    spark.setAttribute('fill', '#ffffff');
    svg.append(line, ring, spark);
    return svg;
  }

  function create({ THREE: T, scene, anchorFor, recoverAnchor, map, onReturn = () => {}, onVisible = () => {}, onSelectNode = () => {}, labelFor = n => n.label, container }) {
    const records = new Map();
    const returned = new Map();
    const retired = new Map();
    const nodeFlash = new Map();
    const labels = [];
    const pendingVisible = [];
    const group = new T.Group();
    group.name = 'office-flow';
    scene.add(group);

    const defaults = { enabled: true, maxVisibleEdges: 128, thickness: 1, patterns: true, paused: false, walkAnimation: 'fast' };
    let settings = { ...defaults };
    let clock = 0;
    let animClock = 0;
    let lastReal = null;
    let visibleEdges = 0;
    let failedBeams = 0;
    let activeReturnPackets = 0;
    let activeParticleCount = 0;
    let activeNodeCount = 0;
    let activeSparkCount = 0;
    let firstVisibleAt = null;
    let disposed = false;
    // V21 [Diubah oleh Codex - 2026-11-22] A missing endpoint must recover to a real actor, never empty space.
    let anchorRecoveries = 0, missingAnchors = 0;
    const warnedAnchors = new Set();
    const validAnchor = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
    function endpoint(node, flow) {
      const point = anchorFor(node, flow);
      if (validAnchor(point)) return point;
      const key = flow.id + '|' + node.id;
      if (!warnedAnchors.has(key)) {
        warnedAnchors.add(key);
        if (warnedAnchors.size > 256) warnedAnchors.delete(warnedAnchors.values().next().value);
        console.warn('V21: recovering missing flow anchor');
      }
      const fallback = recoverAnchor?.(node, flow) || anchorFor(flow.nodes.find(n => n.role === 'boss'), flow);
      if (validAnchor(fallback)) { anchorRecoveries++; return fallback; }
      missingAnchors++; return null;
    }

    // Pool tetap tanpa alokasi per frame
    const tmpA = new T.Vector3();
    const tmpB = new T.Vector3();
    const tmpPos = new T.Vector3();
    const tmpTan = new T.Vector3();
    const tmpLat = new T.Vector3();
    const tmpProj = new T.Vector3();
    const tmpColorPair = { body: new T.Color(), glow: new T.Color() };
    const tmpRetPair = { body: new T.Color(), glow: new T.Color() };
    const tmpNodePair = { body: new T.Color(), glow: new T.Color() };
    const particleSample = [];

    // Pool percikan tiba (arrival burst)
    const sparks = Array.from({ length: SPARK_POOL }, () => ({
      active: false,
      born: 0,
      life: 380,
      ox: 0, oy: 0, oz: 0,
      vx: 0, vy: 0, vz: 0,
      r: 1, g: 1, b: 1,
      size: 0.16
    }));
    let sparkCursor = 0;

    function spawnBurst(origin, colorObj, count = 7) {
      if (settings.walkAnimation === 'off') return;
      for (let i = 0; i < count; i++) {
        const sp = sparks[sparkCursor];
        sparkCursor = (sparkCursor + 1) % SPARK_POOL;
        const ang = (i / count) * Math.PI * 2 + (clock * 0.013);
        const speed = 1.2 + (i % 3) * 0.45;
        sp.active = true;
        sp.born = clock;
        sp.life = 340 + (i % 2) * 70;
        sp.ox = origin.x;
        sp.oy = origin.y;
        sp.oz = origin.z;
        sp.vx = Math.cos(ang) * speed;
        sp.vy = 0.75 + (i % 3) * 0.35;
        sp.vz = Math.sin(ang) * speed;
        sp.r = colorObj.r;
        sp.g = colorObj.g;
        sp.b = colorObj.b;
        sp.size = 0.14 + (i % 2) * 0.05;
      }
    }

    // 2 Geometri dasar & 4 ShaderMaterial (<= 4 draw call untuk seluruh sinar + partikel + kometa + simpul + percikan)
    const beamGeo = buildBeamGeometry(T);
    const carrierGeo = buildSpriteGeometry(T, MAX_CARRIERS);
    const glowGeo = buildSpriteGeometry(T, MAX_SPRITES);

    const beamBaseMat = new T.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDarkScene: { value: 0 },
        uWidthMul: { value: 2.35 }
      },
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_BASE_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: T.DoubleSide,
      blending: T.NormalBlending
    });

    const beamGlowMat = new T.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDarkScene: { value: 0 },
        uWidthMul: { value: 3.75 }
      },
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_GLOW_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: T.DoubleSide,
      blending: T.AdditiveBlending
    });

    const carrierMat = new T.ShaderMaterial({
      uniforms: { uDarkScene: { value: 0 } },
      vertexShader: SPRITE_VERT,
      fragmentShader: SPRITE_CARRIER_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: T.DoubleSide,
      blending: T.NormalBlending
    });

    const glowMat = new T.ShaderMaterial({
      uniforms: { uDarkScene: { value: 0 } },
      vertexShader: SPRITE_VERT,
      fragmentShader: SPRITE_GLOW_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: T.DoubleSide,
      blending: T.AdditiveBlending
    });

    const beamBaseMesh = new T.Mesh(beamGeo, beamBaseMat);
    beamBaseMesh.frustumCulled = false;
    beamBaseMesh.renderOrder = 23;
    const beamGlowMesh = new T.Mesh(beamGeo, beamGlowMat);
    beamGlowMesh.frustumCulled = false;
    beamGlowMesh.renderOrder = 24;
    const carrierMesh = new T.Mesh(carrierGeo, carrierMat);
    carrierMesh.frustumCulled = false;
    carrierMesh.renderOrder = 25;
    const glowMesh = new T.Mesh(glowGeo, glowMat);
    glowMesh.frustumCulled = false;
    glowMesh.renderOrder = 26;

    group.add(beamBaseMesh, beamGlowMesh, carrierMesh, glowMesh);
    const meshes = [beamBaseMesh, beamGlowMesh, carrierMesh, glowMesh];
    const geometries = [beamGeo, carrierGeo, glowGeo];
    const materials = [beamBaseMat, beamGlowMat, carrierMat, glowMat];

    const bStart = beamGeo.attributes.aStart;
    const bEnd = beamGeo.attributes.aEnd;
    const bBody = beamGeo.attributes.aBodyColor;
    const bGlow = beamGeo.attributes.aGlowColor;
    const bMeta = beamGeo.attributes.aMeta;
    const bState = beamGeo.attributes.aState;
    const bLen = beamGeo.attributes.aLen;

    const cPos = carrierGeo.attributes.aPos;
    const cDir = carrierGeo.attributes.aDir;
    const cCol = carrierGeo.attributes.aColor;
    const cPar = carrierGeo.attributes.aParams;

    const gPos = glowGeo.attributes.aPos;
    const gDir = glowGeo.attributes.aDir;
    const gCol = glowGeo.attributes.aColor;
    const gPar = glowGeo.attributes.aParams;

    const layer = typeof document === 'object' ? document.createElement('div') : null;
    if (layer) {
      layer.classList.add('office-flow-labels');
      Object.assign(layer.style, {
        position: 'absolute',
        inset: '0',
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: '5'
      });
      (container || document.getElementById('stage'))?.append(layer);
    }

    const edgeKey = (flow, edge) => flow.id + '|' + edge.from + '|' + edge.to + '|' + edge.kind + '|' + edge.startedAt;
    const nodeIdentity = (node, text) => node.visual?.identity || (node.role === 'boss' ? 'boss' : node.role === 'secretary' ? 'secretary' : node.role === 'persona' ? 'persona:' + (node.agent || node.persona || text) : 'agent:' + (node.provider || '') + ':' + text);
    const nodeAccent = (node, fallback) => node.role === 'boss' ? (map?.roles?.boss?.color || '#687787') : node.role === 'secretary' ? (map?.roles?.secretary?.color || '#967029') : fallback;
    const patternNum = p => (p === 'dotted' ? 2 : p === 'dashed' ? 1 : 0);

    function detectDarkScene() {
      if (typeof document !== 'object') return 0;
      const stageBg = layer?.parentElement?.style?.background || '';
      if (stageBg.includes('night')) return 1.0;
      if (stageBg.includes('dusk')) return 0.72;
      return document.documentElement.dataset.theme === 'dark' ? 0.32 : 0.0;
    }

    function evalCurve(a, b, u, arch, latOff, outPos, outTan) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const hLen = Math.hypot(dx, dz);
      const lx = hLen > 0.001 ? -dz / hLen : 0;
      const lz = hLen > 0.001 ? dx / hLen : 1;
      const piU = Math.PI * u;
      const s = Math.sin(piU);
      const c = Math.cos(piU);
      outPos.set(
        a.x + dx * u + lx * s * latOff,
        a.y + dy * u + s * arch,
        a.z + dz * u + lz * s * latOff
      );
      if (outTan) {
        outTan.set(
          dx + lx * Math.PI * c * latOff,
          dy + Math.PI * c * arch,
          dz + lz * Math.PI * c * latOff
        ).normalize();
      }
      return outPos;
    }

    function pushCarrier(idx, p, dir, col, len, wid, alpha, kind) {
      if (idx >= MAX_CARRIERS) return idx;
      cPos.setXYZ(idx, p.x, p.y, p.z);
      if (dir) cDir.setXYZ(idx, dir.x, dir.y, dir.z);
      else cDir.setXYZ(idx, 0, 0, 0);
      cCol.setXYZ(idx, col.r, col.g, col.b);
      cPar.setXYZW(idx, len, wid, alpha, kind);
      return idx + 1;
    }

    function pushGlow(idx, p, dir, col, len, wid, alpha, kind) {
      if (idx >= MAX_SPRITES) return idx;
      gPos.setXYZ(idx, p.x, p.y, p.z);
      if (dir) gDir.setXYZ(idx, dir.x, dir.y, dir.z);
      else gDir.setXYZ(idx, 0, 0, 0);
      gCol.setXYZ(idx, col.r, col.g, col.b);
      gPar.setXYZW(idx, len, wid, alpha, kind);
      return idx + 1;
    }

    function retireCompleted(flows) {
      if (disposed || !Array.isArray(flows)) return;
      for (const flow of flows) {
        if (flow.endedAt === null) continue;
        for (const edge of flow.edges || []) {
          const key = edgeKey(flow, edge);
          if (!records.has(key)) {
            retired.set(key, true);
            if (edge.kind === 'return') returned.set(key, true);
          }
        }
      }
      while (retired.size > 2048) retired.delete(retired.keys().next().value);
      while (returned.size > 2048) returned.delete(returned.keys().next().value);
    }

    function sync(flows) {
      if (disposed) return;
      const nowWall = Date.now();
      const candidates = [];
      for (const flow of [...flows].sort((a, b) => Number(a.endedAt !== null) - Number(b.endedAt !== null) || b.updatedAt - a.updatedAt)) {
        const byId = new Map(flow.nodes.map(n => [n.id, n]));
        const depth = id => {
          let n = id, d = 0;
          const seen = new Set();
          while (d < 16 && !seen.has(n)) {
            seen.add(n);
            const p = flow.edges.find(e => e.kind !== 'return' && e.to === n);
            if (!p) break;
            n = p.from;
            d++;
          }
          return d;
        };
        for (const edge of flow.edges) {
          if (edge.kind === 'return' && SKIP_RETURN_STATUSES.has(flow.status)) continue;
          const key = edgeKey(flow, edge);
          // Jangan tampilkan sinar untuk alur yang sudah selesai > N detik (alur historis lama)
          if (!records.has(key) && flow.endedAt !== null && flow.endedAt > 1e12 && nowWall - flow.endedAt > STALE_COMPLETED_MS) {
            retired.set(key, true);
            if (edge.kind === 'return') returned.set(key, true);
            continue;
          }
          candidates.push({ flow, edge, from: byId.get(edge.from), to: byId.get(edge.to), depth: depth(edge.from) });
        }
      }
      candidates.sort((a, b) =>
        Number(a.flow.endedAt !== null) - Number(b.flow.endedAt !== null) ||
        b.flow.updatedAt - a.flow.updatedAt ||
        Number(b.edge.kind === 'return') - Number(a.edge.kind === 'return')
      );
      const wanted = new Set();
      let seedCounter = 0;
      for (const item of candidates.filter(item => !retired.has(edgeKey(item.flow, item.edge))).slice(0, settings.maxVisibleEdges)) {
        if (!item.from || !item.to) continue;
        const key = edgeKey(item.flow, item.edge);
        wanted.add(key);
        let rec = records.get(key);
        if (!rec) {
          const delay = item.edge.kind === 'return' ? Math.max(0, 2 - item.depth) * HOP_DUR_MS : 0;
          let h = 2166136261;
          for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
          rec = {
            born: clock,
            start: clock + delay,
            ended: null,
            returnDone: returned.has(key),
            phase: ((h >>> 0) % 6283) / 1000 + seedCounter++ * 0.37
          };
          records.set(key, rec);
        }
        if (item.edge.endedAt !== null && rec.ended === null) rec.ended = clock;
        Object.assign(rec, item, { key });
      }
      for (const [key, rec] of records) {
        if (!wanted.has(key)) {
          if (rec.ended === null) rec.ended = clock;
          if (clock - rec.ended > 1200) records.delete(key);
        }
      }
      while (records.size > settings.maxVisibleEdges) {
        const key = [...records.keys()].find(k => !wanted.has(k)) || records.keys().next().value;
        records.delete(key);
      }
    }

    function placeLabel(index, info) {
      if (!layer || index >= 24) return;
      let entry = labels[index];
      if (!entry) {
        const el = document.createElement('span');
        el.classList.add('office-flow-label');
        Object.assign(el.style, {
          position: 'absolute',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          font: '700 11px/1.2 system-ui,-apple-system,sans-serif',
          padding: '3px 7px',
          borderRadius: '7px',
          whiteSpace: 'nowrap',
          background: 'var(--surface, #ffffff)',
          color: 'var(--ink, #14261f)',
          border: '1.5px solid currentColor',
          borderLeftWidth: '4px',
          boxShadow: '0 2px 8px rgba(10,18,24,0.24)',
          maxWidth: '176px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          letterSpacing: '0.01em'
        });
        const badgeSlot = document.createElement('span');
        badgeSlot.classList.add('office-flow-label-badge');
        badgeSlot.style.display = 'inline-flex';
        badgeSlot.style.alignItems = 'center';
        badgeSlot.style.flexShrink = '0';
        const textEl = document.createElement('span');
        textEl.classList.add('office-flow-label-text');
        textEl.style.overflow = 'hidden';
        textEl.style.textOverflow = 'ellipsis';
        el.append(badgeSlot, textEl);
        layer.append(el);
        entry = { el, badgeSlot, textEl, badgeSig: '' };
        labels.push(entry);
      }
      entry.textEl.textContent = info.text;
      entry.el.style.borderColor = info.color;
      entry.el.style.opacity = String(Math.max(0.25, info.alpha));
      entry.el.style.fontWeight = info.prominent ? '800' : '700';
      entry.el.dataset.role = info.role || '';
      entry.el.dataset.pattern = info.pattern || 'solid';
      entry.el.dataset.status = info.failed ? 'failed' : (info.ending ? 'completed' : 'working');
      entry.el.dataset.nodeId = info.node.id;
      entry.el.dataset.agent = info.node.agent || '';
      const selectable = info.node.visual?.kind === 'overflow';
      entry.el.style.pointerEvents = selectable ? 'auto' : 'none';
      entry.el.style.cursor = selectable ? 'pointer' : '';
      entry.el.tabIndex = selectable ? 0 : -1;
      if (selectable) entry.el.setAttribute('role', 'button'); else entry.el.removeAttribute('role');
      if (selectable) entry.el.setAttribute('aria-label', (info.node.visual.actionLabel || '') + ' ' + info.text); else entry.el.removeAttribute('aria-label');
      entry.el.onclick = selectable ? () => onSelectNode(info.node, info.flow) : null;
      entry.el.onkeydown = selectable ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectNode(info.node, info.flow); } } : null;
      const sig = (info.pattern || 'solid') + '|' + info.color + '|' + (info.failed ? '1' : '0') + '|' + (settings.patterns ? '1' : '0');
      if (entry.badgeSig !== sig) {
        entry.badgeSig = sig;
        entry.badgeSlot.replaceChildren(buildBadgeSvg(info.pattern || 'solid', info.color, info.failed, settings.patterns));
      }
      if (!entry.point) entry.point = new T.Vector3();
      entry.point.copy(info.point);
      entry.priority = info.priority || 0;
      entry.el.hidden = false;
    }

    const pairSlotCounts = new Map();
    const pairSlotIndex = new Map();
    const anchorsSeen = new Map();
    const labelMap = new Map();

    function frame(realNow, advanceClock = true) {
      if (disposed) return;
      let deltaMs = 0;
      if (lastReal !== null && !settings.paused && advanceClock) {
        deltaMs = Math.max(0, Math.min(1000, realNow - lastReal));
        clock += deltaMs;
        if (settings.walkAnimation !== 'off') animClock += deltaMs;
      }
      lastReal = realNow;

      const darkScene = detectDarkScene();
      const animSec = animClock * 0.001;
      beamBaseMat.uniforms.uTime.value = animSec;
      beamBaseMat.uniforms.uDarkScene.value = darkScene;
      beamGlowMat.uniforms.uTime.value = animSec;
      beamGlowMat.uniforms.uDarkScene.value = darkScene;
      carrierMat.uniforms.uDarkScene.value = darkScene;
      glowMat.uniforms.uDarkScene.value = darkScene;

      group.visible = settings.enabled;
      for (const l of labels) l.el.hidden = true;

      let bi = 0;
      let ci = 0;
      let gi = 0;
      visibleEdges = 0;
      failedBeams = 0;
      activeReturnPackets = 0;
      activeParticleCount = 0;
      activeNodeCount = 0;
      activeSparkCount = 0;
      particleSample.length = 0;

      pairSlotCounts.clear();
      pairSlotIndex.clear();
      anchorsSeen.clear();
      labelMap.clear();

      // Hitung jumlah alur aktif per pasangan (from->to) agar cabang paralel memisah lembut
      for (const rec of records.values()) {
        if (rec.edge.kind === 'return') continue;
        const pk = rec.edge.from + '>' + rec.edge.to;
        pairSlotCounts.set(pk, (pairSlotCounts.get(pk) || 0) + 1);
      }

      const thick = settings.thickness;
      const baseHalfW = 0.072 * Math.pow(thick, 0.85);
      const particleScale = Math.pow(thick, 0.55);
      const nodeFlareSize = 0.48 * Math.pow(thick, 0.42);
      const cometHeadSize = 0.66 * Math.pow(thick, 0.42);
      const isStaticVisual = settings.walkAnimation === 'off';

      for (const [key, rec] of records) {
        const a = endpoint(rec.from, rec.flow);
        const b = endpoint(rec.to, rec.flow);
        if (!a || !b) continue;

        const returning = rec.edge.kind === 'return';
        const age = Math.max(0, clock - rec.born);
        const ending = rec.ended !== null;
        const endAge = ending ? Math.max(0, clock - rec.ended) : 0;
        const fadeRaw = ending ? Math.max(0, 1 - Math.max(0, endAge - FADE_DELAY_MS) / FADE_DUR_MS) : 1;
        // Smoothstep ease-out saat memudar
        const fade = fadeRaw * fadeRaw * (3 - 2 * fadeRaw);

        if (ending && endAge > RETIRE_MS) {
          records.delete(key);
          retired.set(key, true);
          if (retired.size > 2048) retired.delete(retired.keys().next().value);
          continue;
        }

        const dist = a.distanceTo(b);
        const arch = Math.min(3.4, Math.max(1.05, dist * 0.13));
        const arcLen = Math.max(1.0, Math.hypot(dist, arch * 2.0));
        const isFailed = FAILED_STATUSES.has(rec.flow.status) || FAILED_STATUSES.has(rec.to.status) || FAILED_STATUSES.has(rec.from.status);

        if (returning) {
          const progress = (clock - rec.start) / HOP_DUR_MS;
          if (progress >= 1 && !rec.returnDone) {
            rec.returnDone = true;
            returned.set(key, true);
            if (returned.size > 2048) returned.delete(returned.keys().next().value);
            const destLabel = labelFor(rec.to, rec.flow);
            const destId = nodeIdentity(rec.to, destLabel);
            nodeFlash.set(destId, clock);
            if (nodeFlash.size > 128) nodeFlash.delete(nodeFlash.keys().next().value);
            const retHex = isFailed ? (map?.roles?.failed?.color || '#c44e59') : (rec.edge.color || map?.roles?.return?.color || '#23875f');
            boostLuminousColor(T, retHex, tmpRetPair);
            spawnBurst(b, tmpRetPair.glow, rec.to.role === 'boss' ? 9 : 6);
            if (rec.to.role === 'boss') onReturn(rec.flow);
          }

          // Kometa paket kembali: kepala terang + ekor cahaya meruncing bergerak BALIK dari anak ke induk sampai Bos
          if (settings.enabled && progress >= 0 && progress < 1.18) {
            const headU = Math.min(1, progress);
            const headAlpha = progress <= 1 ? fade : fade * Math.max(0, 1 - (progress - 1) / 0.18);
            if (headAlpha > 0.02) {
              activeReturnPackets++;
              const retHex = isFailed ? (map?.roles?.failed?.color || '#c44e59') : (rec.edge.color || map?.roles?.return?.color || '#23875f');
              boostLuminousColor(T, retHex, tmpRetPair);
              const beat = 1 + Math.sin(headU * Math.PI) * 0.18;

              // Ekor kometa (6 titik meruncing mengikuti tangen busur di belakang kepala)
              for (let ti = TAIL_STEPS; ti >= 1; ti--) {
                const tu = headU - ti * 0.036;
                if (tu < 0) continue;
                const frac = 1 - ti / (TAIL_STEPS + 1);
                evalCurve(a, b, tu, arch, 0, tmpPos, tmpTan);
                const tLen = cometHeadSize * (0.65 + 0.55 * frac);
                const tWid = cometHeadSize * (0.20 + 0.34 * frac);
                const tAlpha = headAlpha * frac * frac * 0.85;
                ci = pushCarrier(ci, tmpPos, tmpTan, tmpRetPair.body, tLen * 0.85, tWid * 0.85, tAlpha * 0.72, 0);
                gi = pushGlow(gi, tmpPos, tmpTan, tmpRetPair.glow, tLen, tWid, tAlpha, 0);
              }

              // Kepala kometa (putih-zamrud sangat terang)
              evalCurve(a, b, headU, arch, 0, tmpPos, tmpTan);
              ci = pushCarrier(ci, tmpPos, null, tmpRetPair.body, cometHeadSize * 0.76 * beat, cometHeadSize * 0.76 * beat, headAlpha * 0.92, 2);
              gi = pushGlow(gi, tmpPos, null, tmpRetPair.glow, cometHeadSize * 1.15 * beat, cometHeadSize * 1.15 * beat, headAlpha, 2);
            }
          }
          continue;
        }

        if (settings.enabled) visibleEdges++;
        if (settings.enabled && !rec.visible) {
          rec.visible = true;
          pendingVisible.push({ key, flowId: rec.flow.id });
        }
        if (isFailed && settings.enabled) failedBeams++;

        const pk = rec.edge.from + '>' + rec.edge.to;
        const totalOnPair = pairSlotCounts.get(pk) || 1;
        const slotIdx = pairSlotIndex.get(pk) || 0;
        pairSlotIndex.set(pk, slotIdx + 1);
        const latOff = totalOnPair > 1 ? (slotIdx - (totalOnPair - 1) * 0.5) * 0.28 : 0;

        // Tumbuh halus dengan cubic ease-out (tanpa lonjakan; langsung penuh saat paused atau walkAnimation=off)
        const growRaw = (settings.paused || isStaticVisual) ? 1 : Math.min(1, Math.max(0.04, age / 260));
        const grow = 1 - Math.pow(1 - growRaw, 3);

        const effPattern = settings.patterns ? (rec.edge.pattern || 'solid') : 'solid';
        const patId = patternNum(effPattern);
        // statusMode: 0=dispatched (baru dikirim), 1=working/idle, 2=completed, 3=failed/limit
        const statusMode = isFailed ? 3 : (ending ? 2 : (age < 1200 ? 0 : 1));
        const edgeHex = isFailed ? (map?.roles?.failed?.color || '#c44e59') : (rec.edge.color || '#687787');
        boostLuminousColor(T, edgeHex, tmpColorPair);

        if (settings.enabled && bi < MAX) {
          bStart.setXYZ(bi, a.x, a.y, a.z);
          bEnd.setXYZ(bi, b.x, b.y, b.z);
          bBody.setXYZ(bi, tmpColorPair.body.r, tmpColorPair.body.g, tmpColorPair.body.b);
          bGlow.setXYZ(bi, tmpColorPair.glow.r, tmpColorPair.glow.g, tmpColorPair.glow.b);
          bMeta.setXYZW(bi, arch, latOff, baseHalfW, fade);
          bState.setXYZW(bi, grow, patId, statusMode, rec.phase);
          bLen.setX(bi, arcLen);
          bi++;

          // Partikel / denyut cahaya mengalir searah penugasan sepanjang garis
          const flowSpeed = statusMode === 0 ? 0.68 : (statusMode === 1 ? 0.38 : (statusMode === 2 ? 0.16 : 0.54));
          const blinkMul = statusMode === 3 ? (0.25 + 0.75 * (0.5 + 0.5 * Math.sin(animSec * 10.5 + rec.phase * 1.7))) : 1.0;
          const densityMul = statusMode === 0 ? 1.35 : (statusMode === 2 ? 0.65 : 1.0);
          const baseCount = Math.max(2, Math.min(6, Math.round((arcLen / 4.2) * densityMul)));
          const brightMul = statusMode === 0 ? 1.18 : (statusMode === 2 ? 0.58 : 0.96);

          if (effPattern === 'dotted' && !isFailed) {
            // Ritme manik cahaya cepat berjarak rapat
            const beadCount = Math.max(5, Math.min(11, Math.round(arcLen / 2.0)));
            const beadSpeed = flowSpeed * 1.15;
            for (let k = 0; k < beadCount; k++) {
              const u = ((animSec * beadSpeed + k / beadCount + rec.phase * 0.13) % 1 + 1) % 1;
              if (u > grow - 0.01 || u < 0.02) continue;
              evalCurve(a, b, u, arch, latOff, tmpPos, tmpTan);
              const env = Math.sin(Math.PI * (u / Math.max(0.05, grow)));
              const pAlpha = fade * brightMul * (0.62 + 0.38 * env);
              const sz = 0.21 * particleScale;
              ci = pushCarrier(ci, tmpPos, tmpTan, tmpColorPair.body, sz * 1.15, sz * 1.05, pAlpha * 0.88, 0);
              gi = pushGlow(gi, tmpPos, tmpTan, tmpColorPair.glow, sz * 1.55, sz * 1.40, pAlpha, 0);
              activeParticleCount++;
              if (particleSample.length < 6) particleSample.push(+u.toFixed(4));
            }
          } else if (effPattern === 'dashed' && !isFailed) {
            // Ritme pasangan denyut cahaya memanjang (paired streaks), bukan blok cokelat
            const pairCount = Math.max(2, Math.min(5, Math.round(arcLen / 4.8)));
            for (let k = 0; k < pairCount; k++) {
              const baseU = ((animSec * flowSpeed + k / pairCount + rec.phase * 0.17) % 1 + 1) % 1;
              for (let sub = 0; sub < 2; sub++) {
                const u = (baseU + sub * 0.062) % 1;
                if (u > grow - 0.01 || u < 0.02) continue;
                evalCurve(a, b, u, arch, latOff, tmpPos, tmpTan);
                const env = Math.sin(Math.PI * (u / Math.max(0.05, grow)));
                const pAlpha = fade * brightMul * (0.62 + 0.38 * env) * (sub === 0 ? 1.0 : 0.88);
                const pLen = 0.48 * particleScale;
                const pWid = 0.21 * particleScale;
                ci = pushCarrier(ci, tmpPos, tmpTan, tmpColorPair.body, pLen * 0.95, pWid * 1.02, pAlpha * 0.88, 0);
                gi = pushGlow(gi, tmpPos, tmpTan, tmpColorPair.glow, pLen * 1.38, pWid * 1.35, pAlpha, 0);
                activeParticleCount++;
                if (particleSample.length < 6) particleSample.push(+u.toFixed(4));
              }
            }
          } else {
            // Solid (atau gagal berkedip merah): partikel aliran cahaya memanjang mulus
            const count = isFailed ? Math.max(3, baseCount) : baseCount;
            for (let k = 0; k < count; k++) {
              const u = ((animSec * flowSpeed + k / count + rec.phase * 0.11) % 1 + 1) % 1;
              if (u > grow - 0.01 || u < 0.02) continue;
              evalCurve(a, b, u, arch, latOff, tmpPos, tmpTan);
              const env = Math.sin(Math.PI * (u / Math.max(0.05, grow)));
              const pAlpha = fade * brightMul * blinkMul * (0.60 + 0.40 * env);
              const pLen = 0.56 * particleScale;
              const pWid = 0.22 * particleScale;
              ci = pushCarrier(ci, tmpPos, tmpTan, tmpColorPair.body, pLen * 0.95, pWid * 1.02, pAlpha * 0.88, 0);
              gi = pushGlow(gi, tmpPos, tmpTan, tmpColorPair.glow, pLen * 1.40, pWid * 1.35, pAlpha, 0);
              activeParticleCount++;
              if (particleSample.length < 6) particleSample.push(+u.toFixed(4));
            }
          }

          // Titik ujung menyala saat sinar sedang tumbuh (leading lance tip)
          if (grow < 0.99) {
            evalCurve(a, b, grow, arch, latOff, tmpPos, tmpTan);
            gi = pushGlow(gi, tmpPos, null, tmpColorPair.glow, 0.36 * particleScale, 0.36 * particleScale, fade, 1);
          }
        }

        // Ujung simpul berpendar kecil (bukan bola) + label dengan lencana pola
        const endpoints = [[rec.from, a], [rec.to, b]];
        for (let ei = 0; ei < 2; ei++) {
          const n = endpoints[ei][0];
          const p = endpoints[ei][1];
          const accent = isFailed && ei === 1 ? (map?.roles?.failed?.color || '#c44e59') : nodeAccent(n, edgeHex);
          const text = labelFor(n, rec.flow);
          const nid = nodeIdentity(n, text);
          const nodePat = n.role === 'boss' ? (map?.roles?.boss?.pattern || 'solid') : n.role === 'secretary' ? (map?.roles?.secretary?.pattern || 'dashed') : (rec.edge.pattern || 'solid');

          if (settings.enabled && !anchorsSeen.has(nid)) {
            anchorsSeen.set(nid, p);
            boostLuminousColor(T, accent, tmpNodePair);
            const isCore = n.role === 'boss' || n.role === 'secretary';
            const flashAt = nodeFlash.get(nid);
            const flashAge = flashAt !== undefined ? Math.max(0, clock - flashAt) : 9999;
            const flashBoost = flashAge < 420 ? (1 - flashAge / 420) * 0.72 : 0;
            const breathe = isStaticVisual ? 1.0 : (0.92 + 0.08 * Math.sin(animSec * 3.1 + rec.phase + ei));
            const flareSz = nodeFlareSize * (isCore ? 1.14 : 0.96) * breathe * (1 + flashBoost * 0.55);
            const nAlpha = Math.min(1, fade * (0.86 + flashBoost * 0.45));
            ci = pushCarrier(ci, p, null, tmpNodePair.body, flareSz * 0.58, flareSz * 0.58, nAlpha * 0.72, 1);
            gi = pushGlow(gi, p, null, tmpNodePair.glow, flareSz, flareSz, nAlpha, 1);
            activeNodeCount++;
          }

          const existing = labelMap.get(nid);
          const prio = n.role === 'boss' ? 3 : n.role === 'secretary' || n.visual?.kind === 'overflow' ? 2 : n.role === 'agent' ? 1 : 0;
          if (!existing || fade > existing.alpha || (!ending && existing.ending)) {
            tmpProj.set(p.x, p.y + 0.34, p.z);
            labelMap.set(nid, {
              node: n, flow: rec.flow,
              text,
              color: accent,
              alpha: fade,
              ending,
              failed: isFailed && ei === 1,
              pattern: nodePat,
              role: n.role,
              prominent: n.role === 'boss' || n.role === 'secretary',
              priority: prio,
              point: existing?.point ? existing.point.copy(tmpProj) : tmpProj.clone()
            });
          }
        }
      }

      // Render percikan tiba (arrival sparks) dari pool tetap
      if (settings.enabled) {
        for (let i = 0; i < SPARK_POOL; i++) {
          const sp = sparks[i];
          if (!sp.active) continue;
          const age = clock - sp.born;
          if (age < 0 || age >= sp.life) {
            sp.active = false;
            continue;
          }
          const t = age / sp.life;
          const dtSec = age * 0.001;
          const damp = 1 - t * 0.45;
          tmpPos.set(
            sp.ox + sp.vx * dtSec * damp,
            sp.oy + sp.vy * dtSec - 1.4 * dtSec * dtSec,
            sp.oz + sp.vz * dtSec * damp
          );
          const sAlpha = (1 - t) * (1 - t);
          const sz = sp.size * (1 - t * 0.45);
          tmpNodePair.glow.setRGB(sp.r, sp.g, sp.b);
          gi = pushGlow(gi, tmpPos, null, tmpNodePair.glow, sz, sz, sAlpha, 3);
          activeSparkCount++;
        }
      }

      let labelIndex = 0;
      const sortedLabels = [...labelMap.values()].sort((u, v) => v.priority - u.priority || v.alpha - u.alpha);
      for (const info of sortedLabels) placeLabel(labelIndex++, info);

      beamGeo.instanceCount = settings.enabled ? bi : 0;
      carrierGeo.instanceCount = settings.enabled ? ci : 0;
      glowGeo.instanceCount = settings.enabled ? gi : 0;

      beamBaseMesh.visible = settings.enabled && bi > 0;
      beamGlowMesh.visible = settings.enabled && bi > 0;
      carrierMesh.visible = settings.enabled && ci > 0;
      glowMesh.visible = settings.enabled && gi > 0;

      if (bi > 0) {
        const up = (attr, stride) => {
          attr.updateRange.offset = 0;
          attr.updateRange.count = bi * stride;
          attr.needsUpdate = true;
        };
        up(bStart, 3); up(bEnd, 3); up(bBody, 3); up(bGlow, 3);
        up(bMeta, 4); up(bState, 4); up(bLen, 1);
      }
      if (ci > 0) {
        const up = (attr, stride) => {
          attr.updateRange.offset = 0;
          attr.updateRange.count = ci * stride;
          attr.needsUpdate = true;
        };
        up(cPos, 3); up(cDir, 3); up(cCol, 3); up(cPar, 4);
      }
      if (gi > 0) {
        const up = (attr, stride) => {
          attr.updateRange.offset = 0;
          attr.updateRange.count = gi * stride;
          attr.needsUpdate = true;
        };
        up(gPos, 3); up(gDir, 3); up(gCol, 3); up(gPar, 4);
      }
      if (layer) layer.hidden = !settings.enabled;
    }

    function projectLabels(camera, width, height, occupied = []) {
      const placed = [...occupied];
      const active = labels.filter(entry => !entry.el.hidden && entry.point).sort((a, b) => (b.priority || 0) - (a.priority || 0));
      for (const entry of active) {
        const p = tmpProj.copy(entry.point).project(camera);
        const w = entry.el.offsetWidth;
        const h = entry.el.offsetHeight;
        if (p.z <= -1 || p.z >= 1) {
          entry.el.hidden = true;
          continue;
        }
        const bx = Math.max(8, Math.min(width - w - 8, (p.x + 1) * width / 2 - w / 2));
        const by = (1 - p.y) * height / 2 - h - 8;
        const candidates = [[0, 0], [0, -(h + 5)], [0, h + 12], [w * 0.65, 0], [-w * 0.65, 0], [0, -2 * (h + 5)], [w * 0.75, -(h + 5)], [-w * 0.75, -(h + 5)]];
        let hit = null;
        for (const [dx, dy] of candidates) {
          const x = Math.max(8, Math.min(width - w - 8, bx + dx));
          const y = by + dy;
          if (y < 64 || y + h > height - 12) continue;
          if (!placed.some(r => x < r.x + r.w + 5 && x + w + 5 > r.x && y < r.y + r.h + 5 && y + h + 5 > r.y)) {
            hit = { x, y };
            break;
          }
        }
        if (!hit) {
          entry.el.hidden = true;
          continue;
        }
        entry.el.style.transform = 'translate(' + Math.round(hit.x) + 'px,' + Math.round(hit.y) + 'px)';
        placed.push({ x: hit.x, y: hit.y, w, h });
      }
    }

    function configure(value = {}) {
      settings = {
        ...defaults,
        ...value,
        maxVisibleEdges: Math.max(8, Math.min(MAX, Math.floor(value.maxVisibleEdges || 128))),
        thickness: Math.max(0.5, Math.min(3, Number(value.thickness) || 1)),
        walkAnimation: ['full', 'fast', 'off'].includes(value.walkAnimation) ? value.walkAnimation : defaults.walkAnimation
      };
    }

    function didRender(at) {
      if (pendingVisible.length && firstVisibleAt === null) firstVisibleAt = at;
      for (const item of pendingVisible.splice(0)) onVisible({ ...item, at });
    }

    return {
      get clock() { return clock; },
      sync,
      retireCompleted,
      frame,
      didRender,
      projectLabels,
      configure,
      advance(ms) {
        if (!settings.paused) {
          const d = Math.max(0, ms);
          clock += d;
          if (settings.walkAnimation !== 'off') animClock += d;
        }
        frame(lastReal ?? 0, false);
      },
      clear() {
        records.clear();
        returned.clear();
        retired.clear();
        nodeFlash.clear();
        pendingVisible.length = 0;
        firstVisibleAt = null;
        for (const sp of sparks) sp.active = false;
        beamGeo.instanceCount = 0;
        carrierGeo.instanceCount = 0;
        glowGeo.instanceCount = 0;
        for (const m of meshes) m.visible = false;
        for (const l of labels) l.el.hidden = true;
      },
      stats: () => ({
        visibleEdges,
        // Kompatibilitas V16 + metrik V18
        segments: beamGeo.instanceCount,
        halos: beamGeo.instanceCount,
        beams: beamGeo.instanceCount,
        packets: activeReturnPackets,
        particles: activeParticleCount,
        nodes: activeNodeCount,
        sparks: activeSparkCount,
        failedBeams,
        pooledGeometries: geometries.length,
        pooledMaterials: materials.length,
        records: records.size,
        returnHistory: returned.size,
        firstVisibleAt,
        anchorRecoveries,
        missingAnchors,
        clock,
        animClock,
        paused: settings.paused,
        patterns: settings.patterns,
        walkAnimation: settings.walkAnimation,
        thickness: settings.thickness,
        particleSample: particleSample.slice()
      }),
      dispose() {
        if (disposed) return;
        disposed = true;
        scene.remove(group);
        for (const g of geometries) g.dispose();
        for (const m of materials) m.dispose();
        layer?.remove();
        records.clear();
        returned.clear();
        retired.clear();
        nodeFlash.clear();
      }
    };
  }

  root.OfficeFlow3D = Object.freeze({ create });
})(typeof window === 'object' ? window : globalThis);
