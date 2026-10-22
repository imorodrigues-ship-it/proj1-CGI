import { loadShadersFromURLS, buildProgramFromSources, setupWebGL } from "../../libs/utils.js";
import { vec2, vec4, flatten } from "../../libs/MV.js";

/** @type {HTMLCanvasElement} */
let canvas;
/** @type {WebGL2RenderingContext} */
let gl;

let pointsProgram;
let areasProgram;
let quad_vao; //vao for triangles
let sites_vao; //vao for sites

//uniform vars
let u_size, u_color, u_in, u_isborderon;
let points_center, points_scale, points_world_half_width, points_canvas;
let area_center, area_scale, area_world_half_width, area_canvas;
let u_numsites, u_sites, u_colors, u_distance;

//variables used on the event listener, border to know when its active
let down = null;
let last = null;
let moved = false;
let border = false;

//dragged defines index of site being dragged (-1 if canvas)
//distance refers to which metric is being applied (0 for euclidian, 1 for manhattan, 2 for chebyshev)
let dragged = -1;
let distance = 0;

//variables regarding sites positions and colors
let sitesBuffer;
let colorBuffer;

//variables regarding canvas center, scale and current mouse coordinates
let center = [0.0, 0.0];
let scale = 1.0;
let here = null;

const WORLD_HALF_WIDTH = 1.0;
const MAX_SITES = 32;
const sites = [];
const colors = [];

// ---------------------------------------------------------------------------
// Input. The event listeners are already set up in setup_input(); fill in
// these functions. Mouse positions are in canvas pixels, with (0, 0) at the
// top-left corner and y growing downwards.
// ---------------------------------------------------------------------------

//converting pixel positions into world coordinations
function to_world(x, y)
{
    const nx = (x / canvas.width) * 2 - 1;
    const ny = 1 - (y / canvas.height) * 2;
    const aspect = canvas.height / canvas.width;

    return vec2(
        nx * WORLD_HALF_WIDTH * scale + center[0],
        ny * aspect * WORLD_HALF_WIDTH * scale + center[1]
    );
}

//converting world coordinations into pixel positions
function to_screen(x, y)
{
    const aspect = canvas.height / canvas.width;
    const nx = (x - center[0]) / (scale * WORLD_HALF_WIDTH);
    const ny = (y - center[1]) / (scale * WORLD_HALF_WIDTH * aspect);

    return [
        (nx + 1) / 2 * canvas.width,
        (1 - ny) / 2 * canvas.height
    ];
}

function pan(dx, dy)
{
    const world_units_per_pixel = (2 * WORLD_HALF_WIDTH * scale) / canvas.width;
    center[0] -= dx * world_units_per_pixel;
    center[1] += dy * world_units_per_pixel;
}

function on_mouse_down(x, y)
{
    down = [x, y];
    last = down;
    moved = false;
}

//mouse "drag": moves a site if drag occurs in one's position, pans canvas otherwise 
function on_mouse_move(x, y)
{
    here = [x, y];
    if (down === null) return;

    if (!moved && Math.hypot(here[0] - down[0], here[1] - down[1]) <= 4) return;

    if (!moved) {
        for (let i = 0; i < sites.length; i++) {
            let curr = to_screen(sites[i][0], sites[i][1]);
            if (Math.hypot(curr[0] - down[0], curr[1] - down[1]) <= 8) dragged = i;
        }
    }
    moved = true;

    if (dragged >= 0) {
        sites[dragged] = to_world(x, y);
        gl.bindBuffer(gl.ARRAY_BUFFER, sitesBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, dragged * 2 * 4, new Float32Array(sites[dragged]));
    } else pan(x - last[0], y - last[1]);
    last = here;
}

//mouse "click": creates a random colored site
function on_mouse_up(x, y)
{
    if (!moved) {
        if (sites.length >= MAX_SITES) {
            down = null;
            return;
        }
        sites.push(to_world(x, y));
        colors.push(vec4(Math.random(), Math.random(), Math.random(), 1.0));

        gl.bindBuffer(gl.ARRAY_BUFFER, sitesBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, flatten(sites), gl.STATIC_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, flatten(colors), gl.STATIC_DRAW);
    }
    down = null;
    dragged = -1;
}

// dy > 0 when the wheel is scrolled down (towards the user)
function on_wheel(x, y, dy)
{
    let before = to_world(x, y);

    scale = Math.min(4.0, Math.max(0.2, scale * (1 + dy / 1000)));

    let after = to_world(x, y);

    center[0] += before[0] - after[0];
    center[1] += before[1] - after[1];
}

function on_key(key)
{
    switch (key) {
        case '1':
            distance = 0;
            break;
        case '2':
            distance = 1;
            break;
        case '3':
            distance = 2;
            break;
        case 'b':
            border = !border;
            break;
        case 'r':
            for (let i = 0; i < sites.length; i++) {
                colors[i] = vec4(Math.random(), Math.random(), Math.random(), 1.0);
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, flatten(colors), gl.STATIC_DRAW);
            break;
        case 'x': {
            if (here == null) return;

            let minDist = -1;
            let minIndex = -1;
            for (let i = 0; i < sites.length; i++) {
                const curr = to_screen(sites[i][0], sites[i][1]);
                const currDist = Math.hypot(here[0] - curr[0], here[1] - curr[1]);
                if (minDist < 0 || currDist < minDist) {
                    minDist = currDist;
                    minIndex = i;
                }
            }
            //threshold for site remove
            if (minDist < 0 || minDist > 20) return;

            sites.splice(minIndex, 1);
            gl.bindBuffer(gl.ARRAY_BUFFER, sitesBuffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, flatten(sites));

            colors.splice(minIndex, 1);
            gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, flatten(colors));
            break;
        }
        case 'm':       // switch rendering technique / split view
            break;
    }
}

// ---------------------------------------------------------------------------

function resize()
{
    // Match the canvas's drawing buffer to the size it is shown at, and
    // draw over all of it
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
}

function setup_input()
{
    canvas.addEventListener("mousedown", (event) => on_mouse_down(event.offsetX, event.offsetY));
    canvas.addEventListener("mousemove", (event) => on_mouse_move(event.offsetX, event.offsetY));
    window.addEventListener("mouseup", (event) => on_mouse_up(event.offsetX, event.offsetY));
    canvas.addEventListener("wheel", (event) =>
    {
        on_wheel(event.offsetX, event.offsetY, event.deltaY);
        event.preventDefault();     // don't let the page scroll as well
    });
    window.addEventListener("keydown", (event) => on_key(event.key));
}

function setup(shaders)
{
    canvas = document.getElementById("gl-canvas");
    gl = setupWebGL(canvas);

    pointsProgram = buildProgramFromSources(gl, shaders["points.vert"], shaders["points.frag"]);

    areasProgram = buildProgramFromSources(gl, shaders["areas.vert"], shaders["areas.frag"]);

    // A quad covering the whole viewport, as two triangles: its corners are
    // the corners of clip space, from (-1, -1) to (1, 1)
    const corners = new Float32Array([
        -1, -1, 1, -1, 1, 1,       // first triangle
        -1, -1, 1, 1, -1, 1,       // second triangle
    ]);

    u_size = gl.getUniformLocation(pointsProgram, "u_size");               //changes based on what site to draw (main or outer layers)
    u_in = gl.getUniformLocation(pointsProgram, "u_in");                   //changes based on what color to use (random color or given)
    u_color = gl.getUniformLocation(pointsProgram, "u_color");             //passed given color
    u_isborderon = gl.getUniformLocation(areasProgram, "u_isborderon");   //alerts the frag shader if borders are on

    //uniforms operating with world coordinates
    area_center = gl.getUniformLocation(areasProgram, "u_center");
    area_scale = gl.getUniformLocation(areasProgram, "u_scale");
    area_world_half_width = gl.getUniformLocation(areasProgram, "u_world_half_width");
    area_canvas = gl.getUniformLocation(areasProgram, "u_canvas");

    //uniforms operating with world coordinates
    points_center = gl.getUniformLocation(pointsProgram, "u_center");
    points_scale = gl.getUniformLocation(pointsProgram, "u_scale");
    points_world_half_width = gl.getUniformLocation(pointsProgram, "u_world_half_width");
    points_canvas = gl.getUniformLocation(pointsProgram, "u_canvas");

    //uniforms for distance coloring
    u_distance = gl.getUniformLocation(areasProgram, "u_distance");
    u_numsites = gl.getUniformLocation(areasProgram, "u_numsites");
    u_sites = gl.getUniformLocation(areasProgram, "u_sites");
    u_colors = gl.getUniformLocation(areasProgram, "u_colors");

    const pointsPosition = gl.getAttribLocation(pointsProgram, "a_position");
    const a_color = gl.getAttribLocation(pointsProgram, "a_color");

    const areasPosition = gl.getAttribLocation(areasProgram, "a_position");

    //configuring background
    quad_vao = gl.createVertexArray();
    gl.bindVertexArray(quad_vao);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(areasPosition);
    gl.vertexAttribPointer(areasPosition, 2, gl.FLOAT, false, 0, 0);

    //configuring sites
    sites_vao = gl.createVertexArray();
    gl.bindVertexArray(sites_vao);

    sitesBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sitesBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_SITES * 2 * 4, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(pointsPosition);
    gl.vertexAttribPointer(pointsPosition, 2, gl.FLOAT, false, 0, 0);

    colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_SITES * 4 * 4, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(a_color);
    gl.vertexAttribPointer(a_color, 4, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);

    resize();
    window.addEventListener("resize", resize);
    setup_input();

    gl.clearColor(0.0, 0.0, 0.0, 1.0);

    window.requestAnimationFrame(animate);
}

function animate(timestamp)
{
    window.requestAnimationFrame(animate);

    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(areasProgram);

    gl.uniform2fv(area_center, center);
    gl.uniform1f(area_scale, scale);
    gl.uniform1f(area_world_half_width, WORLD_HALF_WIDTH);
    gl.uniform2fv(area_canvas, vec2(canvas.width, canvas.height));

    gl.uniform1i(u_numsites, sites.length);
    gl.uniform2fv(u_sites, flatten(sites));
    gl.uniform4fv(u_colors, flatten(colors));
    gl.uniform1i(u_distance, distance);
    gl.uniform1i(u_isborderon, border);

    //background draw
    gl.bindVertexArray(quad_vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.useProgram(pointsProgram);

    gl.uniform2fv(points_center, center);
    gl.uniform1f(points_scale, scale);
    gl.uniform1f(points_world_half_width, WORLD_HALF_WIDTH);
    gl.uniform2fv(points_canvas, vec2(canvas.width, canvas.height));


    gl.bindVertexArray(sites_vao);

    //site outer-layer (black)
    gl.uniform1i(u_in, false);
    gl.uniform4f(u_color, 0.0, 0.0, 0.0, 1.0);
    gl.uniform1i(u_size, 0);
    gl.drawArrays(gl.POINTS, 0, sites.length);

    //site outer-layer (white)
    gl.uniform4f(u_color, 1.0, 1.0, 1.0, 1.0);
    gl.uniform1i(u_size, 1);
    gl.drawArrays(gl.POINTS, 0, sites.length);

    //site draw
    gl.uniform1i(u_in, true);
    gl.uniform1i(u_size, 2);
    gl.drawArrays(gl.POINTS, 0, sites.length);

    gl.bindVertexArray(null);
}

loadShadersFromURLS(["points.vert", "points.frag", "areas.vert", "areas.frag"]).then(shaders => setup(shaders));
