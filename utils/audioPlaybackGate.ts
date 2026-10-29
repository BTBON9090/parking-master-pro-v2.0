/** Suspend the graph itself instead of only muting its output. Keep the most
 * recent playback demand across asynchronous WebAudio state transitions. */
export class AudioPlaybackGate {
  private active=false;
  private pending=0;
  private disposed=false;
  constructor(private context:Pick<AudioContext,'state'|'resume'|'suspend'>){}
  setActive(active:boolean,userGesture=false){
    const changed=active!==this.active;this.active=active;
    if(this.disposed||this.context.state==='closed')return;
    // Do not serialize an opposite command behind a pending WebAudio
    // promise: autoplay/device activation can keep it pending indefinitely.
    // The browser accepts the newer demand on its control queue. A gesture
    // may also retry a pending resume to unlock autoplay.
    if(this.pending>0&&!changed&&!userGesture)return;
    if(this.pending===0&&(active?this.context.state==='running':this.context.state==='suspended'))return;
    this.pending++;
    const done=()=>{
      this.pending--;
      // A late older transition must not undo a newer pause. A failed
      // request for the current state waits for interaction, without polling.
      if(this.pending===0&&this.active!==active)this.setActive(this.active);
    };
    try{(active?this.context.resume():this.context.suspend()).then(done,done);}
    catch{done();}
  }
  dispose(){this.disposed=true;}
}
