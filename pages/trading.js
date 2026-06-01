import { useState } from "react";

const NOTION_TOKEN = "ntn_J580615544116crlsXr6Rl6UJLsFshQbJIGBf1A17K94Eo";
const DB = {
  obiettivi: "37015a12e6b180289775e128bdd3b66f",
  settimane: "37015a12e6b180989836f363959efdeb",
  sessioni: "37015a12e6b1809b8767fd1e7312f459",
  tracker: "37015a12e6b180c885a5d7a4a28c007e",
  setupEvitati: "37015a12e6b1806c8376e0f66da9a029",
};

const C = {
  bg: "#0d0f14", surface: "#13161e", card: "#181c26", border: "#1e2433",
  accent: "#c8a96e", accentDim: "#8a6e3e", red: "#d64c4c", green: "#4caf80",
  yellow: "#d4a843", text: "#e8e4dc", muted: "#7a8099", dim: "#4a5068",
  blue: "#4c9fd6",
};

const AVOID_SETUPS = [
  { id: 1, icon: "🔴", label: "Trade dopo loss nella stessa sessione" },
  { id: 2, icon: "🔄", label: "Cambio bias durante la sessione" },
  { id: 3, icon: "📉", label: "M5 non allineato con H1" },
  { id: 4, icon: "🚫", label: "Oltre 3 loss nella settimana" },
  { id: 5, icon: "⚠️", label: "Setup B o inferiore" },
  { id: 6, icon: "🎯", label: "Trade forzato vicino al target %" },
  { id: 7, icon: "💸", label: "Posizione per recuperare loss" },
  { id: 8, icon: "👁️", label: "Chiarezza H1 sotto 8/10" },
  { id: 9, icon: "⏳", label: "Candela H1 non chiusa" },
  { id: 10, icon: "🧠", label: "Trade mosso da rivalsa emotiva" },
];

async function notionRequest(endpoint, method = "GET", body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`/api/notion?path=${endpoint}`, opts);
  return res.json();
}

async function saveSessionToNotion(data) {
  const today = new Date().toISOString().split("T")[0];
  const sessionName = `${today} — ${data.sessione}`;
  return notionRequest("pages", "POST", {
    parent: { database_id: DB.sessioni },
    properties: {
      "Name": { title: [{ text: { content: sessionName } }] },
      "Sessione": { select: { name: data.sessione } },
      "Data": { date: { start: today } },
      "Decision Quality Score": { number: data.dqs },
      "Calma pre-trade": { number: data.calma },
      "Chiarezza H1": { number: data.chiarezza },
      "Fretta pre-trade": { number: data.fretta },
      "Loss sessione": { number: data.loss },
      "Risultato %": { number: data.risultato || 0 },
      "Rivalsa presente": { checkbox: data.rivalsa },
      "Prova di identità": { rich_text: [{ text: { content: data.provaIdentita || "" } }] },
      "Note libere": { rich_text: [{ text: { content: data.note || "" } }] },
    },
  });
}

async function saveTrackerToNotion(data) {
  const today = new Date().toISOString().split("T")[0];
  return notionRequest("pages", "POST", {
    parent: { database_id: DB.tracker },
    properties: {
      "Name": { title: [{ text: { content: today } }] },
      "Lucidità generale": { number: data.lucidita },
      "Livello di rivalsa": { number: data.rivalsa },
      "Nota psicologica": { rich_text: [{ text: { content: data.nota || "" } }] },
      "Segnale da monitorare": { rich_text: [{ text: { content: data.segnale || "" } }] },
    },
  });
}

async function saveSetupEvitato(setup) {
  return notionRequest("pages", "POST", {
    parent: { database_id: DB.setupEvitati },
    properties: {
      "Name": { title: [{ text: { content: setup.label } }] },
      "Data": { date: { start: new Date().toISOString().split("T")[0] } },
      "Tipo di setup evitato": { multi_select: [{ name: setup.icon + " " + setup.label.substring(0, 20) }] },
    },
  });
}

function getWeekNumber() {
  const d = new Date();
  const startOfYear = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
}

const initSession = () => ({
  calma: 5, chiarezza: 5, fretta: 5, h1: 5,
  seeking: "", ignore: "", trades: "", avoided: [],
  loss: 0, risultato: 0, rivalsa: false, comeGestito: "",
  provaIdentita: "", note: "",
});

const MONTHS = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

export default function App() {
  const today = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  const [tab, setTab] = useState("morning");
  const [weeklyLoss, setWeeklyLoss] = useState(0);
  const [london, setLondon] = useState(initSession());
  const [ny, setNy] = useState(initSession());
  const [tracker, setTracker] = useState({ lucidita: 5, rivalsa: 5, nota: "", segnale: "" });
  const [evening, setEvening] = useState({ wins: "", invisible: "", identity: "", question: "" });
  const [morning, setMorning] = useState({ c1:false,c2:false,c3:false,c4:false,c5:false,c6:false });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState({ london: false, ny: false, evening: false });
  const [toast, setToast] = useState(null);
  const [calendarDays, setCalendarDays] = useState({});

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const dqs = (s) => Math.round((s.calma + s.chiarezza + s.h1) / 3);
  const scoreColor = (v) => v >= 8 ? C.green : v >= 5 ? C.yellow : C.red;
  const rushColor = (v) => v <= 3 ? C.green : v <= 6 ? C.yellow : C.red;
  const updateLondon = (k, v) => setLondon(p => ({ ...p, [k]: v }));
  const updateNy = (k, v) => setNy(p => ({ ...p, [k]: v }));
  const toggleAvoided = (setter, id) => {
    setter(p => ({ ...p, avoided: p.avoided.includes(id) ? p.avoided.filter(x => x !== id) : [...p.avoided, id] }));
  };

  const handleSaveLondon = async () => {
    setSaving(true);
    try {
      await saveSessionToNotion({ ...london, sessione: "🇬🇧 Londra", dqs: dqs(london) });
      for (const id of london.avoided) {
        const s = AVOID_SETUPS.find(x => x.id === id);
        if (s) await saveSetupEvitato(s);
      }
      const todayKey = new Date().toISOString().split("T")[0];
      setCalendarDays(p => ({ ...p, [todayKey]: { ...p[todayKey], london: london.risultato >= 0 ? "green" : "red", londonResult: london.risultato } }));
      setSaved(p => ({ ...p, london: true }));
      showToast("✅ Sessione Londra salvata su Notion!");
    } catch (e) {
      showToast("❌ Errore nel salvataggio", "error");
    }
    setSaving(false);
  };

  const handleSaveNy = async () => {
    setSaving(true);
    try {
      await saveSessionToNotion({ ...ny, sessione: "🇺🇸 New York", dqs: dqs(ny) });
      for (const id of ny.avoided) {
        const s = AVOID_SETUPS.find(x => x.id === id);
        if (s) await saveSetupEvitato(s);
      }
      const todayKey = new Date().toISOString().split("T")[0];
      setCalendarDays(p => ({ ...p, [todayKey]: { ...p[todayKey], ny: ny.risultato >= 0 ? "green" : "red", nyResult: ny.risultato } }));
      setSaved(p => ({ ...p, ny: true }));
      showToast("✅ Sessione NY salvata su Notion!");
    } catch (e) {
      showToast("❌ Errore nel salvataggio", "error");
    }
    setSaving(false);
  };

  const handleSaveEvening = async () => {
    setSaving(true);
    try {
      await saveTrackerToNotion(tracker);
      setSaved(p => ({ ...p, evening: true }));
      showToast("✅ Review serale salvata su Notion!");
    } catch (e) {
      showToast("❌ Errore nel salvataggio", "error");
    }
    setSaving(false);
  };

  const tabs = [
    { id: "morning", label: "🌅 Mattina" },
    { id: "london", label: "🇬🇧 Londra" },
    { id: "ny", label: "🇺🇸 New York" },
    { id: "evening", label: "🌙 Serale" },
    { id: "calendar", label: "📅 Calendario" },
    { id: "rules", label: "📋 Regole" },
  ];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'DM Sans', sans-serif", color: C.text, position: "relative" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&family=Playfair+Display:wght@600&display=swap" rel="stylesheet" />

      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: toast.type === "error" ? C.red : C.green, color: "#fff", padding: "12px 20px", borderRadius: 10, fontFamily: "'DM Mono', monospace", fontSize: 13, boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
          {toast.msg}
        </div>
      )}

      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "20px 24px 14px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: C.accentDim, letterSpacing: 3, textTransform: "uppercase", marginBottom: 4 }}>Daily Trading Protocol · Notion Sync</div>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 600, color: C.text, margin: 0 }}>Trading System</h1>
            <div style={{ marginTop: 3, fontFamily: "'DM Mono', monospace", fontSize: 11, color: C.muted }}>{today.charAt(0).toUpperCase() + today.slice(1)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: C.dim, marginBottom: 4 }}>LOSS SETTIMANA</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Btn onClick={() => setWeeklyLoss(Math.max(0, weeklyLoss - 1))}>−</Btn>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 24, fontWeight: 500, color: weeklyLoss >= 3 ? C.red : weeklyLoss >= 2 ? C.yellow : C.green, minWidth: 20, textAlign: "center" }}>{weeklyLoss}</div>
              <Btn onClick={() => setWeeklyLoss(Math.min(10, weeklyLoss + 1))}>+</Btn>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: C.dim }}>/3</div>
            </div>
            {weeklyLoss >= 3 && <div style={{ marginTop: 4, background: `${C.red}22`, border: `1px solid ${C.red}44`, borderRadius: 6, padding: "3px 8px", fontSize: 10, color: C.red, fontFamily: "'DM Mono', monospace" }}>STOP SETTIMANALE</div>}
          </div>
        </div>
      </div>

      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "0 24px", overflowX: "auto" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ background: "none", border: "none", borderBottom: tab === t.id ? `2px solid ${C.accent}` : "2px solid transparent", color: tab === t.id ? C.accent : C.muted, padding: "11px 14px", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap", fontFamily: "'DM Mono', monospace" }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px" }}>

        {tab === "morning" && (
          <div>
            <SectionTitle icon="🌅" title="Rituale Pre-Mercato" sub="Entro le 07:45 — prima di aprire i grafici" />
            <Card title="INTENZIONE DEL GIORNO">
              <Quote>"Il mio compito oggi non è guadagnare. È eseguire il processo correttamente. Il risultato è una conseguenza, non un obiettivo."</Quote>
            </Card>
            <Card title="CHECKLIST MATTUTINA">
              {[
                { k: "c1", l: "Ho dormito almeno 6 ore" },
                { k: "c2", l: "Ho fatto colazione / sono idratato" },
                { k: "c3", l: "Ho riletto le regole settimanali" },
                { k: "c4", l: "Ho controllato H4/Daily prima dei grafici intraday" },
                { k: "c5", l: "Conosco il bias di DAX, EUR/USD, Gold oggi" },
                { k: "c6", l: "Ho stabilito il mio unico setup prioritario di oggi" },
              ].map(item => (
                <CheckItem key={item.k} label={item.l} checked={morning[item.k]} onChange={v => setMorning(p => ({ ...p, [item.k]: v }))} />
              ))}
            </Card>
            <Card title="ACCETTAZIONE PREVENTIVA">
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Firma mentalmente — tutti questi esiti sono <span style={{ color: C.accent }}>professionali</span>:</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["+5%", "+2%", "+0.5%", "0%", "-1%"].map(r => (
                  <div key={r} style={{ flex: 1, minWidth: 55, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 6px", textAlign: "center", fontFamily: "'DM Mono', monospace", fontSize: 13, color: C.muted }}>{r}</div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {tab === "london" && (
          <div>
            <SectionTitle icon="🇬🇧" title="Sessione Londra" sub="08:00 — 12:00" />
            <DQSBadge score={dqs(london)} />
            <Card title="STATO MENTALE PRE-TRADE">
              <Slider label="Calma" value={london.calma} onChange={v => updateLondon("calma", v)} color={scoreColor(london.calma)} />
              <Slider label="Chiarezza H1" value={london.chiarezza} onChange={v => updateLondon("chiarezza", v)} color={scoreColor(london.chiarezza)} />
              <Slider label="Fretta (basso = meglio)" value={london.fretta} onChange={v => updateLondon("fretta", v)} color={rushColor(london.fretta)} />
              <Slider label="Chiarezza candela H1" value={london.h1} onChange={v => updateLondon("h1", v)} color={scoreColor(london.h1)} />
              <div style={{ marginTop: 14 }}>
                <Label>Sto cercando:</Label>
                <div style={{ display: "flex", gap: 8 }}>
                  {["✅ Opportunità", "🚫 Profitto"].map(opt => (
                    <button key={opt} onClick={() => updateLondon("seeking", opt)} style={{ flex: 1, padding: "9px", background: london.seeking === opt ? (opt.includes("✅") ? `${C.green}25` : `${C.red}25`) : C.surface, border: `1px solid ${london.seeking === opt ? (opt.includes("✅") ? C.green : C.red) : C.border}`, borderRadius: 8, color: C.text, cursor: "pointer", fontSize: 12, fontFamily: "'DM Mono', monospace" }}>{opt}</button>
                  ))}
                </div>
                {london.seeking.includes("Profitto") && <Alert color={C.red}>⚠️ Chiudi la piattaforma. Torna tra 30 minuti.</Alert>}
              </div>
            </Card>
            <Card title="COSA STO IGNORANDO?">
              <TA value={london.ignore} onChange={v => updateLondon("ignore", v)} placeholder={"Almeno 2 obiezioni prima di entrare.\nSe non ne hai → ENTRA."} rows={3} />
            </Card>
            <Card title="POST-SESSIONE">
              <Label>Trade eseguiti</Label>
              <TA value={london.trades} onChange={v => updateLondon("trades", v)} placeholder="Es: DAX A+ long, +1.2R — esecuzione corretta" rows={3} />
              <div style={{ display: "flex", gap: 16, marginTop: 14 }}>
                <div style={{ flex: 1 }}>
                  <Label>Loss sessione</Label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[0, 1].map(n => (
                      <button key={n} onClick={() => updateLondon("loss", n)} style={{ flex: 1, padding: "8px", background: london.loss === n ? (n === 0 ? `${C.green}25` : `${C.red}25`) : C.surface, border: `1px solid ${london.loss === n ? (n === 0 ? C.green : C.red) : C.border}`, borderRadius: 8, color: C.text, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 13 }}>{n}</button>
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <Label>Risultato %</Label>
                  <input type="number" step="0.1" value={london.risultato} onChange={e => updateLondon("risultato", parseFloat(e.target.value) || 0)} style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
              </div>
              <Label style={{ marginTop: 14 }}>Setup evitati ✅</Label>
              <AvoidedTags avoided={london.avoided} onToggle={id => toggleAvoided(setLondon, id)} />
              <Label style={{ marginTop: 14 }}>Rivalsa presente?</Label>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                {["No ✅", "Sì ⚠️"].map(opt => (
                  <button key={opt} onClick={() => updateLondon("rivalsa", opt.includes("Sì"))} style={{ flex: 1, padding: "8px", background: (london.rivalsa && opt.includes("Sì")) || (!london.rivalsa && opt.includes("No")) ? `${opt.includes("No") ? C.green : C.yellow}25` : C.surface, border: `1px solid ${(london.rivalsa && opt.includes("Sì")) || (!london.rivalsa && opt.includes("No")) ? (opt.includes("No") ? C.green : C.yellow) : C.border}`, borderRadius: 8, color: C.text, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{opt}</button>
                ))}
              </div>
              {london.rivalsa && (
                <div style={{ marginBottom: 14 }}>
                  <Label>Come ho gestito</Label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {["✅ Chiuso piattaforma", "⚠️ Resistito", "❌ Ho ceduto"].map(opt => (
                      <button key={opt} onClick={() => updateLondon("comeGestito", opt)} style={{ padding: "6px 12px", background: london.comeGestito === opt ? `${C.accent}25` : C.surface, border: `1px solid ${london.comeGestito === opt ? C.accent : C.border}`, borderRadius: 20, color: C.text, cursor: "pointer", fontSize: 11, fontFamily: "'DM Mono', monospace" }}>{opt}</button>
                    ))}
                  </div>
                </div>
              )}
              <Label>Prova di identità</Label>
              <TA value={london.provaIdentita} onChange={v => updateLondon("provaIdentita", v)} placeholder="Una cosa concreta che dimostra chi stai diventando..." rows={2} />
            </Card>
            <SaveBtn onClick={handleSaveLondon} saving={saving} saved={saved.london} label="SALVA SESSIONE SU NOTION" />
          </div>
        )}

        {tab === "ny" && (
          <div>
            <SectionTitle icon="🇺🇸" title="Sessione New York" sub="14:00 — 18:00" />
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.accentDim}`, borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
              Londra è <strong style={{ color: C.text }}>chiusa</strong>. Sessione indipendente. <strong style={{ color: C.accent }}>Max 1 loss.</strong>
            </div>
            <DQSBadge score={dqs(ny)} />
            <Card title="STATO MENTALE PRE-TRADE">
              <Slider label="Calma" value={ny.calma} onChange={v => updateNy("calma", v)} color={scoreColor(ny.calma)} />
              <Slider label="Chiarezza H1" value={ny.chiarezza} onChange={v => updateNy("chiarezza", v)} color={scoreColor(ny.chiarezza)} />
              <Slider label="Fretta (basso = meglio)" value={ny.fretta} onChange={v => updateNy("fretta", v)} color={rushColor(ny.fretta)} />
              <Slider label="Chiarezza candela H1" value={ny.h1} onChange={v => updateNy("h1", v)} color={scoreColor(ny.h1)} />
            </Card>
            <Card title="COSA STO IGNORANDO?">
              <TA value={ny.ignore} onChange={v => updateNy("ignore", v)} placeholder={"Almeno 2 obiezioni.\nSe non ne hai → ENTRA."} rows={3} />
            </Card>
            <Card title="POST-SESSIONE">
              <Label>Trade eseguiti</Label>
              <TA value={ny.trades} onChange={v => updateNy("trades", v)} placeholder="Setup, esito, note brevi" rows={3} />
              <div style={{ display: "flex", gap: 16, marginTop: 14 }}>
                <div style={{ flex: 1 }}>
                  <Label>Loss sessione</Label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[0, 1].map(n => (
                      <button key={n} onClick={() => updateNy("loss", n)} style={{ flex: 1, padding: "8px", background: ny.loss === n ? (n === 0 ? `${C.green}25` : `${C.red}25`) : C.surface, border: `1px solid ${ny.loss === n ? (n === 0 ? C.green : C.red) : C.border}`, borderRadius: 8, color: C.text, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 13 }}>{n}</button>
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <Label>Risultato %</Label>
                  <input type="number" step="0.1" value={ny.risultato} onChange={e => updateNy("risultato", parseFloat(e.target.value) || 0)} style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
              </div>
              <Label style={{ marginTop: 14 }}>Setup evitati ✅</Label>
              <AvoidedTags avoided={ny.avoided} onToggle={id => toggleAvoided(setNy, id)} />
              <Label style={{ marginTop: 14 }}>Rivalsa presente?</Label>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                {["No ✅", "Sì ⚠️"].map(opt => (
                  <button key={opt} onClick={() => updateNy("rivalsa", opt.includes("Sì"))} style={{ flex: 1, padding: "8px", background: (ny.rivalsa && opt.includes("Sì")) || (!ny.rivalsa && opt.includes("No")) ? `${opt.includes("No") ? C.green : C.yellow}25` : C.surface, border: `1px solid ${(ny.rivalsa && opt.includes("Sì")) || (!ny.rivalsa && opt.includes("No")) ? (opt.includes("No") ? C.green : C.yellow) : C.border}`, borderRadius: 8, color: C.text, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{opt}</button>
                ))}
              </div>
              {ny.rivalsa && (
                <div style={{ marginBottom: 14 }}>
                  <Label>Come ho gestito</Label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {["✅ Chiuso piattaforma", "⚠️ Resistito", "❌ Ho ceduto"].map(opt => (
                      <button key={opt} onClick={() => updateNy("comeGestito", opt)} style={{ padding: "6px 12px", background: ny.comeGestito === opt ? `${C.accent}25` : C.surface, border: `1px solid ${ny.comeGestito === opt ? C.accent : C.border}`, borderRadius: 20, color: C.text, cursor: "pointer", fontSize: 11, fontFamily: "'DM Mono', monospace" }}>{opt}</button>
                    ))}
                  </div>
                </div>
              )}
              <Label>Prova di identità</Label>
              <TA value={ny.provaIdentita} onChange={v => updateNy("provaIdentita", v)} placeholder="Una cosa concreta che dimostra chi stai diventando..." rows={2} />
            </Card>
            <SaveBtn onClick={handleSaveNy} saving={saving} saved={saved.ny} label="SALVA SESSIONE SU NOTION" />
          </div>
        )}

        {tab === "evening" && (
          <div>
            <SectionTitle icon="🌙" title="Review Serale" sub="Entro le 20:00" />
            <Card title="VITTORIE VISIBILI">
              <TA value={evening.wins} onChange={v => setEvening(p => ({ ...p, wins: v }))} placeholder="Anche una sola esecuzione pulita conta. Scrivila." rows={3} />
            </Card>
            <Card title="VITTORIE INVISIBILI ⭐">
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 10, lineHeight: 1.7 }}>La metrica più importante. Ogni trade evitato è una <span style={{ color: C.accent }}>prova di identità</span>.</div>
              <TA value={evening.invisible} onChange={v => setEvening(p => ({ ...p, invisible: v }))} placeholder={"— Trade dopo la loss ✅\n— Setup senza conferma H1 ✅\n— Cambio bias emotivo ✅"} rows={4} />
            </Card>
            <Card title="TRACKER MENTALE">
              <Slider label="Lucidità generale" value={tracker.lucidita} onChange={v => setTracker(p => ({ ...p, lucidita: v }))} color={scoreColor(tracker.lucidita)} />
              <Slider label="Livello di rivalsa (basso = meglio)" value={tracker.rivalsa} onChange={v => setTracker(p => ({ ...p, rivalsa: v }))} color={tracker.rivalsa <= 3 ? C.green : tracker.rivalsa <= 6 ? C.yellow : C.red} />
              <Label>Nota psicologica</Label>
              <TA value={tracker.nota} onChange={v => setTracker(p => ({ ...p, nota: v }))} placeholder="Osservazione libera sul tuo stato interno oggi..." rows={2} />
              <Label style={{ marginTop: 12 }}>Segnale da monitorare domani</Label>
              <TA value={tracker.segnale} onChange={v => setTracker(p => ({ ...p, segnale: v }))} placeholder="Qualcosa che vuoi osservare nella prossima sessione..." rows={2} />
            </Card>
            <Card title="DOMANDA FINALE">
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, color: C.text, lineHeight: 1.8, fontStyle: "italic", marginBottom: 12 }}>
                "Quella sensazione di rivalsa dopo l'errore di oggi — era contro il mercato, o stava dicendo che non ero abbastanza?"
              </div>
              <TA value={evening.question} onChange={v => setEvening(p => ({ ...p, question: v }))} placeholder="Risposta onesta..." rows={3} />
            </Card>
            <SaveBtn onClick={handleSaveEvening} saving={saving} saved={saved.evening} label="SALVA REVIEW SU NOTION" />
          </div>
        )}

        {tab === "calendar" && (
          <CalendarView calendarDays={calendarDays} setCalendarDays={setCalendarDays} />
        )}

        {tab === "rules" && (
          <div>
            <SectionTitle icon="📋" title="Regole & Setup da Evitare" sub="Leggi ogni domenica e ogni mattina" />
            <Card title="REGOLE SETTIMANALI ASSOLUTE">
              {["Massimo 3 loss totali nella settimana", "Massimo 1 loss per sessione — poi stop", "Solo setup A+ o B+, validati prima dell'entrata", "Take profit rispettato sempre, senza modifica emotiva", "Nessun trade dopo aver raggiunto il target settimanale"].map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 12, padding: "11px 0", borderBottom: i < 4 ? `1px solid ${C.border}` : "none" }}>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: C.accent, minWidth: 18 }}>0{i + 1}</div>
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>{r}</div>
                </div>
              ))}
            </Card>
            <Card title="SETUP DA NON ESEGUIRE MAI">
              {AVOID_SETUPS.map(s => (
                <div key={s.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 12px", marginBottom: 5, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                  <span style={{ fontSize: 15 }}>{s.icon}</span>
                  <span style={{ fontSize: 13, color: C.text }}>{s.label}</span>
                </div>
              ))}
            </Card>
            <Card title="LE 3 DOMANDE PRE-TRADE">
              {[
                { q: "Il bias M5 è allineato con H1?", a: "No → non entrare" },
                { q: "Sto cercando un'opportunità o profitto?", a: "Profitto → chiudi la piattaforma" },
                { q: "Cosa sto ignorando in questo setup?", a: "Nessuna obiezione valida → ENTRA" },
              ].map((item, i) => (
                <div key={i} style={{ padding: "12px 0", borderBottom: i < 2 ? `1px solid ${C.border}` : "none" }}>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 500, marginBottom: 4 }}>{i + 1}. {item.q}</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: C.red }}>{item.a}</div>
                </div>
              ))}
            </Card>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.accent}`, borderRadius: 10, padding: "18px 22px" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: C.accentDim, letterSpacing: 2, marginBottom: 8 }}>MANTRA OPERATIVO</div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, color: C.text, lineHeight: 1.9, fontStyle: "italic" }}>
                "Il mio compito è proteggere il +2%, non inseguire il +5%.<br />
                Non ho diritto al target. Ho diritto solo a eseguire bene il prossimo trade."
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CalendarView({ calendarDays, setCalendarDays }) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState(null);
  const [editDay, setEditDay] = useState(null);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const getDateKey = (day) => `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const dayColor = (key) => {
    const d = calendarDays[key];
    if (!d) return null;
    if (d.type === "no-trade") return C.blue;
    if (d.result > 0) return C.green;
    if (d.result < 0) return C.red;
    return C.yellow;
  };

  const weekDays = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };

  const totalResult = Object.entries(calendarDays)
    .filter(([k]) => k.startsWith(`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`))
    .reduce((sum, [, d]) => sum + (d.result || 0), 0);

  const greenDays = Object.entries(calendarDays).filter(([k, d]) => k.startsWith(`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`) && d.result > 0).length;
  const redDays = Object.entries(calendarDays).filter(([k, d]) => k.startsWith(`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`) && d.result < 0).length;
  const noTradeDays = Object.entries(calendarDays).filter(([k, d]) => k.startsWith(`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`) && d.type === "no-trade").length;

  return (
    <div>
      <SectionTitle icon="📅" title="Calendario Mensile" sub="Storico visivo delle sessioni" />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button onClick={prevMonth} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 14 }}>←</button>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: C.text }}>
          {MONTHS[viewMonth]} {viewYear}
        </div>
        <button onClick={nextMonth} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 14 }}>→</button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { color: C.green, label: `${greenDays} verde` },
          { color: C.red, label: `${redDays} rosso` },
          { color: C.blue, label: `${noTradeDays} no trade` },
          { color: totalResult >= 0 ? C.green : C.red, label: `${totalResult >= 0 ? "+" : ""}${totalResult.toFixed(1)}% mese` },
        ].map((s, i) => (
          <div key={i} style={{ background: `${s.color}20`, border: `1px solid ${s.color}44`, borderRadius: 20, padding: "4px 12px", fontFamily: "'DM Mono', monospace", fontSize: 11, color: s.color }}>{s.label}</div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {weekDays.map(d => (
          <div key={d} style={{ textAlign: "center", fontFamily: "'DM Mono', monospace", fontSize: 10, color: C.dim, padding: "6px 0" }}>{d}</div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const key = getDateKey(day);
          const color = dayColor(key);
          const d = calendarDays[key];
          const isToday = key === new Date().toISOString().split("T")[0];
          const isWeekend = [6, 0].includes(new Date(viewYear, viewMonth, day).getDay());

          return (
            <div key={day} onClick={() => setSelectedDay(selectedDay === key ? null : key)}
              style={{ aspectRatio: "1", borderRadius: 8, background: color ? `${color}25` : isWeekend ? C.bg : C.surface, border: `1.5px solid ${color || (isToday ? C.accent : C.border)}`, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", transition: "all 0.15s" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: color || (isWeekend ? C.dim : C.text), fontWeight: isToday ? 700 : 400 }}>{day}</div>
              {d?.result !== undefined && d.type !== "no-trade" && (
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: color, marginTop: 1 }}>
                  {d.result > 0 ? "+" : ""}{d.result.toFixed(1)}%
                </div>
              )}
              {d?.type === "no-trade" && (
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: C.blue, marginTop: 1 }}>NO</div>
              )}
            </div>
          );
        })}
      </div>

      {selectedDay && (
        <div style={{ marginTop: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 20px" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: C.accentDim, letterSpacing: 2, marginBottom: 12 }}>
            {selectedDay} — AGGIUNGI/MODIFICA
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {[
              { label: "🟢 Profitto", type: "profit", color: C.green },
              { label: "🔴 Loss", type: "loss", color: C.red },
              { label: "🔵 No Trade", type: "no-trade", color: C.blue },
              { label: "🟡 Break-even", type: "breakeven", color: C.yellow },
            ].map(opt => (
              <button key={opt.type} onClick={() => {
                const result = opt.type === "profit" ? 1 : opt.type === "loss" ? -1 : 0;
                setCalendarDays(p => ({ ...p, [selectedDay]: { type: opt.type, result } }));
              }} style={{ padding: "8px 14px", background: calendarDays[selectedDay]?.type === opt.type ? `${opt.color}30` : C.surface, border: `1px solid ${calendarDays[selectedDay]?.type === opt.type ? opt.color : C.border}`, borderRadius: 8, color: C.text, cursor: "pointer", fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
                {opt.label}
              </button>
            ))}
          </div>
          {calendarDays[selectedDay]?.type !== "no-trade" && (
            <div>
              <Label>Risultato % preciso</Label>
              <input type="number" step="0.1" placeholder="Es: 2.3" onChange={e => {
                const val = parseFloat(e.target.value) || 0;
                setCalendarDays(p => ({ ...p, [selectedDay]: { ...p[selectedDay], result: val } }));
              }} style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 16, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: C.dim, marginBottom: 8 }}>LEGENDA</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {[
            { color: C.green, label: "Giorno verde (profitto)" },
            { color: C.red, label: "Giorno rosso (loss)" },
            { color: C.blue, label: "No Trade (vittoria invisibile)" },
            { color: C.yellow, label: "Break-even" },
          ].map((l, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: l.color }} />
              <span style={{ fontSize: 11, color: C.muted, fontFamily: "'DM Mono', monospace" }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const MONTHS = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

function SectionTitle({ icon, title, sub }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
        <span style={{ fontSize: 17 }}>{icon}</span>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, color: "#e8e4dc", margin: 0 }}>{title}</h2>
      </div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#4a5068", marginLeft: 26 }}>{sub}</div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{ background: "#181c26", border: "1px solid #1e2433", borderRadius: 12, padding: "18px 20px", marginBottom: 12 }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#8a6e3e", letterSpacing: 2, marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
}

function Label({ children, style }) {
  return <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#7a8099", marginBottom: 7, ...style }}>{children}</div>;
}

function Quote({ children }) {
  return <div style={{ background: "#13161e", border: "1px solid #1e2433", borderLeft: "3px solid #c8a96e", borderRadius: 8, padding: "14px 18px", fontFamily: "'Playfair Display', serif", fontSize: 14, color: "#e8e4dc", lineHeight: 1.8, fontStyle: "italic" }}>{children}</div>;
}

function Alert({ children, color }) {
  return <div style={{ marginTop: 8, padding: "8px 12px", background: `${color}15`, border: `1px solid ${color}33`, borderRadius: 6, fontSize: 12, color, fontFamily: "'DM Mono', monospace" }}>{children}</div>;
}

function DQSBadge({ score }) {
  const color = score >= 8 ? "#4caf80" : score >= 6 ? "#d4a843" : "#d64c4c";
  return (
    <div style={{ padding: "10px 14px", background: `${color}15`, border: `1px solid ${color}44`, borderRadius: 8, marginBottom: 12, fontFamily: "'DM Mono', monospace", fontSize: 12, color, textAlign: "center" }}>
      DECISION QUALITY SCORE: <strong>{score}/10</strong> — {score >= 8 ? "✅ ENTRA" : "🚫 NON TRADARE"}
    </div>
  );
}

function CheckItem({ label, checked, onChange }) {
  return (
    <div onClick={() => onChange(!checked)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #1e2433", cursor: "pointer" }}>
      <div style={{ width: 17, height: 17, borderRadius: 4, border: `1.5px solid ${checked ? "#4caf80" : "#1e2433"}`, background: checked ? "#4caf8025" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {checked && <span style={{ color: "#4caf80", fontSize: 10 }}>✓</span>}
      </div>
      <div style={{ fontSize: 13, color: checked ? "#e8e4dc" : "#7a8099" }}>{label}</div>
    </div>
  );
}

function Slider({ label, value, onChange, color }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#7a8099" }}>{label}</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color, fontWeight: 500 }}>{value}/10</div>
      </div>
      <input type="range" min={1} max={10} value={value} onChange={e => onChange(Number(e.target.value))} style={{ width: "100%", accentColor: color, cursor: "pointer" }} />
    </div>
  );
}

function AvoidedTags({ avoided, onToggle }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 5 }}>
      {AVOID_SETUPS.map(s => (
        <button key={s.id} onClick={() => onToggle(s.id)} style={{ padding: "5px 10px", fontSize: 11, fontFamily: "'DM Mono', monospace", background: avoided.includes(s.id) ? "#4caf8020" : "#13161e", border: `1px solid ${avoided.includes(s.id) ? "#4caf80" : "#1e2433"}`, borderRadius: 20, color: avoided.includes(s.id) ? "#4caf80" : "#7a8099", cursor: "pointer" }}>
          {s.icon} {s.label}
        </button>
      ))}
    </div>
  );
}

function TA({ value, onChange, placeholder, rows }) {
  return (
    <textarea value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows || 3}
      style={{ width: "100%", background: "#13161e", border: "1px solid #1e2433", borderRadius: 8, padding: "10px 12px", color: "#e8e4dc", fontSize: 13, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.7, resize: "vertical", outline: "none", boxSizing: "border-box" }} />
  );
}

function Btn({ onClick, children }) {
  return (
    <button onClick={onClick} style={{ background: "#13161e", border: "1px solid #1e2433", color: "#e8e4dc", width: 26, height: 26, borderRadius: 6, cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</button>
  );
}

function SaveBtn({ onClick, saving, saved, label }) {
  return (
    <button onClick={onClick} disabled={saving} style={{ width: "100%", padding: "14px", background: saved ? "#4caf8020" : "#c8a96e", border: `1px solid ${saved ? "#4caf80" : "#8a6e3e"}`, borderRadius: 10, color: saved ? "#4caf80" : "#0d0f14", fontSize: 13, fontFamily: "'DM Mono', monospace", fontWeight: 500, cursor: saving ? "wait" : "pointer", letterSpacing: 1, marginTop: 4 }}>
      {saving ? "SALVATAGGIO..." : saved ? "✅ SALVATO SU NOTION" : label}
    </button>
  );
}
