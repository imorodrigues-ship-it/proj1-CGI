#version 300 es

// The corners of the quad are already in clip space, so they pass straight
// through.

in vec2 a_position;
in vec4 a_color;

out vec4 v_color;

void main() {
    gl_Position = vec4(a_position, 0.0f, 1.0f);
    gl_PointSize = 10.0f;
    v_color = a_color;
}
