import { loadShadersFromURLS, buildProgramFromSources, setupWebGL } from "../../libs/utils.js";

/** @type {HTMLCanvasElement} */
let canvas;
/** @type {WebGL2RenderingContext} */
let gl;

let program;
let quad_vao;    // the quad covering the whole viewport

//variables used on the event listener
let down = null;
let last = null;
let moved = false;

var center = [0.0, 0.0];
var scale = 1.0;

var sitesBuffer;
var colorBuffer;

const WORLD_HALF_WIDTH = 1.0;

const MAX_SITES = 32;

const sites = [];

// ---------------------------------------------------------------------------
// Input. The event listeners are already set up in setup_input(); fill in
// these functions. Mouse positions are in canvas pixels, with (0, 0) at the
// top-left corner and y growing downwards.
// ---------------------------------------------------------------------------

function on_mouse_down(x, y)
{
    down = [x, y];
    last = down;
    moved = false;
}

function on_mouse_move(x, y)
{
}

function on_mouse_up(x, y)
{
    if (!moved) {
        add_vertex(x, y);
    }
    down = null;
}

//function to put the 
function add_vertex(x, y)
{
    if (sites.length >= MAX_SITES) return;

    sites.push(to_world(x, y));

    //update do buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, sitesBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(sites), gl.STATIC_DRAW);

}

function to_world(x, y)
{
    const nx = (x / canvas.width) * 2 - 1;
    const ny = 1 - (y / canvas.height) * 2;

    return vec2(
        nx * WORLD_HALF_WIDTH * scale + center[0],
        ny * WORLD_HALF_WIDTH * scale + center[1]
    );
}

function update_buffers()
{

}

// dy > 0 when the wheel is scrolled down (towards the user)
function on_wheel(x, y, dy)
{
}

function on_key(key)
{
    switch (key) {
        case '1':       // Euclidean distance
            break;
        case '2':       // Manhattan distance
            break;
        case '3':       // Chebyshev distance
            break;
        case 'b':       // toggle cell borders
            break;
        case 'x':       // remove the site under the pointer
            break;
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

    program = buildProgramFromSources(gl, shaders["quad.vert"], shaders["quad.frag"]);

    // A quad covering the whole viewport, as two triangles: its corners are
    // the corners of clip space, from (-1, -1) to (1, 1)
    const corners = new Float32Array([
        -1, -1, 1, -1, 1, 1,       // first triangle
        -1, -1, 1, 1, -1, 1,       // second triangle
    ]);


    sitesBuffer = gl.createBuffer();
    colorBuffer = gl.createBuffer();

    quad_vao = gl.createVertexArray();
    gl.bindVertexArray(quad_vao);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, sitesBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_SITES * 2 * 4, gl.DYNAMIC_DRAW);
    const a_position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(a_position);
    gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_SITES * 4 * 4, gl.DYNAMIC_DRAW);
    const a_color = gl.getAttribLocation(program, "a_color");
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

    gl.useProgram(program);
    const uColor = gl.getUniformLocation(program, "u_color");

    gl.bindVertexArray(quad_vao);

    gl.uniform4f(uColor, Math.random(), Math.random(), Math.random(), 1.0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.drawArrays(gl.POINTS, 0, sites.length)
    gl.bindVertexArray(null);
    //gl.useProgram(null);
}

loadShadersFromURLS(["quad.vert", "quad.frag"]).then(shaders => setup(shaders));
