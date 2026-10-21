#version 300 es

// The corners of the quad are already in clip space, so they pass straight
// through.

//uniforms related to site points
uniform int u_size;
uniform bool u_points;

//uniforms related to site positions
uniform vec2 u_center;
uniform vec2 u_canvas;
uniform float u_scale;
uniform float u_world_half_width;

in vec2 a_position;
in vec4 a_color;
out vec4 v_color;

void main() {
    if (u_points) {
        float aspect = u_canvas.y / u_canvas.x;
        float nx = (a_position.x - u_center.x) / (u_scale * u_world_half_width);
        float ny = (a_position.y - u_center.y) / (u_scale * u_world_half_width * aspect);

        gl_Position = vec4(nx, ny, 0.0, 1.0);

    } else gl_Position = vec4(a_position, 0.0, 1.0);
     
    v_color = a_color;

    if (u_size == 0) gl_PointSize = 16.0;
    else if (u_size == 1) gl_PointSize = 15.0;
    else gl_PointSize = 11.0;
}
