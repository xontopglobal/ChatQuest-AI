import { useCallback, useEffect, useState } from "react";
import { Activity, AudioLines, BookOpen, Check, ChevronDown, CircleHelp, Clapperboard, Clock3, Crown, Gamepad2, Radio, Settings2, ShieldCheck, Sparkles, Users, Wifi, WifiOff } from "lucide-react";
import { io } from "socket.io-client";
import type { HealthResponse, ServerStatus } from "@chatquest/shared";

type ConnectionState = "checking" | "connected" | "offline";
type Page = "Studio" | "Story library" | "Broadcast overlay" | "Leaderboard";
type Adventure = { id: string; status: "idle" | "active" | "paused" | "ended"; title: string; chapter: string; scene: string; choices: { id: string; label: string; votes: number }[]; updatedAt: string };
const pages: { label: Page; icon: typeof Gamepad2 }[] = [{ label: "Studio", icon: Gamepad2 }, { label: "Story library", icon: BookOpen }, { label: "Broadcast overlay", icon: Clapperboard }, { label: "Leaderboard", icon: Crown }];

function App() {
  const [page, setPage] = useState<Page>(() => pageFromHash(window.location.hash));
  const [apiState, setApiState] = useState<ConnectionState>("checking");
  const [socketState, setSocketState] = useState<ConnectionState>("checking");
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [adventure, setAdventure] = useState<Adventure | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<Adventure[]>([]);

  const refreshAdventure = useCallback(async () => {
    try {
      const response = await fetch("/api/adventure");
      if (!response.ok) throw new Error("Could not load the local adventure.");
      setAdventure(await response.json() as Adventure);
    } catch (error) { setMessage(error instanceof Error ? error.message : "API unavailable."); }
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/adventure/history");
      if (!response.ok) throw new Error("Could not load saved adventures.");
      setHistory(await response.json() as Adventure[]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Saved adventures are unavailable."); }
  }, []);

  useEffect(() => {
    let active = true;
    const socket = io(import.meta.env.VITE_SOCKET_URL || undefined, { autoConnect: true, reconnection: true, reconnectionAttempts: 4, timeout: 3000 });
    fetch("/api/health").then(async response => { if (!response.ok) throw new Error("API unavailable"); return await response.json() as HealthResponse; }).then(() => { if (active) { setApiState("connected"); setCheckedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })); void refreshAdventure(); void refreshHistory(); } }).catch(() => { if (active) { setApiState("offline"); setMessage("API unavailable. Start the local server and retry."); } });
    socket.on("server:ready", (_status: ServerStatus) => { if (active) setSocketState("connected"); });
    socket.on("connect_error", () => { if (active) setSocketState("offline"); });
    socket.on("disconnect", () => { if (active) setSocketState("offline"); });
    return () => { active = false; socket.disconnect(); };
  }, [refreshAdventure, refreshHistory]);

  useEffect(() => {
    const hash = page === "Broadcast overlay" ? "overlay" : page === "Story library" ? "stories" : page === "Leaderboard" ? "leaderboard" : "studio";
    if (window.location.hash !== `#${hash}`) window.history.replaceState(null, "", `#${hash}`);
  }, [page]);

  useEffect(() => {
    const syncHash = () => setPage(pageFromHash(window.location.hash));
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    if (page !== "Broadcast overlay") return;
    const timer = window.setInterval(() => { void refreshAdventure(); }, 2000);
    return () => window.clearInterval(timer);
  }, [page, refreshAdventure]);

  async function action(path: string, body?: unknown) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const data = await response.json().catch(() => ({ error: "Local API is unavailable. Start the server and retry." }));
      if (!response.ok) throw new Error(data.error || "The request could not be completed.");
      setAdventure(data as Adventure); setMessage(path.endsWith("/create") ? "A local preview adventure is ready." : "Adventure updated.");
      if (path.endsWith("/end") || path.endsWith("/create")) await refreshHistory();
    } catch (error) { setMessage(error instanceof TypeError ? "Local API is unavailable. Start the server and retry." : error instanceof Error ? error.message : "The API is unavailable."); }
    finally { setBusy(false); }
  }

  async function connectTwitch() {
    setBusy(true); setMessage("");
    try { const response = await fetch("/api/auth/twitch", { method: "POST" }); const data = await response.json().catch(() => ({ error: "Local API is unavailable. Start the server and retry." })); if (!response.ok) throw new Error(data.error || "Twitch OAuth is unavailable."); setMessage("Twitch authorization started."); }
    catch (error) { setMessage(error instanceof TypeError ? "Local API is unavailable. Start the server and retry." : error instanceof Error ? error.message : "Twitch OAuth is unavailable."); }
    finally { setBusy(false); }
  }

  const connected = apiState === "connected" && socketState === "connected";
  const totalVotes = adventure?.choices.reduce((sum, choice) => sum + choice.votes, 0) ?? 0;

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#studio" onClick={event => { event.preventDefault(); setPage("Studio"); }} aria-label="ChatQuest AI home"><span className="brand-mark"><Sparkles size={19} /></span><span className="brand-name">chatquest<span>ai</span></span></a>
      <button className="workspace-switcher" type="button" onClick={() => setMessage("Personal workspace is the only local workspace.")}><span className="workspace-avatar">CQ</span><span className="workspace-copy"><b>Creator studio</b><small>Personal workspace</small></span><ChevronDown size={15} /></button>
      <div className="side-label">WORKSPACE</div><nav className="primary-nav" aria-label="Workspace">{pages.slice(0, 3).map(({ label, icon: Icon }) => <button key={label} type="button" onClick={() => setPage(label)} className={`nav-link${page === label ? " active" : ""}`} aria-current={page === label ? "page" : undefined}><Icon size={17} /><span>{label}</span>{label === "Broadcast overlay" && <span className="nav-new">LIVE</span>}</button>)}</nav>
      <div className="side-label community-label">COMMUNITY</div><button type="button" className={`nav-link${page === "Leaderboard" ? " active" : ""}`} onClick={() => setPage("Leaderboard")} aria-current={page === "Leaderboard" ? "page" : undefined}><Crown size={17} /><span>Leaderboard</span></button>
      <div className="sidebar-bottom"><button className="help-card" type="button" onClick={() => setMessage("Create an adventure preview, start it, and invite viewers to vote in the overlay.")}><span className="help-icon"><CircleHelp size={17} /></span><span><b>Need a hand?</b><small>Open the creator guide</small></span><ChevronDown className="help-arrow" size={14} /></button><button className="profile-button" type="button" onClick={() => setMessage("Local preview mode · no Twitch account connected.")}><span className="profile-avatar">A</span><span className="profile-copy"><b>Adventure host</b><small>Local preview</small></span><Settings2 size={16} /></button></div>
    </aside>
    <main className="main-content" id="studio">
      <header className="topbar"><div className="breadcrumbs"><button type="button" onClick={() => setPage("Studio")}>Workspace</button><span className="crumb-slash">/</span><b>{page}</b></div><div className="topbar-right"><div className={`server-chip ${connected ? "is-online" : apiState === "offline" || socketState === "offline" ? "is-offline" : "is-checking"}`}>{connected ? <Wifi size={14} /> : apiState === "offline" || socketState === "offline" ? <WifiOff size={14} /> : <Activity size={14} />}<span>{connected ? "System online" : apiState === "offline" || socketState === "offline" ? "Server unavailable" : "Connecting"}</span><i /></div><button type="button" className="icon-button" aria-label="Settings" onClick={() => setMessage("Server settings: PORT, WEB_ORIGIN, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_REDIRECT_URI.")}><Settings2 size={17} /></button><button type="button" className="top-avatar" aria-label="Profile" onClick={() => setMessage("Local preview mode · Twitch is disconnected.")}>A</button></div></header>
      <div className="page-wrap">
        <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />{page === "Studio" ? "STREAMER CONTROL ROOM" : page.toUpperCase()}</div><h1>{page === "Studio" ? "Your next story starts here." : page}</h1><p>{page === "Studio" ? "Set the scene. Bring your community into the adventure." : page === "Broadcast overlay" ? "A browser-source view of your local story and live voting state." : page === "Leaderboard" ? "Community voting totals for the current local adventure." : "Your locally generated adventure previews."}</p></div><div className="heading-meta"><span className="date-dot" /> LOCAL PREVIEW <span className="meta-divider" /> NOV 1, 2026</div></section>
        {message && <div className="notice" role="status"><span>{message}</span><button type="button" aria-label="Dismiss message" onClick={() => setMessage("")}>×</button></div>}
        {page === "Studio" ? <>
          <section className="connection-banner"><div className="connection-orbit"><Radio size={19} /></div><div className="connection-message"><div className="connection-title">Your channel is waiting</div><p>Twitch remains disconnected until OAuth succeeds.</p></div><span className="twitch-status"><span /> NOT CONNECTED</span><button type="button" className="connect-button" disabled={busy} onClick={() => void connectTwitch()}><span className="twitch-glyph">t</span> Connect Twitch</button></section>
          <section className="metrics-grid" aria-label="Stream statistics"><Metric icon={<Users size={16} />} label="VIEWERS IN QUEST" value="—" note="Requires Twitch OAuth" accent="cyan" /><Metric icon={<AudioLines size={16} />} label="VOTES THIS ROUND" value={String(totalVotes)} note={adventure?.status === "active" ? "Local preview votes" : "Start to enable voting"} accent="purple" /><Metric icon={<Crown size={16} />} label="QUESTS COMPLETED" value={String(history.length)} note="Local sessions ended" accent="gold" /><Metric icon={<Clock3 size={16} />} label="STREAM UPTIME" value="—:—" note="Requires Twitch connection" accent="coral" /></section>
          <section className="workspace-grid"><div className="story-panel panel"><div className="panel-heading"><div><div className="panel-kicker">THE ADVENTURE</div><h2>Story control</h2></div><span className="quiet-button"><span className="quiet-dot" />{adventure?.status.toUpperCase() ?? "LOADING"}</span></div><div className="story-stage"><div className="stage-art" aria-hidden="true"><div className="stage-sun" /><div className="stage-mountain mountain-back" /><div className="stage-mountain mountain-front" /><div className="stage-tree tree-one" /><div className="stage-tree tree-two" /><div className="stage-ground" /><span className="stage-star star-one">✦</span><span className="stage-star star-two">✧</span></div><div className="stage-content"><span className="stage-label"><span />{adventure?.status === "idle" ? "LOCAL PREVIEW · READY" : adventure?.status === "active" ? "ADVENTURE LIVE · LOCAL" : adventure?.status === "paused" ? "ADVENTURE PAUSED" : "ADVENTURE ENDED"}</span><h3>{adventure?.title ?? "Loading your adventure…"}</h3><p>{adventure?.scene ?? "Checking the local API connection."}</p><button className="primary-button" type="button" disabled={busy} onClick={() => void action("/api/adventure/create")}><Sparkles size={15} /> Create local preview</button></div><div className="stage-footer"><span><ShieldCheck size={14} /> Local story preview</span><span>{adventure?.chapter ?? ""}</span></div></div>
          <div className="control-row"><button type="button" className="control-button start-button" disabled={busy || !adventure || adventure.status === "active" || adventure.status === "ended"} onClick={() => void action("/api/adventure/start")}><span className="play-triangle" /> {adventure?.status === "paused" ? "Resume adventure" : "Start adventure"}</button><button type="button" className="control-button" disabled={busy || adventure?.status !== "active" && adventure?.status !== "paused"} onClick={() => void action(adventure?.status === "paused" ? "/api/adventure/resume" : "/api/adventure/pause")}>{adventure?.status === "paused" ? "▶ Resume" : "Ⅱ Pause"}</button><button type="button" className="control-button" disabled={busy || !adventure || adventure.status === "idle" || adventure.status === "ended"} onClick={() => void action("/api/adventure/end")}><span className="stop-square" /> End</button><span className="control-hint">{busy ? "Saving…" : "Local preview controls"}</span></div>
          {adventure?.status === "active" && <section className="panel vote-panel"><div className="panel-heading"><div><div className="panel-kicker">VIEWER VOTING · LOCAL PREVIEW</div><h2>Choose the next path</h2></div><span>{totalVotes} votes</span></div>{adventure.choices.map(choice => <button className="vote-choice" key={choice.id} type="button" disabled={busy} onClick={() => void action("/api/adventure/vote", { choiceId: choice.id })}><span>{choice.label}</span><b>{choice.votes}</b></button>)}</section>}
          </div>
          <div className="right-column"><div className="panel twitch-panel"><div className="panel-heading compact-heading"><div><div className="panel-kicker">CHANNEL STATUS</div><h2>Live connection</h2></div><span className="status-icon"><Radio size={16} /></span></div><div className="channel-empty"><div className="channel-orb"><Radio size={19} /></div><b>No channel connected</b><p>Twitch requires registered app credentials and completed OAuth.</p></div><div className="channel-footer"><span className="secure-label"><ShieldCheck size={13} /> TOKENS STAY SERVER-SIDE</span><span className="footer-separator" /><span className="mini-state"><i /> DISCONNECTED</span></div></div><div className="panel activity-panel"><div className="panel-heading compact-heading"><div><div className="panel-kicker">COMMUNITY PULSE</div><h2>Recent activity</h2></div><button className="more-button" type="button" aria-label="Refresh activity" onClick={() => void refreshAdventure()}><span /><span /><span /></button></div><div className="activity-empty"><div className="empty-lines"><span /><span /><span /></div><div><b>{totalVotes ? `${totalVotes} local votes recorded` : "All quiet for now"}</b><p>{totalVotes ? "Preview votes update the story state." : "Start your preview to enable votes."}</p></div><Check size={16} /></div><div className="activity-footer"><span className="connection-dot" /> {socketState === "connected" ? "REALTIME CHANNEL READY" : "WAITING FOR SERVER"}<span className="activity-time">{checkedAt ? `CHECKED ${checkedAt}` : ""}</span></div></div></div></section>
        </> : page === "Broadcast overlay" ? <Overlay adventure={adventure} /> : page === "Leaderboard" ? <Leaderboard adventure={adventure} /> : <section className="panel library-panel"><div className="panel-heading"><div><div className="panel-kicker">LOCAL STORY LIBRARY</div><h2>Adventure previews</h2></div><button className="primary-button" type="button" disabled={busy} onClick={() => void action("/api/adventure/create")}>＋ New preview</button></div><article className="library-story"><BookOpen size={18} /><div><b>{adventure?.title ?? "Loading…"}</b><p>{adventure?.chapter} · {adventure?.status}</p></div><button type="button" className="control-button" onClick={() => setPage("Studio")}>Open in studio</button></article>{history.filter(item => item.id !== adventure?.id).map(item => <article className="library-story" key={item.id}><Check size={18} /><div><b>{item.title}</b><p>{item.chapter} · completed local preview</p></div><button type="button" className="control-button" onClick={() => setPage("Studio")}>Open in studio</button></article>)}</section>}
        <footer className="page-footer"><span>CHATQUEST AI <span className="footer-version">LOCAL PREVIEW</span></span><span>YOUR CHAT. YOUR CHOICES. YOUR ADVENTURE.</span><span>PHASE 2 <span className="footer-build">LOCAL STORY</span></span></footer>
      </div>
    </main>
  </div>;
}

function Overlay({ adventure }: { adventure: Adventure | null }) {
  return <section className="overlay-preview" aria-label="OBS browser source preview"><span className="overlay-brand"><Sparkles size={15} /> CHATQUEST AI · LOCAL PREVIEW</span><h2>{adventure?.title ?? "Waiting for adventure"}</h2><p className="overlay-chapter">{adventure?.chapter}</p><p>{adventure?.scene ?? "Connect to the local server to load the story."}</p><div className="overlay-state">STATE: {adventure?.status.toUpperCase() ?? "LOADING"}</div><h3>Community choice {adventure?.status === "active" ? "· Voting open" : "· Voting closed"}</h3>{adventure?.choices.map(choice => { const votes = adventure.choices.reduce((sum, item) => sum + item.votes, 0); const percentage = votes ? Math.round(choice.votes / votes * 100) : 0; return <div className="overlay-choice" key={choice.id}><span>{choice.label}</span><b>{choice.votes} · {percentage}%</b><i style={{ width: `${percentage}%` }} /></div> })}</section>;
}

function Leaderboard({ adventure }: { adventure: Adventure | null }) {
  return <section className="panel library-panel"><div className="panel-heading"><div><div className="panel-kicker">COMMUNITY VOTE TOTALS</div><h2>Leaderboard</h2></div><span className="quiet-button">LOCAL PREVIEW</span></div><p className="leaderboard-note">Votes are anonymous preview interactions. Twitch viewer identities require EventSub integration.</p>{adventure?.choices.slice().sort((a, b) => b.votes - a.votes).map((choice, index) => <article className="library-story" key={choice.id}><Crown size={18} /><div><b>{index + 1}. {choice.label}</b><p>{choice.votes} votes</p></div></article>)}</section>;
}

function pageFromHash(hash: string): Page {
  if (hash === "#overlay") return "Broadcast overlay";
  if (hash === "#stories") return "Story library";
  if (hash === "#leaderboard") return "Leaderboard";
  return "Studio";
}

function Metric({ icon, label, value, note, accent }: { icon: React.ReactNode; label: string; value: string; note: string; accent: string }) { return <div className={`metric-card metric-${accent}`}><div className="metric-top"><span className="metric-icon">{icon}</span><span className="metric-label">{label}</span><span className="metric-indicator" /></div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></div>; }

export default App;
