#version 300 es

// The corners of the quad are already in clip space, so they pass straight
// through.

uniform int u_pointSize;
in vec2 a_position;
in vec4 a_color;
out vec4 v_color;

void main() {
    gl_Position = vec4(a_position, 0.0f, 1.0f);
    v_color = a_color;
    if (u_pointSize == 0) {
        gl_PointSize = 16.0;
    } else if (u_pointSize == 1) {
        gl_PointSize = 15.0;
    } else gl_PointSize = 11.0;
}
