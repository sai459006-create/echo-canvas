import { useEffect, useMemo, useRef, useState } from "react";
import { onValue, ref, runTransaction, set, update } from "firebase/database";
import { auth, db, ensureAnonymousUser } from "./firebase";
import { BeatEvent, makeCode, Phase, Point, PADS, Player, Room, SOUNDS, soundOptions } from "./game";
import { playMystery, playPad, playRhythm, playMusic } from "./audio";
import { ArrowRight, AudioLines, Check, Copy, Crown, DoorOpen, Headphones, Music2, Pencil, Play, RefreshCw, Sparkles, Users, Volume2, VolumeX, Wifi } from "lucide-react";

const phaseLabels: Record<Phase, string> = {
  lobby: "Waiting room", sound: "Sound → Line", drawing: "Draw the feeling",
  rhythm: "Line → Rhythm", deduction: "Rhythm → Mystery", reveal: "The big reveal"
};

function App() {
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [uid, setUid] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [soundPlays, setSoundPlays] = useState(0);
  const [points, setPoints] = useState<Point[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [guess, setGuess] = useState("");
  const [music, setMusic] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startedAt = useRef(0);

  useEffect(() => {
    ensureAnonymousUser().then(user => setUid(user.uid)).catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    if (!music) return;
    return playMusic(true);
  }, [music]);

  useEffect(() => {
    if (!roomCode || !db) return;
    const unsub = onValue(ref(db, `rooms/${roomCode}`), snap => {
      setRoom(snap.exists() ? snap.val() as Room : null);
    }, e => setError(e.message));
    return () => unsub();
  }, [roomCode]);

  useEffect(() => {
    if (!room?.deadline || room.phase === "lobby" || room.phase === "reveal") { setRemaining(0); return; }
    const tick = () => setRemaining(Math.max(0, Math.ceil((room.deadline - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [room?.deadline, room?.phase]);

  useEffect(() => {
    if (!room || !uid || room.hostId !== uid || remaining !== 0 || !room.deadline) return;
    if (room.phase === "drawing") void finishDrawing();
    if (room.phase === "rhythm") void finishRhythm();
    if (room.phase === "deduction") void revealAnswer();
  }, [remaining, room?.phase, room?.hostId, uid]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !room?.drawing?.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr); ctx.clearRect(0,0,rect.width,rect.height);
    ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "#ff6b5f"; ctx.shadowColor = "rgba(255,107,95,.25)"; ctx.shadowBlur = 8;
    const pts = room.drawing || [];
    let frame = 0;
    const draw = (count: number) => {
      ctx.clearRect(0,0,rect.width,rect.height);
      if (!count) return;
      ctx.beginPath();
      pts.slice(0, count).forEach((p,i) => { const x=p.x*rect.width, y=p.y*rect.height; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
      ctx.stroke();
    };
    if (room.phase === "rhythm" && pts.length > 1) {
      const start = performance.now();
      const animate = (now: number) => {
        const progress = Math.min(1, (now-start)/2600);
        draw(Math.max(1, Math.ceil(progress*pts.length)));
        if (progress < 1) frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);
    } else draw(pts.length);
    return () => cancelAnimationFrame(frame);
  }, [room?.drawing, room?.phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || room?.phase !== "drawing" || points.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "#ff6b5f"; ctx.shadowColor = "rgba(255,107,95,.25)"; ctx.shadowBlur = 8;
    ctx.beginPath();
    points.forEach((p,i) => { const x=p.x*rect.width, y=p.y*rect.height; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
    ctx.stroke();
  }, [points, room?.phase]);

  const players = useMemo(() => Object.values(room?.players || {}).sort((a,b)=>a.slot-b.slot), [room?.players]);
  const me = room?.players?.[uid];
  const isHost = !!room && room.hostId === uid;
  const role = me?.slot || 0;
  const activeRole = room?.phase === "sound" || room?.phase === "drawing" ? 1 : room?.phase === "rhythm" ? 2 : room?.phase === "deduction" ? 3 : 0;
  const isMyTurn = !!room && (role === activeRole || (players.length === 2 && isHost && activeRole === 3));

  async function createRoom() {
    if (!db || !uid) return;
    setBusy(true); setError("");
    try {
      const code = makeCode();
      const player: Player = { id: uid, name: name.trim() || "Player 1", slot: 1, joinedAt: Date.now(), connected: true };
      const data: Room = { code, hostId: uid, phase: "lobby", players: { [uid]: player }, originalSoundId: "", drawing: [], rhythm: [], answer: "", selectedAnswer: "", score: 0, deadline: 0, createdAt: Date.now(), round: 1 };
      await set(ref(db, `rooms/${code}`), data);
      setRoomCode(code);
    } catch (e:any) { setError(e.message || "Couldn't create room."); }
    finally { setBusy(false); }
  }

  async function joinRoom() {
    if (!db || !uid) return;
    const code = roomCode.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z]{4}$/.test(code)) { setError("Enter a valid four-letter room code."); return; }
    setBusy(true); setError("");
    try {
      const roomRef = ref(db, `rooms/${code}`);
      const result = await runTransaction(roomRef, current => {
        if (!current) return;
        if (current.players?.[uid]) return current;
        const count = Object.keys(current.players || {}).length;
        if (count >= 3 || current.phase !== "lobby") return;
        const slot = count + 1;
        current.players = current.players || {};
        current.players[uid] = { id: uid, name: name.trim() || `Player ${slot}`, slot, joinedAt: Date.now(), connected: true };
        return current;
      });
      if (!result.committed) throw new Error("Room not found, already started, or full.");
      setRoomCode(code);
    } catch (e:any) { setError(e.message || "Couldn't join room."); }
    finally { setBusy(false); }
  }

  async function patch(data: Partial<Room>) {
    if (!db || !roomCode) return;
    await update(ref(db, `rooms/${roomCode}`), data);
  }

  async function startGame() {
    if (!room || !isHost) return;
    const original = SOUNDS[Math.floor(Math.random()*SOUNDS.length)].id;
    await patch({ phase: "sound", originalSoundId: original, drawing: [], rhythm: [], selectedAnswer: "", answer: "", deadline: Date.now()+15000 });
    setSoundPlays(0);
  }

  function playOriginal() {
    if (!room || soundPlays >= 2) return;
    playMystery(room.originalSoundId);
    setSoundPlays(v=>v+1);
  }

  function pointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isMyTurn || room?.phase !== "drawing") return;
    const rect = e.currentTarget.getBoundingClientRect();
    startedAt.current = Date.now();
    const p = { x: (e.clientX-rect.left)/rect.width, y: (e.clientY-rect.top)/rect.height, t: 0 };
    setPoints([p]); setDrawing(true); e.currentTarget.setPointerCapture(e.pointerId);
  }
  function pointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setPoints(old => [...old, { x:(e.clientX-rect.left)/rect.width, y:(e.clientY-rect.top)/rect.height, t:Date.now()-startedAt.current }]);
  }
  async function pointerUp() { if (!drawing) return; setDrawing(false); }
  async function finishDrawing() {
    if (!room || room.phase !== "drawing") return;
    const data = points.length ? points : room.drawing;
    await patch({ drawing: data, phase: "rhythm", deadline: Date.now()+45000 });
  }
  async function beginDrawing() {
    if (!room || room.phase !== "sound" || !isMyTurn) return;
    await patch({ phase: "drawing", deadline: Date.now()+45000 });
    setPoints([]);
  }

  async function tapPad(index: number) {
    if (!room || room.phase !== "rhythm" || !isMyTurn || !db) return;
    playPad(index);
    const phaseStartedAt = room.deadline - 45000;
    const event: BeatEvent = { pad:index, at:Math.max(0, Date.now()-phaseStartedAt) };
    await runTransaction(ref(db, `rooms/${roomCode}/rhythm`), current => [...(current || []), event]);
  }
  async function finishRhythm() {
    if (!room || room.phase !== "rhythm") return;
    await patch({ phase: "deduction", deadline: Date.now()+20000 });
  }
  async function submitGuess() {
    if (!room || room.phase !== "deduction" || !isMyTurn || !guess) return;
    await patch({ selectedAnswer: guess, deadline: 0, phase: "reveal", score: room.score + (guess === room.originalSoundId ? 1 : 0) });
  }
  async function revealAnswer() {
    if (!room || room.phase !== "deduction") return;
    await patch({ phase: "reveal", deadline: 0, score: room.score + (room.selectedAnswer === room.originalSoundId ? 1 : 0) });
  }
  async function nextRound() {
    if (!room || !isHost) return;
    await patch({ phase:"sound", originalSoundId:SOUNDS[Math.floor(Math.random()*SOUNDS.length)].id, drawing:[], rhythm:[], selectedAnswer:"", answer:"", deadline:0, round:room.round+1 });
    setSoundPlays(0); setPoints([]); setGuess("");
  }
  async function copyCode() {
    await navigator.clipboard.writeText(roomCode);
    setCopied(true); window.setTimeout(()=>setCopied(false),1500);
  }
  async function leaveRoom() {
    if (db && uid && roomCode) {
      const p = { ...room?.players }; delete p[uid];
      if (room?.hostId === uid) await set(ref(db, `rooms/${roomCode}`), null);
      else await patch({ players:p });
    }
    setRoomCode(""); setRoom(null); setGuess(""); setPoints([]);
  }
  const options = useMemo(() => room?.originalSoundId ? soundOptions(room.originalSoundId, room.round) : [], [room?.originalSoundId, room?.round]);

  if (!roomCode) return (
    <main className="landing">
      <div className="topbar"><div className="brand"><span className="brand-mark">✳</span> echo canvas</div><span className="pill"><span className="live-dot"/> LIVE PARTY GAME</span></div>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles size={15}/> A game of creative telephone</span>
          <h1>Pass the feeling.<br/><em>Lose the meaning.</em></h1>
          <p>One sound. One line. One rhythm. Can your friends decode what started it all?</p>
          <div className="hero-actions">
            <input className="name-input" aria-label="Your name" placeholder="YOUR NAME" maxLength={18} value={name} onChange={e=>setName(e.target.value)} />
            <button className="btn primary" onClick={createRoom} disabled={busy || !uid}><Crown size={18}/> Create a room</button>
            <div className="join-row"><input aria-label="Room code" maxLength={4} placeholder="ROOM CODE" value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase())}/><button className="btn dark" onClick={joinRoom} disabled={busy || !uid}>Join <ArrowRight size={16}/></button></div>
          </div>
          <div className="microcopy"><Users size={15}/> 3 players · 3 devices · 1 wonderfully distorted message</div>
          {error && <div className="error">{error}</div>}
        </div>
        <div className="hero-art">
          <div className="orbit orbit-one"/><div className="orbit orbit-two"/>
          <div className="sticker sticker-a">🎧</div><div className="sticker sticker-b">✏️</div><div className="sticker sticker-c">🥁</div>
          <div className="sound-card"><div className="sound-top"><span>THE SENSORY CHAIN</span><span>01 / 03</span></div><div className="wave">{Array.from({length:34},(_,i)=><i key={i} style={{height:`${18+Math.abs(Math.sin(i*.73))*65}%`}}/>)}</div><div className="sound-bottom"><span>sound → line → rhythm</span><span>✦</span></div></div>
          <div className="floating-note">What did you hear?</div>
        </div>
      </section>
      <section className="how"><div><span className="step-num">01</span><b>LISTEN</b><span>Catch a mystery sound.</span></div><div><span className="step-num">02</span><b>DRAW</b><span>Turn a feeling into a line.</span></div><div><span className="step-num">03</span><b>RECREATE</b><span>Tap the rhythm you see.</span></div><div><span className="step-num">04</span><b>DECODE</b><span>Guess the sound that began it.</span></div></section>
      <footer>Made for curious ears and chaotic creativity <span>✳</span></footer>
    </main>
  );

  if (!room) return <main className="center-screen"><div className="loader">✳</div><h2>Finding your room…</h2><p>If this takes too long, check the room code.</p>{error && <div className="error">{error}</div>}<button className="btn ghost" onClick={()=>setRoomCode("")}>Back</button></main>;

  return (
    <main className="game-shell">
      <header className="game-header"><div className="brand"><span className="brand-mark">✳</span> echo canvas</div><div className="room-tag">ROOM <b>{roomCode}</b><button onClick={copyCode} title="Copy room code"><Copy size={14}/>{copied?"Copied":"Copy"}</button></div><button className="icon-btn" onClick={()=>setMusic(!music)} title="Toggle music">{music?<Music2/>:<VolumeX/>}</button></header>
      <div className="phase-track">{(["sound","drawing","rhythm","deduction","reveal"] as Phase[]).map((p,i)=><div key={p} className={`phase-node ${room.phase===p?"active":(["sound","drawing","rhythm","deduction","reveal"].indexOf(room.phase)>i?"done":"")}`}><span>{i+1}</span><small>{phaseLabels[p]}</small></div>)}</div>
      {room.phase==="lobby" ? (
        <section className="panel lobby-panel"><div className="eyebrow"><Users size={15}/> YOUR PARTY IS FORMING</div><h1>Bring your people.</h1><p>Share this code with two friends. Everyone plays on their own device.</p><div className="big-code">{roomCode.split("").map((c,i)=><span key={i}>{c}</span>)}</div><button className="btn soft" onClick={copyCode}><Copy size={16}/>{copied?"Copied!":"Copy invite code"}</button><div className="player-list">{[1,2,3].map(slot=>{const p=players.find(x=>x.slot===slot);return <div className="player-slot" key={slot}><div className={`avatar avatar-${slot}`}>{p?p.name.slice(0,1).toUpperCase():"?"}</div><div><b>{p?.name||`Waiting for Player ${slot}`}</b><small>{p?(slot===1?"HOST":"READY"):"Waiting to join…"}</small></div>{p&&<Check className="check"/>}</div>})}</div>{players.length<3&&<p className="subtle">You can start with two players. The host will take the missing third turn later.</p>}{isHost&&<button className="btn primary wide" onClick={startGame} disabled={players.length<2}><Play size={18}/> Start game <ArrowRight size={17}/></button>}<button className="text-btn" onClick={leaveRoom}>Leave room</button></section>
      ) : (
        <section className="game-content">
          <div className="game-intro"><div><span className="eyebrow">ROUND {room.round} · {phaseLabels[room.phase].toUpperCase()}</span><h1>{room.phase==="sound"?"Listen closely.":room.phase==="drawing"?"Draw what you felt.":room.phase==="rhythm"?"Read between the lines.":room.phase==="deduction"?"What started it all?":"The message has changed."}</h1><p>{room.phase==="sound"?"Player 1: listen to the mystery sound. Keep it in your head.":room.phase==="drawing"?"Turn the sound into one expressive, continuous line.":room.phase==="rhythm"?"Player 2: watch the line, then recreate its rhythm.":room.phase==="deduction"?"Player 3: listen to the recreated beat and choose the original sound.":"See how the original feeling travelled through your friends."}</p></div><div className="timer"><span>{remaining>0?remaining:"—"}</span><small>SECONDS</small></div></div>
          {room.phase==="sound"&&<div className="panel task-panel"><div className="sound-orb"><Headphones size={42}/><div className="pulse-ring"/></div><h2>{isMyTurn?"Your ears are up.":"Player 1 is listening…"}</h2><p>{isMyTurn?"Listen to the five-second sound. You can replay it twice.":"Waiting for Player 1 to finish listening."}</p>{isMyTurn&&<><button className="btn primary" onClick={playOriginal} disabled={soundPlays>=2}><Volume2 size={18}/> Play mystery sound ({2-soundPlays} replays left)</button><button className="btn soft" onClick={beginDrawing}>I've got it — start drawing <ArrowRight size={16}/></button></>}</div>}
          {room.phase==="drawing"&&<div className="panel task-panel"><div className="canvas-heading"><span>YOUR SOUND, AS A LINE</span><span>{isMyTurn?"Draw with your finger or mouse":"PLAYER 1 IS DRAWING"}</span></div><canvas ref={canvasRef} className="draw-canvas" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}/>{isMyTurn&&<div className="canvas-actions"><button className="btn soft" onClick={()=>setPoints([])}>Clear</button><button className="btn primary" onClick={finishDrawing}><Check size={17}/> Submit line</button></div>}</div>}
          {room.phase==="rhythm"&&<div className="panel task-panel"><div className="canvas-heading"><span>FOLLOW THE LINE</span><span>{isMyTurn?"TAP TO RECREATE":"PLAYER 2 IS PLAYING"}</span></div><div className="line-preview"><canvas ref={canvasRef} className="draw-canvas preview" /></div>{isMyTurn?<><p className="center-text">Six sounds. Your interpretation. Tap freely.</p><div className="pad-grid">{PADS.map((p,i)=><button key={p.name} className={`drum-pad ${p.color}`} onClick={()=>tapPad(i)}><span>{p.emoji}</span><b>{p.name}</b></button>)}</div><button className="btn primary wide" onClick={finishRhythm}>Finish rhythm <ArrowRight size={16}/></button></>:<p className="center-text">Listen to the rhythm being created…</p>}</div>}
          {room.phase==="deduction"&&<div className="panel task-panel"><div className="sound-orb small-orb"><AudioLines size={34}/></div><h2>{isMyTurn?"Decode the rhythm.":"Player 3 is listening…"}</h2><p>{isMyTurn?"Play the recreated rhythm, then choose the sound you think started it.":"Waiting for Player 3's answer."}</p>{isMyTurn&&<><button className="btn soft" onClick={()=>playRhythm(room.rhythm||[])}><Play size={16}/> Play recreated rhythm</button><div className="choice-grid">{options.map(s=><button key={s.id} className={`choice-card ${guess===s.id?"selected":""}`} onClick={()=>setGuess(s.id)}><span>{s.emoji}</span><b>{s.name}</b></button>)}</div><button className="btn primary wide" disabled={!guess} onClick={submitGuess}>Lock in answer <Check size={17}/></button></>}</div>}
          {room.phase==="reveal"&&<div className="panel reveal-panel"><div className="score-bubble"><Sparkles/> TEAM SCORE <b>{room.score}</b></div><h2>The original was…</h2><div className="answer-card"><span>{SOUNDS.find(s=>s.id===room.originalSoundId)?.emoji}</span><div><small>THE STARTING SOUND</small><b>{SOUNDS.find(s=>s.id===room.originalSoundId)?.name}</b></div><button className="btn soft compact" onClick={()=>playMystery(room.originalSoundId)}><Volume2 size={16}/> Replay</button></div><div className="reveal-columns"><div><small>THE LINE</small><canvas ref={canvasRef} className="draw-canvas reveal-canvas"/></div><div><small>THE RECREATED RHYTHM</small><div className="rhythm-replay"><div className="beat-count">{room.rhythm?.length||0} taps</div><button className="btn soft" onClick={()=>playRhythm(room.rhythm||[])}><Play size={16}/> Listen</button><div className="mini-beats">{(room.rhythm||[]).slice(0,30).map((b,i)=><i key={i} style={{height:12+(b.pad%6)*5}}/>)}</div></div></div></div><div className={`result-banner ${room.selectedAnswer===room.originalSoundId?"correct":"incorrect"}`}>{room.selectedAnswer===room.originalSoundId?"🎉 The team decoded it!":"😵 The signal got delightfully scrambled!"}</div>{isHost&&<button className="btn primary wide" onClick={nextRound}><RefreshCw size={17}/> Play another round</button>}<button className="text-btn" onClick={leaveRoom}>Leave game</button></div>}
          <div className="player-strip">{players.map(p=><div key={p.id} className={`mini-player ${p.slot===role?"you":""}`}><span>{["🧑‍🎤","🎨","🥁"][p.slot-1]}</span><b>{p.name}</b><small>{p.id===uid?"YOU":`PLAYER ${p.slot}`}</small></div>)}</div>
        </section>
      )}
      <footer className="game-footer"><span><Wifi size={14}/> Connected room</span><span>✳ Make a little noise.</span></footer>
    </main>
  );
}
export default App;