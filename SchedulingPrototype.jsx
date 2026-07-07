import { useState, useMemo } from "react";

// ---------------------------------------------------------------
// Multi-Skill Scheduling Prototype
// Three screens: Settings (tech shifts), Calendar (dispatcher view),
// Booking (customer-facing with auditable availability)
// Part II: unassigned jobs hold pool capacity + dispatcher warnings
// Part III: simple natural-language assistant with clarification
// ---------------------------------------------------------------

const SKILLS = ["Plumbing", "HVAC", "Electrical", "Drains", "Roofing"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 10 }, (_, i) => i + 8); // 8am - 5pm start times

const fmtHour = (h) => {
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h > 12 ? h - 12 : h;
  return `${hr} ${ampm}`;
};

const initialTechs = [
  {
    id: 1, name: "Mike Torres", skills: ["HVAC", "Electrical"],
    days: ["Mon", "Tue", "Wed", "Thu", "Fri"], start: 8, end: 17,
    breaks: [{ day: "all", start: 12, end: 13 }],
  },
  {
    id: 2, name: "Janet Kim", skills: ["Plumbing", "Drains"],
    days: ["Mon", "Tue", "Wed", "Thu", "Fri"], start: 9, end: 18,
    breaks: [{ day: "all", start: 13, end: 14 }],
  },
  {
    id: 3, name: "Dave Okafor", skills: ["HVAC"],
    days: ["Mon", "Wed", "Fri"], start: 8, end: 14,
    breaks: [],
  },
  {
    id: 4, name: "Sara Whitfield", skills: ["Roofing", "Drains"],
    days: ["Tue", "Thu", "Sat"], start: 8, end: 16,
    breaks: [{ day: "all", start: 12, end: 12.5 }],
  },
];

const initialAppointments = [
  { id: 1, techId: 1, day: "Mon", start: 9, end: 11, service: "HVAC", customer: "Hendersons" },
  { id: 2, techId: 1, day: "Tue", start: 14, end: 16, service: "Electrical", customer: "Patel" },
  { id: 3, techId: 3, day: "Mon", start: 8, end: 10, service: "HVAC", customer: "Ruiz" },
  { id: 4, techId: 2, day: "Wed", start: 10, end: 12, service: "Plumbing", customer: "Larsen" },
  { id: 5, techId: 1, day: "Wed", start: 8, end: 12, service: "HVAC", customer: "Brooks" },
  // Part II: unassigned jobs (techId: null)
  { id: 6, techId: null, day: "Mon", start: 14, end: 16, service: "HVAC", customer: "Nguyen (unassigned)" },
];

// ------------------- Availability Engine -------------------
// A slot is available for a service if >= 1 tech: has skill, on shift,
// not on break, no appointment. Unassigned jobs consume one qualified
// tech-slot from the pool (they hold capacity without a name on them).

function getTechStatusAt(tech, day, hour, appointments) {
  if (!tech.days.includes(day)) return { free: false, reason: `off on ${day}s` };
  if (hour < tech.start || hour + 1 > tech.end) return { free: false, reason: "outside shift hours" };
  const onBreak = tech.breaks.some(
    (b) => (b.day === "all" || b.day === day) && hour < b.end && hour + 1 > b.start
  );
  if (onBreak) return { free: false, reason: "on break" };
  const appt = appointments.find(
    (a) => a.techId === tech.id && a.day === day && hour < a.end && hour + 1 > a.start
  );
  if (appt) return { free: false, reason: `booked (${appt.service} – ${appt.customer})` };
  return { free: true, reason: "on shift, no conflicts" };
}

function evaluateSlot(service, day, hour, techs, appointments) {
  const qualified = techs.filter((t) => t.skills.includes(service));
  const details = qualified.map((t) => ({
    tech: t,
    status: getTechStatusAt(t, day, hour, appointments),
  }));
  let freeTechs = details.filter((d) => d.status.free);

  // Part II: unassigned jobs for this service overlapping this hour
  // reduce pool capacity by one qualified free tech each.
  const unassignedOverlap = appointments.filter(
    (a) => a.techId === null && a.service === service && a.day === day && hour < a.end && hour + 1 > a.start
  );
  const heldCount = Math.min(unassignedOverlap.length, freeTechs.length);
  const effectiveFree = freeTechs.length - unassignedOverlap.length;

  let explanation;
  if (qualified.length === 0) {
    explanation = `No technicians are certified for ${service}.`;
  } else if (effectiveFree > 0) {
    const names = freeTechs.slice(heldCount).map((d) => d.tech.name).join(", ");
    explanation = `Available — ${names} ${effectiveFree === 1 ? "is" : "are"} ${service}-certified and free.`;
    if (heldCount > 0) explanation += ` (${heldCount} unassigned ${service} job${heldCount > 1 ? "s" : ""} holding capacity.)`;
  } else {
    const reasons = details.map((d) => `${d.tech.name} is ${d.status.reason}`).join("; ");
    explanation = freeTechs.length > 0 && unassignedOverlap.length >= freeTechs.length
      ? `Not available — remaining ${service} capacity is held by ${unassignedOverlap.length} unassigned job(s). (${reasons})`
      : `Not available — ${reasons}.`;
  }

  return { available: effectiveFree > 0, explanation, qualified: qualified.length, details };
}

function nextFiveSlots(service, techs, appointments) {
  const results = [];
  for (const day of DAYS) {
    for (const hour of HOURS) {
      const evalResult = evaluateSlot(service, day, hour, techs, appointments);
      results.push({ day, hour, ...evalResult });
      // collect until we have 5 available, but keep unavailable ones for audit view
    }
  }
  const available = results.filter((r) => r.available).slice(0, 5);
  return { available, all: results };
}

// ------------------- UI -------------------

const S = {
  page: { fontFamily: "'Segoe UI', system-ui, sans-serif", background: "#f5f6f8", minHeight: "100vh", color: "#1a2233" },
  header: { background: "#12325c", color: "#fff", padding: "14px 28px", display: "flex", alignItems: "center", gap: 24 },
  logo: { fontWeight: 700, fontSize: 17, letterSpacing: 0.3 },
  tab: (active) => ({
    padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontSize: 14,
    background: active ? "rgba(255,255,255,0.16)" : "transparent",
    fontWeight: active ? 600 : 400, border: "none", color: "#fff",
  }),
  card: { background: "#fff", borderRadius: 10, padding: 20, boxShadow: "0 1px 3px rgba(20,30,60,0.08)", marginBottom: 18 },
  h2: { fontSize: 17, fontWeight: 650, margin: "0 0 4px" },
  sub: { fontSize: 13, color: "#5a6a85", margin: "0 0 16px" },
  chip: (on) => ({
    padding: "3px 10px", borderRadius: 20, fontSize: 12, cursor: "pointer", border: "1px solid",
    borderColor: on ? "#12325c" : "#c9d2e0", background: on ? "#12325c" : "#fff", color: on ? "#fff" : "#42506b",
  }),
  input: { padding: "6px 8px", border: "1px solid #c9d2e0", borderRadius: 6, fontSize: 13, width: 70 },
  slotCard: (ok) => ({
    border: `1px solid ${ok ? "#b4dcc3" : "#e5c8c8"}`, background: ok ? "#f2faf5" : "#fbf3f3",
    borderRadius: 8, padding: "12px 14px", marginBottom: 8,
  }),
  badge: (color, bg) => ({ fontSize: 11, fontWeight: 700, color, background: bg, borderRadius: 4, padding: "2px 7px", letterSpacing: 0.4 }),
  cell: { border: "1px solid #e3e8f0", height: 34, fontSize: 10.5, textAlign: "center", verticalAlign: "middle", minWidth: 74 },
};

export default function SchedulingPrototype() {
  const [tab, setTab] = useState("booking");
  const [techs, setTechs] = useState(initialTechs);
  const [appointments, setAppointments] = useState(initialAppointments);
  const [service, setService] = useState("HVAC");
  const [showAudit, setShowAudit] = useState(false);
  const [calDay, setCalDay] = useState("Mon");
  const [aiInput, setAiInput] = useState("");
  const [aiLog, setAiLog] = useState([]);

  const { available, all } = useMemo(
    () => nextFiveSlots(service, techs, appointments),
    [service, techs, appointments]
  );

  const bookSlot = (slot) => {
    // Assign to the first effectively-free qualified tech
    const evalResult = evaluateSlot(service, slot.day, slot.hour, techs, appointments);
    const unassignedHolds = appointments.filter(
      (a) => a.techId === null && a.service === service && a.day === slot.day && slot.hour < a.end && slot.hour + 1 > a.start
    ).length;
    const freeDetails = evalResult.details.filter((d) => d.status.free);
    const target = freeDetails[unassignedHolds]; // skip techs held by unassigned jobs
    if (!target) return;
    setAppointments((prev) => [
      ...prev,
      { id: Date.now(), techId: target.tech.id, day: slot.day, start: slot.hour, end: slot.hour + 1, service, customer: "New booking" },
    ]);
  };

  const updateTech = (id, patch) => setTechs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  // Part III: tiny NL parser with clarification behavior
  const runAssistant = () => {
    const text = aiInput.trim().toLowerCase();
    if (!text) return;
    let response;
    const dayMatch = DAYS.find((d) => text.includes(d.toLowerCase())) ||
      (text.includes("tuesday") ? "Tue" : text.includes("monday") ? "Mon" : text.includes("wednesday") ? "Wed" : text.includes("thursday") ? "Thu" : text.includes("friday") ? "Fri" : text.includes("saturday") ? "Sat" : null);
    const tech = techs.find((t) => text.includes(t.name.split(" ")[0].toLowerCase()));
    const skill = SKILLS.find((s) => text.includes(s.toLowerCase()));

    if (!tech) {
      response = { type: "clarify", msg: "Which technician are you referring to? I couldn't match a name. (Underspecified asks trigger a clarifying question, never a guess.)" };
    } else if ((text.includes("out") || text.includes("off")) && dayMatch) {
      const preview = `${tech.name} will be removed from ${dayMatch} shifts.`;
      updateTech(tech.id, { days: tech.days.filter((d) => d !== dayMatch) });
      response = { type: "applied", msg: `Applied: ${preview} Booking availability recalculated.` };
    } else if ((text.includes("certif") || text.includes("finished") || text.includes("qualified")) && skill) {
      updateTech(tech.id, { skills: [...new Set([...tech.skills, skill])] });
      response = { type: "applied", msg: `Applied: ${tech.name} is now ${skill}-certified and will appear in ${skill} availability.` };
    } else if (text.includes("fire") || text.includes("delete")) {
      response = { type: "refused", msg: "Not every ask is possible via the assistant — removing a technician requires a manager action in Settings. (Destructive changes are out of scope by design.)" };
    } else {
      response = { type: "clarify", msg: `I matched "${tech.name}" but couldn't determine the change. Try: "${tech.name.split(" ")[0]} is out on Tuesdays" or "${tech.name.split(" ")[0]} finished her HVAC certification".` };
    }
    setAiLog((prev) => [{ input: aiInput, ...response }, ...prev]);
    setAiInput("");
  };

  const unassignedJobs = appointments.filter((a) => a.techId === null);

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.logo}>HomeServe Scheduling</div>
        <button style={S.tab(tab === "settings")} onClick={() => setTab("settings")}>Settings: Shifts</button>
        <button style={S.tab(tab === "calendar")} onClick={() => setTab("calendar")}>Calendar: Dispatch</button>
        <button style={S.tab(tab === "booking")} onClick={() => setTab("booking")}>Booking Page</button>
        <button style={S.tab(tab === "assistant")} onClick={() => setTab("assistant")}>AI Assistant</button>
      </div>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "24px 20px" }}>

        {/* Part II warning banner for dispatcher */}
        {unassignedJobs.length > 0 && tab !== "booking" && (
          <div style={{ ...S.card, borderLeft: "4px solid #c77c00", background: "#fdf7ec" }}>
            <strong style={{ fontSize: 13 }}>⚠ {unassignedJobs.length} unassigned job(s) holding capacity:</strong>
            <span style={{ fontSize: 13, color: "#5a6a85" }}>{" "}
              {unassignedJobs.map((j) => `${j.service} ${j.day} ${fmtHour(j.start)}–${fmtHour(j.end)} (${j.customer})`).join("; ")}.
              These reduce bookable {" "}slots for their service type until assigned.
            </span>
          </div>
        )}

        {/* ---------------- SETTINGS ---------------- */}
        {tab === "settings" && (
          <div style={S.card}>
            <h2 style={S.h2}>Technician Shifts & Skills</h2>
            <p style={S.sub}>Configure working days, hours, breaks, and certifications. Changes flow directly into booking availability.</p>
            {techs.map((t) => (
              <div key={t.id} style={{ borderTop: "1px solid #edf0f5", padding: "14px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <strong style={{ width: 130, fontSize: 14 }}>{t.name}</strong>
                  <span style={{ fontSize: 12, color: "#5a6a85" }}>Shift:</span>
                  <input style={S.input} type="number" min={6} max={12} value={t.start}
                    onChange={(e) => updateTech(t.id, { start: +e.target.value })} />
                  <span style={{ fontSize: 12 }}>to</span>
                  <input style={S.input} type="number" min={12} max={20} value={t.end}
                    onChange={(e) => updateTech(t.id, { end: +e.target.value })} />
                  <span style={{ fontSize: 12, color: "#5a6a85" }}>
                    {t.breaks.length ? `Break: ${fmtHour(t.breaks[0].start)}–${fmtHour(t.breaks[0].end)}` : "No breaks"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {DAYS.map((d) => (
                    <button key={d} style={S.chip(t.days.includes(d))}
                      onClick={() => updateTech(t.id, { days: t.days.includes(d) ? t.days.filter((x) => x !== d) : [...t.days, d] })}>
                      {d}
                    </button>
                  ))}
                  <span style={{ width: 14 }} />
                  {SKILLS.map((s) => (
                    <button key={s} style={S.chip(t.skills.includes(s))}
                      onClick={() => updateTech(t.id, { skills: t.skills.includes(s) ? t.skills.filter((x) => x !== s) : [...t.skills, s] })}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ---------------- CALENDAR ---------------- */}
        {tab === "calendar" && (
          <div style={S.card}>
            <h2 style={S.h2}>Dispatcher Calendar</h2>
            <p style={S.sub}>Hourly view per technician. Green = open capacity, blue = booked, gray = off/break. Filter by service to see who's qualified.</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {DAYS.map((d) => (
                <button key={d} style={S.chip(calDay === d)} onClick={() => setCalDay(d)}>{d}</button>
              ))}
              <span style={{ width: 20 }} />
              {SKILLS.map((s) => (
                <button key={s} style={S.chip(service === s)} onClick={() => setService(s)}>{s}</button>
              ))}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ ...S.cell, background: "#f0f3f8", fontSize: 12, padding: "0 8px" }}>Technician</th>
                    {HOURS.map((h) => (
                      <th key={h} style={{ ...S.cell, background: "#f0f3f8", fontSize: 11 }}>{fmtHour(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {techs.map((t) => {
                    const qualified = t.skills.includes(service);
                    return (
                      <tr key={t.id} style={{ opacity: qualified ? 1 : 0.38 }}>
                        <td style={{ ...S.cell, textAlign: "left", padding: "0 8px", fontSize: 12, fontWeight: 600 }}>
                          {t.name}
                          <div style={{ fontWeight: 400, fontSize: 10, color: "#5a6a85" }}>
                            {t.skills.join(", ")}{!qualified && ` — not ${service}-certified`}
                          </div>
                        </td>
                        {HOURS.map((h) => {
                          const st = getTechStatusAt(t, calDay, h, appointments);
                          const booked = st.reason.startsWith("booked");
                          const bg = st.free ? "#e8f6ed" : booked ? "#dbe7fa" : "#f0f1f4";
                          const label = st.free ? "open" : booked ? st.reason.match(/\((\w+)/)?.[1] || "busy" : st.reason === "on break" ? "break" : "off";
                          return <td key={h} style={{ ...S.cell, background: bg, color: "#42506b" }}>{label}</td>;
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---------------- BOOKING ---------------- */}
        {tab === "booking" && (
          <>
            <div style={S.card}>
              <h2 style={S.h2}>Book a Service Visit</h2>
              <p style={S.sub}>Choose a service and pick from the next 5 available times. Availability accounts for technician shifts, skills, breaks, existing bookings, and unassigned jobs holding capacity.</p>
              <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
                {SKILLS.map((s) => (
                  <button key={s} style={S.chip(service === s)} onClick={() => setService(s)}>{s}</button>
                ))}
              </div>

              {available.length === 0 && (
                <div style={S.slotCard(false)}>
                  <strong style={{ fontSize: 14 }}>No available slots this week for {service}.</strong>
                  <div style={{ fontSize: 12.5, color: "#5a6a85", marginTop: 4 }}>Toggle the audit view below to see why each window is blocked.</div>
                </div>
              )}

              {available.map((slot, i) => (
                <div key={i} style={S.slotCard(true)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <strong style={{ fontSize: 14.5 }}>{slot.day} {fmtHour(slot.hour)} – {fmtHour(slot.hour + 1)}</strong>
                      <div style={{ fontSize: 12.5, color: "#3e6b50", marginTop: 3 }}>{slot.explanation}</div>
                    </div>
                    <button
                      onClick={() => bookSlot(slot)}
                      style={{ background: "#12325c", color: "#fff", border: "none", borderRadius: 6, padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      Book this slot
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h2 style={S.h2}>Availability audit</h2>
                  <p style={{ ...S.sub, margin: 0 }}>Every hour this week, with the exact reason it is or isn't bookable for {service}.</p>
                </div>
                <button onClick={() => setShowAudit(!showAudit)}
                  style={{ background: "#fff", border: "1px solid #c9d2e0", borderRadius: 6, padding: "7px 14px", fontSize: 13, cursor: "pointer" }}>
                  {showAudit ? "Hide" : "Show"} full audit
                </button>
              </div>
              {showAudit && (
                <div style={{ marginTop: 14, maxHeight: 380, overflowY: "auto" }}>
                  {all.map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, padding: "6px 4px", borderTop: "1px solid #f0f2f6", fontSize: 12.5, alignItems: "baseline" }}>
                      <span style={{ width: 92, fontWeight: 600, flexShrink: 0 }}>{r.day} {fmtHour(r.hour)}</span>
                      <span style={r.available ? S.badge("#1e7a41", "#e2f4e8") : S.badge("#a13333", "#fae7e7")}>
                        {r.available ? "OPEN" : "BLOCKED"}
                      </span>
                      <span style={{ color: "#5a6a85" }}>{r.explanation}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ---------------- AI ASSISTANT (Part III stretch) ---------------- */}
        {tab === "assistant" && (
          <div style={S.card}>
            <h2 style={S.h2}>Scheduling Assistant</h2>
            <p style={S.sub}>
              Dispatchers describe changes in plain language. Recognized asks apply immediately and recalculate availability.
              Underspecified asks get a clarifying question. Destructive asks are refused by design.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runAssistant()}
                placeholder={'Try: "Dave is out on Mondays" or "Janet finished her HVAC certification"'}
                style={{ ...S.input, width: "100%", padding: "10px 12px", fontSize: 14 }}
              />
              <button onClick={runAssistant}
                style={{ background: "#12325c", color: "#fff", border: "none", borderRadius: 6, padding: "0 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Run
              </button>
            </div>
            <div style={{ marginTop: 16 }}>
              {aiLog.map((l, i) => (
                <div key={i} style={{ borderTop: "1px solid #f0f2f6", padding: "10px 2px", fontSize: 13 }}>
                  <div style={{ color: "#5a6a85" }}>You: "{l.input}"</div>
                  <div style={{ marginTop: 4 }}>
                    <span style={
                      l.type === "applied" ? S.badge("#1e7a41", "#e2f4e8")
                        : l.type === "refused" ? S.badge("#a13333", "#fae7e7")
                        : S.badge("#8a6200", "#fbf2da")
                    }>
                      {l.type.toUpperCase()}
                    </span>{" "}
                    {l.msg}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
