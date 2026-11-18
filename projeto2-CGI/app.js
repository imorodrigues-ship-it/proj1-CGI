import { loadShadersFromURLS, buildProgramFromSources, setupWebGL } from "../../libs/utils.js";
import { flatten, lookAt, ortho, vec3 } from "../../libs/MV.js";
import { node, leaf, find, count_primitives, draw } from "./scenegraph.js";

import * as STACK from "../../libs/stack.js";
import * as CUBE from "../../libs/objects/cube.js";
import * as SPHERE from "../../libs/objects/sphere.js";
import * as CYLINDER from "../../libs/objects/cylinder.js";
import * as PYRAMID from "../../libs/objects/pyramid.js";
import * as TORUS from "../../libs/objects/torus.js";

/** @type {HTMLCanvasElement} */
let canvas;
/** @type {WebGL2RenderingContext} */
let gl;

const PRIMITIVES = { cube: CUBE, sphere: SPHERE, cylinder: CYLINDER, pyramid: PYRAMID, torus: TORUS };

const white = [0.93, 0.89, 0.84, 1];
const black = [0.08, 0.08, 0.08, 1];
const grey = [0.55, 0.5, 0.5, 1];
const blue = [0.1, 0.1, 0.3, 1];
const yellow = [0.85, 0.55, 0.15, 1];
const brown = [0.6, 0.45, 0.35, 1];
const soft_brown = [0.5, 0.36, 0.28, 1];

const ARM_X = 0.86;
const ARM_Y = 0.55;
const ARM_Z = -0.2;

let program;
let scene;
let zoom = 3;

// ---------------------------------------------------------------------------
// The scene. An example only, to show how a graph is built: a tile of
// ground and a small rover with an arm, which keys q and e turn. Replace it
// with the ground, the rocks and the rover.
// ---------------------------------------------------------------------------

function tiles(count, size) {
    const tiles = [];
    const start = -(count * size) / 2 + size / 2; 
    for (let i = 0; i < count; i++) {
        for (let j = 0; j < count; j++) {
            const color = (i + j) % 2 === 0 ? brown : soft_brown;
            tiles.push(leaf("tile [" + i + ", " + j + "]", "cube", color, {
                t: [start + i * size, -0.05, start + j * size],
                s: [size, 0.1, size]
            }));
        }
    }
    return node("tiles", {}, tiles);
}

function rocks() {
    
}

function dots(name, colour, x, y, z, d, th) {
    return node(name, {}, [
        leaf("left",  "cylinder", colour, { t: [x, y, -z], r: [0, 0, 90], s: [d, th, d] }),
        leaf("right", "cylinder", colour, { t: [x, y,  z], r: [0, 0, 90], s: [d, th, d] }),
    ]);
}

function rockers(name, y, z, len, th) {
    return node(name, {}, [
        leaf("left",  "cube", grey, { t: [0, y,  z], s: [len, th, th] }),
        leaf("right", "cube", grey, { t: [0, y, -z], s: [len, th, th] }),
    ]);
}

function wheel(name, z) {
    return node(name, { t: [0, 0.25, z], r: [90, 0, 0] }, [
        leaf("tire", "cylinder", black, { s: [0.5, 0.16, 0.5] }),
        leaf("rim", "cylinder", grey, { s: [0.32, 0.162, 0.32] }),
    ]);
}

function wheel_pair(name, x) {
    return node(name, { t: [x, 0, 0] }, [
        wheel("left", 0.7),
        wheel("right", -0.7),
    ]);
}

function bin(name, x, y, z, w, h, d) {
    const th = 0.03;
    return node(name, { t: [x, y, z] }, [
        leaf(name + "floor", "cube", yellow, { t: [0, th / 2, 0], s: [w, th, d] }),
        leaf(name + "front", "cube", yellow, { t: [0, h / 2, d / 2 - th / 2], s: [w, h, th] }),
        leaf(name + "back", "cube", yellow, { t: [0, h / 2, -d / 2 + th / 2], s: [w, h, th] }),
        leaf(name + "left", "cube", yellow, { t: [-w / 2 + th / 2, h / 2, 0], s: [th, h, d - 2 * th] }),
        leaf(name + "right", "cube", yellow, { t: [w / 2 - th / 2, h / 2, 0], s: [th, h, d - 2 * th] })
    ]);
}

function camera(name, x, z, h) {
    return node(name, { t: [x, 0.6, z] }, [
        leaf("base", "sphere", grey, { s: [0.1, 0.1, 0.1] }),
        leaf("pole", "cylinder", white, { t: [0, h / 2, 0], s: [0.04, h, 0.04] }),
        leaf("head", "cube", black, { t: [0, h + 0.06, 0], s: [0.18, 0.12, 0.32] }),
        dots("camera dot", grey, 0.1, h + 0.06, 0.08, 0.055, 0.02),
    ]);
}

function claw() {
    return node("claw", { t: [0, 0.45, 0] }, [
        leaf("hand", "cube", black, { t: [0, 0.05, 0], s: [0.1, 0.05, 0.3] }),
        node("jaw 1", { t: [0, 0, 0] }, [
            leaf("jaw 1 shape", "cube", grey, { t: [0.01, 0.15, 0.05], s: [0.02, 0.15, 0.03] }),
        ]),
        node("jaw 2", { t: [0, 0, 0] }, [
            leaf("jaw 2 shape", "cube", grey, { t: [0.01, 0.15, -0.05], s: [0.02, 0.15, 0.03] }),
        ]),
    ]);
}

function lower_arm() {
    return node("elbow", { t: [0, 0.65, 0], r: [0, 0, -145] }, [
        leaf("elbow joint", "sphere", grey, { s: [0.08, 0.08, 0.08] }),
        leaf("forearm", "cube", white, { t: [0, 0.250, 0], s: [0.05, 0.45, 0.05] }),
        claw("claw"),
    ]);
}

function arm(x, y, z) {
    return node("arm", { t: [x, y, z] }, [
        leaf("arm joint", "sphere", grey, { s: [0.08, 0.08, 0.08] }),
        node("shoulder", { t: [0, 0, 0], r: [0, 0, -25] }, [
            leaf("upper arm", "cube", white, { t: [0, 0.315, 0], s: [0.05, 0.65, 0.05] }),
            lower_arm(),
        ]),
    ]);
}

function build_scene() {
    return node("root", {}, [
        tiles(40, 2),
        node("rover", { t: [0, 0, 0] }, [
            leaf("base", "cube", white, { t: [0, 0.5, 0], s: [1.5, 0.2, 1] }),
            dots("base dot", white, 0.76, 0.55, 0.4, 0.07, 0.01),
            rockers("rocker", 0.38, 0.58, 1.2, 0.06),
            wheel_pair("front", 0.55),
            wheel_pair("center", 0.0),
            wheel_pair("back", -0.55),
            leaf("exauster", "cylinder", grey, { t: [-0.8, 0.47, 0.35], r: [0, 0, 90], s: [0.1, 0.25, 0.1] }),
            leaf("solar panel", "cube", blue, { t: [-0.4, 0.62, 0], s: [1, 0.04, 1.3] }),
            bin("bin", 0.35, 0.6, -0.25, 0.4, 0.25, 0.4),
            camera("camera", 0.58, 0.35, 0.9),
            leaf("arm mount", "cylinder", black, { t: [ARM_X - 0.09, ARM_Y - 0.06, ARM_Z], r: [0, 90, 0], s: [0.2, 0.1, 0.2] }),
            arm(ARM_X, ARM_Y, ARM_Z),
        ])
    ]);
}

// ---------------------------------------------------------------------------
// Input. Keys that act while held (driving, steering, the joints) are kept in
// a set, and update() moves things by an amount proportional to the time
// that has passed, so that the speed does not depend on the frame rate or on
// the keyboard's repeat rate. Keys that act once go in on_key().
// ---------------------------------------------------------------------------

const GRIP_OPEN = 0;
const GRIP_CLOSE = 0.04;

const held = new Set();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

let gripper_closed = true;

function on_key(key) {
    switch (key) {
        case '0':       // one view / four views
            break;
        case ' ':       // wireframe / solid / both
            break;
        case 'p':
            gripper_closed = !gripper_closed;
            break;
    }
}

function on_wheel(dy) {
    zoom = Math.max(1, Math.min(60, zoom * (1 + dy / 1000)));
}

function turn(joint, axis, plus, minus, dt, lo, hi) {
    if (lo === undefined) lo = -Infinity;
    if (hi === undefined) hi = Infinity;
    const dir = (held.has(plus) ? 1 : 0) - (held.has(minus) ? 1 : 0);
    if (dir != 0) {
        joint.transform.rotation[axis] = clamp(joint.transform.rotation[axis] + dir * 45 * dt, lo, hi);
    }
}

function update(dt) {
    const rover = find(scene, "rover");
    const arm = find(rover, "arm");
    const shoulder = find(arm, "shoulder");
    const elbow = find(shoulder, "elbow");
    const claw = find(elbow, "claw");
    const jaw1 = find(claw, "jaw 1");
    const jaw2 = find(claw, "jaw 2");

    //directional movements

    turn(rover, 1, 'w', 's', dt);

    //claw movements

    turn(arm, 1, 'q', 'e', dt, -50, 50);
    turn(shoulder, 2, 'u', 'j', dt, -80, -10);
    turn(elbow, 2, 'i', 'k', dt, -150, 100);
    turn(claw, 1, 'o', 'l', dt, -180, 180);

    const target = gripper_closed ? GRIP_CLOSE : GRIP_OPEN;
    const cur = jaw1.transform.translation[2];
    const step = 0.1 * dt;                     // ~0.5 s para abrir ou fechar
    const ag = cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step);
    jaw1.transform.translation[2] = ag;
    jaw2.transform.translation[2] = -ag;
}

// ---------------------------------------------------------------------------

let last_time;

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function setup_input() {
    const key_of = event => event.key.length == 1 ? event.key.toLowerCase() : event.key;
    window.addEventListener("keydown", (event) =>
    {
        if (!event.repeat) on_key(key_of(event));
        held.add(key_of(event));
    });
    window.addEventListener("keyup", (event) => held.delete(key_of(event)));
    window.addEventListener("blur", () => held.clear());
    canvas.addEventListener("wheel", (event) =>
    {
        on_wheel(event.deltaY);
        event.preventDefault();
    });
}

function setup(shaders) {
    canvas = document.getElementById("gl-canvas");
    gl = setupWebGL(canvas);

    program = buildProgramFromSources(gl, shaders["flat.vert"], shaders["flat.frag"]);

    CUBE.init(gl);
    SPHERE.init(gl);
    CYLINDER.init(gl);
    PYRAMID.init(gl);
    TORUS.init(gl);

    scene = build_scene();
    console.log("Primitives in the scene: " + count_primitives(scene));

    resize();
    window.addEventListener("resize", resize);
    setup_input();

    gl.clearColor(0.1, 0.1, 0.12, 1.0);
    gl.enable(gl.DEPTH_TEST);

    window.requestAnimationFrame(animate);
}

function draw_primitive(primitive, mv) {
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "u_model_view"), false, flatten(mv));
    gl.uniform4fv(gl.getUniformLocation(program, "u_color"), primitive.colour);
    PRIMITIVES[primitive.geometry].draw(gl, program, gl.TRIANGLES);
}

function animate(time) {
    window.requestAnimationFrame(animate);

    const dt = last_time === undefined ? 0 : (time - last_time) / 1000;
    last_time = time;
    update(dt);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = canvas.width / canvas.height;
    const V = lookAt(vec3(10, 8, 10), vec3(0, 0, 0), vec3(0, 1, 0));
    const P = ortho(-aspect * zoom, aspect * zoom, -zoom, zoom, 1, 40);

    gl.useProgram(program);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "u_projection"), false, flatten(P));

    STACK.loadMatrix(V);
    draw(scene, draw_primitive);

    gl.useProgram(null);
}

loadShadersFromURLS(["flat.vert", "flat.frag"]).then(shaders => setup(shaders));
