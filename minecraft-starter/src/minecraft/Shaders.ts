export const meshVSText = `
    precision mediump float;

    attribute vec3 aVertPos;
    attribute vec3 aNorm;
    attribute vec3 aInstOffset;
    attribute vec4 aInstRot;

    uniform mat4 uView;
    uniform mat4 uProj;

    varying vec3 vNormal;
    varying vec4 vWsPos;

    vec3 qtrans(vec4 q, vec3 v) {
        return v + 2.0 * cross(cross(v, q.xyz) - q.w * v, q.xyz);
    }

    void main() {
        vec3 rotated = qtrans(aInstRot, aVertPos);
        vec3 wp = rotated + aInstOffset;
        gl_Position = uProj * uView * vec4(wp, 1.0);
        vWsPos = vec4(wp, 1.0);
        vNormal = qtrans(aInstRot, aNorm);
    }
`;

export const meshFSText = `
    precision mediump float;

    uniform vec4 uLightPos;

    varying vec3 vNormal;
    varying vec4 vWsPos;

    void main() {
        vec3 n = normalize(vNormal);
        vec3 ld = normalize(uLightPos.xyz - vWsPos.xyz);
        float dot_nl = clamp(dot(ld, n), 0.0, 1.0);
        vec3 kd = vec3(0.75, 0.55, 0.45);
        gl_FragColor = vec4(kd * (0.2 + 0.8 * dot_nl), 1.0);
    }
`;

export const blankCubeVSText = `
    precision mediump float;

    uniform vec4 uLightPos;
    uniform mat4 uView;
    uniform mat4 uProj;

    attribute vec4 aNorm;
    attribute vec4 aVertPos;
    attribute vec4 aOffset;
    attribute vec2 aUV;
    attribute vec3 aColor;
    attribute float aCubeType;

    varying vec4 normal;
    varying vec4 wsPos;
    varying vec2 uv;
    varying vec3 color;
    varying float cubeType;

    void main () {
        gl_Position = uProj * uView * (aVertPos + aOffset);
        wsPos = aVertPos + aOffset;
        normal = normalize(aNorm);
        uv = aUV;
        color = aColor;
        cubeType = aCubeType;
    }
`;

export const blankCubeFSText = `
    precision mediump float;

    uniform vec4 uLightPos;

    varying vec4 normal;
    varying vec4 wsPos;
    varying vec2 uv;
    varying vec3 color;
    varying float cubeType;

    // 16 Perlin gradients (same as Perlin.ts perlinGradients)
    vec3 grad(int idx) {
        if (idx == 0)  return vec3( 1, 1, 0);
        if (idx == 1)  return vec3(-1, 1, 0);
        if (idx == 2)  return vec3( 1,-1, 0);
        if (idx == 3)  return vec3(-1,-1, 0);
        if (idx == 4)  return vec3( 1, 0, 1);
        if (idx == 5)  return vec3(-1, 0, 1);
        if (idx == 6)  return vec3( 1, 0,-1);
        if (idx == 7)  return vec3(-1, 0,-1);
        if (idx == 8)  return vec3( 0, 1, 1);
        if (idx == 9)  return vec3( 0,-1, 1);
        if (idx == 10) return vec3( 0, 1,-1);
        if (idx == 11) return vec3( 0,-1, 1);
        if (idx == 12) return vec3( 1, 1, 0);
        if (idx == 13) return vec3(-1, 1, 0);
        if (idx == 14) return vec3( 0,-1, 1);
        return vec3( 0,-1,-1);
    }

    float fhash(float n) {
        return fract(sin(n) * 4375.5453);
    }

    int hashCoord(int x, int y, int z) {
        float n = fhash(float(x) + fhash(float(y) + fhash(float(z) * 13.0) * 57.0) * 131.0);
        return int(floor(n * 16.0));
    }

    float fade(float t) {
        return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
    }

    float perlin(vec3 p) {
        p = mod(p, 256.0);

        int x0 = int(floor(p.x));
        int y0 = int(floor(p.y));
        int z0 = int(floor(p.z));

        float xf = fract(p.x);
        float yf = fract(p.y);
        float zf = fract(p.z);

        float u = fade(xf);
        float v = fade(yf);
        float w = fade(zf);

        float n000 = dot(grad(hashCoord(x0,   y0,   z0  )), vec3(xf,       yf,       zf      ));
        float n100 = dot(grad(hashCoord(x0+1, y0,   z0  )), vec3(xf - 1.0, yf,       zf      ));
        float n010 = dot(grad(hashCoord(x0,   y0+1, z0  )), vec3(xf,       yf - 1.0, zf      ));
        float n110 = dot(grad(hashCoord(x0+1, y0+1, z0  )), vec3(xf - 1.0, yf - 1.0, zf      ));
        float n001 = dot(grad(hashCoord(x0,   y0,   z0+1)), vec3(xf,       yf,       zf - 1.0));
        float n101 = dot(grad(hashCoord(x0+1, y0,   z0+1)), vec3(xf - 1.0, yf,       zf - 1.0));
        float n011 = dot(grad(hashCoord(x0,   y0+1, z0+1)), vec3(xf,       yf - 1.0, zf - 1.0));
        float n111 = dot(grad(hashCoord(x0+1, y0+1, z0+1)), vec3(xf - 1.0, yf - 1.0, zf - 1.0));

        float x00 = mix(n000, n100, u);
        float x01 = mix(n001, n101, u);
        float x10 = mix(n010, n110, u);
        float x11 = mix(n011, n111, u);

        float y0a = mix(x00, x10, v);
        float y1a = mix(x01, x11, v);

        return mix(y0a, y1a, w);
    }


    // Generated with Claude to make help make pretty-looking designs

    // Cube type enum values (matches cubeTypeEnum in Cube.ts):
    // 0=GRASS, 1=STONE, 2=SAND, 3=SNOW, 4=IRON, 5=GOLD,
    // 6=DIAMOND, 7=EMERALD, 8=COAL, 9=GRAVEL, 10=WATER, 11=LAVA, 12=DIRT
    vec3 proceduralTexture(vec3 base, vec3 wp, float ctype) {
        // One Perlin call at a type-derived frequency and seed offset,
        // then the type controls how that noise modulates the base color.
        float t = ctype;

        // Per-type frequency and seed so each type samples different noise
        float freq = 4.0 + t * 1.7;
        float seed = t * 31.0;
        float n = perlin(wp * freq + vec3(seed));

        // Per-type modulation parameters derived from type ID using
        // simple math — different types get different visual character
        // without additional Perlin calls

        float directional = sin(wp.y * 3.0 + wp.x * 0.5) * 0.04;

        // Variation amount: darker types get more contrast
        float lum = dot(base, vec3(0.299, 0.587, 0.114));
        float variation = 0.12 + 0.08 * (1.0 - lum);

        // Channel offsets: use type to tint the noise differently per channel
        float rBias = fract(t * 0.37) - 0.5;
        float gBias = fract(t * 0.59) - 0.5;
        float bBias = fract(t * 0.73) - 0.5;

        vec3 offset = vec3(
            n * variation * (1.0 + rBias * 0.5) + directional,
            n * variation * (1.0 + gBias * 0.5) + directional * 0.7,
            n * variation * (1.0 + bBias * 0.5) + directional * 0.4
        );

        return clamp(base + offset, 0.0, 1.0);
    }

    void main() {
        vec3 kd = proceduralTexture(color, wsPos.xyz, cubeType);
        vec3 ka = kd * 0.15;

        vec4 lightDirection = uLightPos - wsPos;
        float dot_nl = dot(normalize(lightDirection), normalize(normal));
        dot_nl = clamp(dot_nl, 0.0, 1.0);

        gl_FragColor = vec4(clamp(ka + dot_nl * kd, 0.0, 1.0), 1.0);
    }
`;
