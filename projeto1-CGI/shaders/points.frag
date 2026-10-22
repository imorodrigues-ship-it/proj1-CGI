#version 300 es

precision highp float;

//uniforms related to site points
uniform bool u_in;
uniform vec4 u_color;

in vec4 v_color;
out vec4 color;

void main() {

  float d = distance(gl_PointCoord, vec2(0.5f, 0.5f));

  if(d > 0.5f || d < 0.3f)
    discard;

  if(u_in)
    color = v_color;
  else
    color = u_color;
}