import { PADS } from "./game";

let ctx: AudioContext | null = null;
function audio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function playPad(pad: number) {
  const c = audio();
  const item = PADS[pad];
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = pad === 1 ? "triangle" : pad === 5 ? "sawtooth" : "sine";
  osc.frequency.setValueAtTime(item.freq, c.currentTime);
  if (pad === 0 || pad === 5) osc.frequency.exponentialRampToValueAtTime(Math.max(35, item.freq * 0.45), c.currentTime + 0.18);
  gain.gain.setValueAtTime(0.0001, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.22, c.currentTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + (pad === 3 ? 0.65 : 0.22));
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.7);
}

export function playMystery(id: string) {
  const c = audio();
  const now = c.currentTime;
  const tone = (freq: number, at: number, dur: number, type: OscillatorType = "sine", volume = 0.12) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(volume, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(c.destination); o.start(at); o.stop(at + dur + 0.02);
  };
  const noise = (at: number, dur: number, volume = 0.06) => {
    const buffer = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(), g = c.createGain();
    src.buffer = buffer; g.gain.setValueAtTime(volume, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(g).connect(c.destination); src.start(at);
  };
  if (id === "rain") { for (let i=0;i<24;i++) tone(900 + Math.random()*1500, now+i*.19, .08, "sine", .025); noise(now, 4.8, .025); }
  else if (id === "footsteps") { for (let i=0;i<7;i++) { tone(100, now+i*.62, .16, "triangle", .18); tone(65, now+i*.62+.02, .12, "sine", .12); } }
  else if (id === "knock") { [0,.55,1.1].forEach(t=>{ tone(125,now+t,.18,"triangle",.24); tone(72,now+t,.22,"sine",.12); }); }
  else if (id === "birds") { for (let i=0;i<9;i++) { const t=i*.48; tone(1200+Math.random()*800,now+t,.12,"sine",.07); tone(1650+Math.random()*500,now+t+.12,.1,"sine",.06); } }
  else if (id === "heartbeat") { for (let i=0;i<5;i++) { tone(65,now+i*1.0,.2,"sine",.25); tone(58,now+i*1.0+.22,.2,"sine",.2); } }
  else if (id === "bubbles") { for (let i=0;i<16;i++) tone(220+Math.random()*700,now+i*.28,.11,"sine",.07); }
  else if (id === "bell") { [0,1.6,3.2].forEach(t=>{ tone(880,now+t,1.1,"sine",.13); tone(1320,now+t, .8,"sine",.06); }); }
  else { for (let i=0;i<18;i++) { tone(90+Math.random()*35,now+i*.27,.2,"sawtooth",.07); noise(now+i*.27,.12,.025); } }
}

export function playRhythm(events: {pad:number;at:number}[]) {
  if (!events.length) return;
  const ordered = [...events].sort((a,b) => a.at-b.at);
  const firstAt = ordered[0].at;
  ordered.forEach(e => {
    const delay = Math.max(0, e.at-firstAt);
    window.setTimeout(() => playPad(e.pad), delay);
  });
}

export function playMusic(enabled: boolean) {
  if (!enabled) return () => {};
  const c = audio();
  const notes = [261.63, 329.63, 392, 523.25];
  let alive = true;
  let index = 0;
  const tick = () => {
    if (!alive) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sine"; o.frequency.value = notes[index++ % notes.length];
    g.gain.value = 0.012;
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.22);
    window.setTimeout(tick, 900);
  };
  tick();
  return () => { alive = false; };
}