import * as THREE from 'three';

/** Three colour taps at high speed only. Depth protects the near vehicle and
 * cockpit; central vision, HUD and separately rendered mirrors remain sharp. */
export class SpeedEffect {
  private target: THREE.WebGLRenderTarget | null = null;
  private size = new THREE.Vector2();
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  private material = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { colour: {value:null}, depth: {value:null}, strength:{value:0}, near:{value:.1}, far:{value:10000} },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: `
      uniform sampler2D colour; uniform sampler2D depth;
      uniform float strength, near, far; varying vec2 vUv;
      // The game renderer uses logarithmic depth to prevent distant road
      // surfaces from fighting. Decode that same representation here.
      float viewDistance(float depthValue){return exp2(depthValue*log2(far+1.))-1.;}
      void main(){
        float z=texture2D(depth,vUv).x;
        float distance=viewDistance(z);
        float edge=smoothstep(.48,.95,abs(vUv.x*2.-1.));
        float mask=edge*smoothstep(30.,85.,distance)*step(z,.99999);
        vec2 stretch=(vUv-vec2(.5,.52))*.035*strength*mask;
        vec4 a=texture2D(colour,vUv);
        vec2 bUv=vUv-stretch*.5, cUv=vUv-stretch;
        // Do not smear nearby cabin silhouettes into passing scenery.
        float zb=texture2D(depth,bUv).x, zc=texture2D(depth,cUv).x;
        float wb=.27*smoothstep(30.,85.,viewDistance(zb));
        float wc=.13*smoothstep(30.,85.,viewDistance(zc));
        gl_FragColor=a*(1.-wb-wc)+texture2D(colour,bUv)*wb+texture2D(colour,cUv)*wc;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  private quad = new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);
  constructor() {
    this.scene.add(this.quad);
  }
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, strength: number) {
    if(strength<.003){renderer.render(scene,camera);return;}
    renderer.getDrawingBufferSize(this.size);
    if(!this.target){
      this.target=new THREE.WebGLRenderTarget(this.size.x,this.size.y,{depthBuffer:true});
      // The default framebuffer's antialias option does not apply to an
      // offscreen target. Resolve two samples before the speed effect.
      this.target.samples=Math.min(2,renderer.capabilities.maxSamples);
      this.target.depthTexture=new THREE.DepthTexture(this.size.x,this.size.y);
    }
    if(this.target.width!==this.size.x || this.target.height!==this.size.y) this.target.setSize(this.size.x,this.size.y);
    renderer.setRenderTarget(this.target);
    renderer.render(scene,camera);
    renderer.setRenderTarget(null);
    const u=this.material.uniforms;
    u.colour.value=this.target.texture;u.depth.value=this.target.depthTexture;
    u.strength.value=strength;u.near.value=camera.near;u.far.value=camera.far;
    renderer.render(this.scene,this.camera);
  }
  dispose(){this.target?.dispose();this.quad.geometry.dispose();this.material.dispose();}
}
