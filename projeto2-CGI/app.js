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

//Constants defining colors used in project
const white = [0.93, 0.89, 0.84, 1];
const black = [0.08, 0.08, 0.08, 1];
const grey = [0.55, 0.5, 0.5, 1];
const blue = [0.1, 0.1, 0.3, 1];
const yellow = [0.85, 0.55, 0.15, 1];
const brown = [0.6, 0.45, 0.35, 1];
const soft_brown = [0.5, 0.36, 0.28, 1];
const silver = [0.72, 0.74, 0.8, 5];

//Claw arm positions
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

/**
 * Builds the checkered tile ground
 * @param {*} count the number of tiles
 * @param {*} size the size of each tile
 * @returns the node containing all tiles
 */
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

//Limits a random generated number to 2 given values (high and low)
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

/**
 * Generates a 'count' number of rocks scattered throughout the ground with various sizes
 * @param {*} count the number of rocks
 * @returns a node containing all rocks in the program
 */
function rocks(count) {
    const rocks = [];
    for (let i = 0; i < count; i++) {
        let x, z;
        do {
            x = rand(-35, 35);
            z = rand(-35, 35);
        } while (Math.hypot(x, z) < 2.5);

        let sx = rand(0.2, 0.4);
        let sy = rand(0.2, 0.4);
        let sz = rand(0.2, 0.4);

        rocks.push(leaf("rock " + i, "sphere", grey, { t: [x, sy / 2, z], s: [sx / 2, sy / 2, sz / 2] }));
    }
    return node("rocks", {}, rocks);
}

/**
 * Generates two opposite dots (used for camera and light dots of rover).
 * @param {*} name given name
 * @param {*} color given color
 * @param {*} x position
 * @param {*} y position
 * @param {*} z position
 * @param {*} d depth
 * @param {*} th thickness
 * @returns a node containing both bots
 */
function dots(name, color, x, y, z, d, th) {
    return node(name, {}, [
        leaf("left", "cylinder", color, { t: [x, y, -z], r: [0, 0, 90], s: [d, th, d] }),
        leaf("right", "cylinder", color, { t: [x, y, z], r: [0, 0, 90], s: [d, th, d] }),
    ]);
}

/**
 * Generates two opposite rockers where the wheels are fixated on.
 * @param {*} name given name
 * @param {*} y position
 * @param {*} z position
 * @param {*} len length
 * @param {*} th thickness
 * @returns a node containing both rockers
 */
function rockers(name, y, z, len, th) {
    return node(name, {}, [
        leaf("left", "cube", grey, { t: [0, y, z], s: [len, th, th] }),
        leaf("right", "cube", grey, { t: [0, y, -z], s: [len, th, th] }),
    ]);
}

/**
 * Generates a wheel composed of tire, rim and two spokes.
 * The wheel has turning and spinning properties for commands.
 * @param {*} name given name 
 * @param {*} z position
 * @returns a node with the components of the wheel
 */
function wheel(name, z) {
    return node(name, { t: [0, 0.25, z] }, [
        node(name + " steer", { r: [90, 0, 0] }, [
            node(name + " spin", {}, [
                leaf("tire", "cylinder", black, { s: [0.5, 0.16, 0.5] }),
                leaf("rim", "cylinder", grey, { s: [0.32, 0.162, 0.32] }),
                leaf("spoke 1", "cube", black, { r: [0, 0, 0], s: [0.32, 0.17, 0.03] }),
                leaf("spoke 2", "cube", black, { r: [0, 90, 0], s: [0.32, 0.17, 0.03] }),
            ])
        ])
    ]);
}

/**
 * Generates a pair of opposite wheels, used to avoid code repetition in build_scene.
 * @param {*} name given name
 * @param {*} x position
 * @returns a node with the wheels
 */
function wheel_pair(name, x) {
    return node(name, { t: [x, 0, 0] }, [
        wheel(name + " left", 0.7),
        wheel(name + " right", -0.7),
    ]);
}

/**
 * Generates the empty trash bin of the rover, composed of four walls and a base.
 * @param {*} name given name
 * @param {*} x position
 * @param {*} y position
 * @param {*} z position
 * @param {*} w width
 * @param {*} h height
 * @param {*} d depth
 * @returns a node with the bin
 */
function bin(name, x, y, z, w, h, d) {
    const th = 0.03;
    return node(name, { t: [x, y, z] }, [
        leaf(name + "floor", "cube", black, { t: [0, th / 2, 0], s: [w, th, d] }),
        leaf(name + "front", "cube", yellow, { t: [0, h / 2, d / 2 - th / 2], s: [w, h, th] }),
        leaf(name + "back", "cube", grey, { t: [0, h / 2, -d / 2 + th / 2], s: [w, h, th] }),
        leaf(name + "left", "cube", blue, { t: [-w / 2 + th / 2, h / 2, 0], s: [th, h, d - 2 * th] }),
        leaf(name + "right", "cube", brown, { t: [w / 2 - th / 2, h / 2, 0], s: [th, h, d - 2 * th] })
    ]);
}

/**
 * Generates a mast composed of base, pole and camera.
 * The camera itself has the two intended dots.
 * @param {*} name given name
 * @param {*} x position
 * @param {*} z position
 * @param {*} h height
 * @returns a node with the camera
 */
function mast(name, x, z, h) {
    return node(name, { t: [x, 0.6, z] }, [
        leaf("base", "sphere", grey, { s: [0.1, 0.1, 0.1] }),
        leaf("pole", "cylinder", white, { t: [0, h / 2, 0], s: [0.04, h, 0.04] }),
        node("camera", { t: [0, h + 0.06, 0] }, [
            leaf("head", "cube", black, { s: [0.18, 0.12, 0.32] }),
            dots("camera dot", grey, 0.1, 0, 0.08, 0.055, 0.02),
        ])
    ]);
}

/**
 * Generates a solar pannel with characteristic line grid, tilted to a certain angle.
 * @param {*} name given name
 * @param {*} x position
 * @param {*} y position
 * @param {*} z position
 * @param {*} w width
 * @param {*} h height
 * @param {*} d depth
 * @param {*} cols number of columns
 * @param {*} rows number of rows
 * @param {*} tilt angle of the pannel
 * @returns a node the solar pannel
 */
function solar_panel(name, x, y, z, w, h, d, cols, rows, tilt) {
    const line = 0.012;
    const lift = 0.01;
    const parts = [leaf("cells", "cube", blue, { s: [w, h, d] })];

    parts.push(leaf("frame L", "cube", silver, { t: [-w / 2 + line, h / 2, 0], s: [line * 2, lift, d] }));
    parts.push(leaf("frame R", "cube", silver, { t: [w / 2 - line, h / 2, 0], s: [line * 2, lift, d] }));
    parts.push(leaf("frame F", "cube", silver, { t: [0, h / 2, d / 2 - line], s: [w, lift, line * 2] }));
    parts.push(leaf("frame B", "cube", silver, { t: [0, h / 2, -d / 2 + line], s: [w, lift, line * 2] }));

    for (let i = 1; i < cols; i++)
        parts.push(leaf("col " + i, "cube", silver, { t: [-w / 2 + i * w / cols, h / 2, 0], s: [line, lift, d] }));
    for (let j = 1; j < rows; j++)
        parts.push(leaf("row " + j, "cube", silver, { t: [0, h / 2, -d / 2 + j * d / rows], s: [w, lift, line] }));

    return node(name, { t: [x, y + lift, z], r: [0, 0, tilt] }, parts);
}

/**
 * Generates two supports that go under the solar pannel.
 * @param {*} name given name
 * @param {*} x position
 * @param {*} y position
 * @param {*} z position
 * @param {*} w width
 * @param {*} d depth
 * @returns a node with both supports
 */
function supports(name, x, y, z, w, d) {
    const supports = [];
    supports.push(leaf("support L", "cylinder", grey, { t: [w * 0.35, -0.06, d / 4], s: [0.04, 0.40, 0.04] }));
    supports.push(leaf("support R", "cylinder", grey, { t: [w * 0.35, -0.06, - d / 4], s: [0.04, 0.40, 0.04] }));
    return node(name, { t: [x, y, z] }, supports);
}

/**
 * Generates the rover claw.
 * @returns a node with the claw structure (base and jaws)
 */
function claw() {
    return node("claw", { t: [0, 0.45, 0] }, [
        leaf("hand", "cube", black, { t: [0, 0.05, 0], s: [0.1, 0.05, 0.3] }),
        node("jaw 1", { t: [0, 0, GRIP_OPEN] }, [
            leaf("jaw 1 shape", "cube", grey, { t: [0.01, 0.15, 0.05], s: [0.02, 0.15, 0.03] }),
        ]),
        node("jaw 2", { t: [0, 0, -GRIP_OPEN] }, [
            leaf("jaw 2 shape", "cube", grey, { t: [0.01, 0.15, -0.05], s: [0.02, 0.15, 0.03] }),
        ]),
    ]);
}

/**
 * Generates the rover forearm.
 * @returns a node with the arm structure (joint, forearm and claw)
 */
function lower_arm() {
    return node("elbow", { t: [0, 0.65, 0], r: [0, 0, -145] }, [
        leaf("elbow joint", "sphere", grey, { s: [0.08, 0.08, 0.08] }),
        leaf("forearm", "cube", white, { t: [0, 0.250, 0], s: [0.05, 0.45, 0.05] }),
        claw("claw"),
    ]);
}

/**
 * Generates the rover arm.
 * @param {*} x position
 * @param {*} y position
 * @param {*} z position
 * @returns a node with the arm structure (joint and rest)
 */
function arm(x, y, z) {
    return node("arm", { t: [x, y, z] }, [
        leaf("arm joint", "sphere", grey, { s: [0.08, 0.08, 0.08] }),
        node("shoulder", { t: [0, 0, 0], r: [0, 0, -25] }, [
            leaf("upper arm", "cube", white, { t: [0, 0.315, 0], s: [0.05, 0.65, 0.05] }),
            lower_arm(),
        ]),
    ]);
}

/**
 * Build the complete scene (rover, ground and rocks).
 * @returns a node containing all components of the scene
 */
function build_scene() {
    return node("root", {}, [
        tiles(40, 2),
        rocks(8),
        node("rover", { t: [0, 0, 0] }, [
            leaf("base", "cube", white, { t: [0, 0.5, 0], s: [1.5, 0.2, 1] }),
            dots("base dot", silver, 0.76, 0.55, 0.4, 0.07, 0.01),
            rockers("rocker", 0.38, 0.58, 1.2, 0.06),
            wheel_pair("front", 0.55),
            wheel_pair("center", 0.0),
            wheel_pair("back", -0.55),
            solar_panel("solar panel", -0.48, 0.67, 0, 1, 0.04, 1.3, 4, 5, 20),
            supports("supports", -0.47, 0.67, 0, 1, 1.3),
            leaf("exauster", "cylinder", grey, { t: [-0.8, 0.47, 0.35], r: [0, 0, 90], s: [0.1, 0.25, 0.1] }),
            bin("bin", 0.45, 0.6, -0.25, 0.4, 0.2, 0.4),
            mast("mast", 0.58, 0.35, 0.9),
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

const WHEELS = ["front left", "front right", "center left", "center right", "back left", "back right"];
const GRIP_OPEN = 0.05;
const GRIP_CLOSE = -0.035;

const held = new Set();

let wheel_roll = 0;
let steer = 0;
let gripper_closed = false;

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

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function turn(joint, axis, plus, minus, dt, lo, hi, rate) {
    if (lo === undefined) lo = -Infinity;
    if (hi === undefined) hi = Infinity;
    if (rate === undefined) rate = 45;
    const dir = (held.has(plus) ? 1 : 0) - (held.has(minus) ? 1 : 0);
    if (dir != 0) {
        joint.transform.rotation[axis] = clamp(joint.transform.rotation[axis] + dir * rate * dt, lo, hi);
    }
}

function dir_movements(rover, dt) {
    const v = ((held.has('w') ? 1 : 0) - (held.has('s') ? 1 : 0)) * 1.5;
    const steer_dir = ((held.has('a') ? 1 : 0) - (held.has('d') ? 1 : 0));

    wheel_roll -= (v * dt / 0.25) * 180 / Math.PI;
    steer = clamp(steer + steer_dir * 45 * dt, -20, 20);

    for (const name of WHEELS) {
        find(rover, name + " spin").transform.rotation[1] = wheel_roll;
    }
    for (const name of ["front left", "front right"]) {
        find(rover, name + " steer").transform.rotation[1] = steer;
    }
    for (const name of ["back left", "back right"]) {
        find(rover, name + " steer").transform.rotation[1] = -steer;
    }

    const yaw = rover.transform.rotation[1]* Math.PI / 180;
    rover.transform.translation[0] += Math.cos(yaw) * v * dt;
    rover.transform.translation[2] -= Math.sin(yaw) * v * dt;

    const omega = v * Math.tan(steer * Math.PI / 180) / 0.55;
    rover.transform.rotation[1] += omega * dt * 180 / Math.PI;
}

function jaw_movements(jaw1, jaw2, dt) {
    const target = gripper_closed ? GRIP_CLOSE : GRIP_OPEN;
    const cur = jaw1.transform.translation[2];
    const step = 0.1 * dt;
    const ag = cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step);
    jaw1.transform.translation[2] = ag;
    jaw2.transform.translation[2] = -ag;
}

function update(dt) {
    const rover = find(scene, "rover");
    dir_movements(rover, dt);

    const arm = find(rover, "arm");
    const shoulder = find(arm, "shoulder");
    const elbow = find(shoulder, "elbow");
    const claw = find(elbow, "claw");
    const camera = find(rover, "camera");

    turn(arm, 1, 'q', 'e', dt, -50, 50);
    turn(shoulder, 2, 'u', 'j', dt, -79, -10);
    turn(elbow, 2, 'i', 'k', dt, -150, 150);
    turn(claw, 1, 'o', 'l', dt, -180, 180);
    turn(camera, 1, 'f', 'h', dt, -90, 90);
    turn(camera, 2, 't', 'g', dt, -45, 45);

    const jaw1 = find(claw, "jaw 1");
    const jaw2 = find(claw, "jaw 2");
    jaw_movements(jaw1, jaw2, dt);
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
