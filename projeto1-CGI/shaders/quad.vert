#version 300 es

// The corners of the quad are already in clip space, so they pass straight
// through.

uniform vec2 u_center;
uniform float u_scale;
uniform float u_world_half_width;
uniform int u_pointSize;
uniform bool u_points;
in vec2 a_position;
in vec4 a_color;
out vec4 v_color;

void main() {
    if (u_points) {
        gl_Position = vec4((a_position.xy - u_center) / (u_scale * u_world_half_width), 0.0, 1.0);
    } else gl_Position = vec4(a_position, 0.0, 1.0);
     
    v_color = a_color;

    if (u_pointSize == 0) gl_PointSize = 16.0;
    else if (u_pointSize == 1) gl_PointSize = 15.0;
    else gl_PointSize = 11.0;
}
