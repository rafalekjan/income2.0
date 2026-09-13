const MONTHS = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];

const state = {
  jobs: [],
  entriesYear: new Date().getFullYear(),
  entriesByYear: {},
  b2bFeesByYear: {},
  extraYears: new Set(),
  expensesYear: new Date().getFullYear(),
  expenseTransferCategories: [],
  charts: {},
};

function showToast(text, kind = "ok") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${kind}`;
  toast.textContent = text;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${path} -> ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function fmtMoney(v) {
  return (v ?? 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";
}

function monthActive(job, year, month) {
  const start = new Date(job.start_date);
  const startYM = start.getFullYear() * 12 + start.getMonth();
  const ym = year * 12 + (month - 1);
  if (ym < startYM) return false;
  if (job.end_date) {
    const end = new Date(job.end_date);
    const endYM = end.getFullYear() * 12 + end.getMonth();
    if (ym > endYM) return false;
  }
  return true;
}

function tintClass(idx) {
  return `tint-${idx % 5}`;
}

// Wspólny widget wyboru roku (strzałki + rozwijana lista) używany przez
// zakładki Dochody i Wydatki - identyczny wygląd i zachowanie w obu.
function renderYearNav(idPrefix, years, currentYear) {
  return `
    <div class="year-nav">
      <button type="button" class="year-nav-btn" id="${idPrefix}-year-down" title="Poprzedni rok z listy" ${years.indexOf(currentYear) <= 0 ? "disabled" : ""}>‹</button>
      <select id="${idPrefix}-year" class="year-nav-select">
        ${years.map((y) => `<option value="${y}" ${y === currentYear ? "selected" : ""}>${y}</option>`).join("")}
      </select>
      <button type="button" class="year-nav-btn" id="${idPrefix}-year-up" title="Kolejny rok z listy" ${years.indexOf(currentYear) >= years.length - 1 ? "disabled" : ""}>›</button>
    </div>`;
}

function wireYearNav(idPrefix, years, getCurrentYear, setCurrentYear, onChange) {
  document.getElementById(`${idPrefix}-year`).addEventListener("change", (e) => {
    setCurrentYear(parseInt(e.target.value, 10));
    onChange();
  });
  document.getElementById(`${idPrefix}-year-up`).addEventListener("click", () => {
    const idx = years.indexOf(getCurrentYear());
    if (idx < years.length - 1) { setCurrentYear(years[idx + 1]); onChange(); }
  });
  document.getElementById(`${idPrefix}-year-down`).addEventListener("click", () => {
    const idx = years.indexOf(getCurrentYear());
    if (idx > 0) { setCurrentYear(years[idx - 1]); onChange(); }
  });
}

// Blokada zmiany wartości scrollem myszy nad polem liczbowym (samo ukrycie
// strzałek w CSS nie wystarcza - w Chrome/Edge scroll nad aktywnym polem
// number nadal zmienia wartość).
document.addEventListener("wheel", (ev) => {
  if (document.activeElement === ev.target && ev.target.matches('input[type="number"]')) {
    ev.target.blur();
  }
}, { passive: true });

// ---------- Tabs ----------
function initTabs() {
  document.querySelectorAll("nav button").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tab) {
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${tab}`));
  // Wydatki i Dochody maja szerokie tabele (wiele kolumn - praca/pozycja),
  // wiec te zakladki dostaja szerszy kontener niz reszta aplikacji.
  document.querySelector("main").classList.toggle("wide", tab === "expenses" || tab === "entries");
  // Zawsze wracaj do bieżącego roku przy wejściu na zakładkę - nie pamiętaj
  // ostatnio przeglądanego roku między przełączeniami.
  const now = new Date().getFullYear();
  if (tab === "dashboard") renderDashboard();
  if (tab === "entries") { state.entriesYear = now; renderEntries(); }
  if (tab === "expenses") { state.expensesYear = now; renderExpenses(); }
  if (tab === "settings") { state.settingsYear = now; renderSettings(); }
}

// ---------- Dashboard ----------
async function renderDashboard() {
  const el = document.getElementById("view-dashboard");
  el.innerHTML = `<p class="muted">Ładowanie…</p>`;

  const [summary, series] = await Promise.all([
    api("/api/dashboard/summary"),
    api("/api/dashboard/monthly-series"),
  ]);

  if (summary.length === 0) {
    el.innerHTML = `<div class="card"><p>Brak jeszcze żadnych wpisów. Dodaj pracę w zakładce <b>Prace</b>, a potem uzupełnij dane w zakładce <b>Wpisy</b>.</p></div>`;
    return;
  }

  const totalIncome = summary.reduce((s, y) => s + y.total_real_income, 0);
  const totalExpenses = summary.reduce((s, y) => s + y.total_expenses, 0);
  const latest = summary[summary.length - 1];
  const totalArrears = summary.reduce((s, y) => s + y.unpaid_zus + y.unpaid_pit + y.unpaid_vat, 0);

  el.innerHTML = `
    <div class="grid" style="margin-bottom:16px">
      <div class="stat"><div class="label">Suma ze wszystkich lat</div><div class="value">${fmtMoney(totalIncome)}</div></div>
      <div class="stat"><div class="label">${latest.year} — suma roczna</div><div class="value">${fmtMoney(latest.total_real_income)}</div></div>
      <div class="stat"><div class="label">${latest.year} — średnia miesięczna</div><div class="value">${fmtMoney(latest.avg_monthly_income)}</div><div class="sub">na podstawie ${latest.months_with_data} wypełnionych mies.</div></div>
      <div class="stat"><div class="label">Niezapłacone opłaty B2B (razem)</div><div class="value ${totalArrears > 0 ? "arrears" : "ok-text"}">${fmtMoney(totalArrears)}</div></div>
      <div class="stat"><div class="label">Wydatki — suma ze wszystkich lat</div><div class="value">${fmtMoney(totalExpenses)}</div></div>
      <div class="stat"><div class="label">${latest.year} — wydatki</div><div class="value">${fmtMoney(latest.total_expenses)}</div></div>
    </div>

    <div class="card">
      <h3>Dochód i wydatki roczne (+ średnia miesięczna)</h3>
      <div class="chart-wrap chart-wrap-lg"><canvas id="chart-yearly"></canvas></div>
    </div>
    <div class="card">
      <h3>Trend miesięczny — wszystkie lata</h3>
      <div class="chart-wrap chart-wrap-lg"><canvas id="chart-monthly"></canvas></div>
    </div>

    <div class="card">
      <h3>Podsumowanie roczne</h3>
      <p class="muted">Dochód razem = UoP + przychód B2B + VAT należny (pobrany od klienta razem z fakturą) − ZUS − PIT − VAT faktycznie zapłacony do US.
      Jeśli zapłacisz mniej VAT-u niż pobrałeś (np. dzięki odliczeniom z kosztów), różnica zwiększa dochód. Wydatki pochodzą z osobnej zakładki Wydatki i nie są odejmowane od dochodu na wykresach.</p>
      <table>
        <thead><tr>
          <th>Rok</th><th>Dochód razem</th><th>Śr. miesięczna</th><th>UoP</th><th>B2B przychód</th>
          <th>ZUS</th><th>PIT</th><th>VAT</th><th>Zaległości</th><th>Wydatki</th>
        </tr></thead>
        <tbody>
          ${summary.map((y) => {
            const arrears = y.unpaid_zus + y.unpaid_pit + y.unpaid_vat;
            return `<tr>
              <td>${y.year}</td>
              <td>${fmtMoney(y.total_real_income)}</td>
              <td>${fmtMoney(y.avg_monthly_income)}</td>
              <td>${fmtMoney(y.total_uop)}</td>
              <td>${fmtMoney(y.total_b2b_revenue)}</td>
              <td>${fmtMoney(y.total_zus)}</td>
              <td>${fmtMoney(y.total_pit)}</td>
              <td>${fmtMoney(y.total_vat)}</td>
              <td class="${arrears > 0 ? "arrears" : ""}">${fmtMoney(arrears)}</td>
              <td>${fmtMoney(y.total_expenses)}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  drawYearlyChart(summary);
  drawMonthlyChart(series);
}

function drawYearlyChart(summary) {
  const ctx = document.getElementById("chart-yearly");
  if (state.charts.yearly) state.charts.yearly.destroy();
  state.charts.yearly = new Chart(ctx, {
    type: "line",
    data: {
      labels: summary.map((y) => y.year),
      datasets: [
        {
          label: "Dochód roczny",
          data: summary.map((y) => y.total_real_income),
          borderColor: "#2563eb",
          backgroundColor: "transparent",
          yAxisID: "y",
          tension: 0.25,
        },
        {
          label: "Wydatki roczne",
          data: summary.map((y) => y.total_expenses),
          borderColor: "#dc2626",
          backgroundColor: "transparent",
          yAxisID: "y",
          tension: 0.25,
        },
        {
          label: "Średnia miesięczna",
          data: summary.map((y) => y.avg_monthly_income),
          borderColor: "#16a34a",
          backgroundColor: "transparent",
          borderDash: [5, 4],
          yAxisID: "y1",
          tension: 0.25,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { position: "left", title: { display: true, text: "Dochód / wydatki roczne (zł)" } },
        y1: {
          position: "right",
          title: { display: true, text: "Średnia miesięczna (zł)" },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
}

function drawMonthlyChart(series) {
  const ctx = document.getElementById("chart-monthly");
  if (state.charts.monthly) state.charts.monthly.destroy();
  state.charts.monthly = new Chart(ctx, {
    type: "line",
    data: {
      labels: series.map((p) => `${p.year}-${String(p.month).padStart(2, "0")}`),
      datasets: [
        {
          label: "Dochód razem",
          data: series.map((p) => p.total_real_income),
          borderColor: "#2563eb",
          backgroundColor: "transparent",
          tension: 0.25,
        },
        {
          label: "Wydatki",
          data: series.map((p) => p.expenses_amount),
          borderColor: "#dc2626",
          backgroundColor: "transparent",
          tension: 0.25,
        },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });
}

// ---------- Jobs ----------
async function renderJobs() {
  const el = document.getElementById("settings-jobs-section");
  state.jobs = await api("/api/jobs?include_ended=true");

  el.innerHTML = `
    <div class="card">
      <h2>Prace</h2>
      <table>
        <thead><tr>
          <th>Nazwa</th><th>Typ</th><th>Stawka/h</th><th>Stała kwota/mies.</th><th>VAT</th><th>Start</th><th>Koniec</th><th></th>
        </tr></thead>
        <tbody id="jobs-tbody"></tbody>
      </table>
    </div>

    <div class="card">
      <h3 id="job-form-title">Dodaj pracę</h3>
      <form id="job-form">
        <input type="hidden" id="job-id" />
        <div class="form-row">
          <div class="field"><label>Nazwa</label><input type="text" id="job-name" required /></div>
          <div class="field"><label>Typ</label>
            <select id="job-type">
              <option value="UOP">UoP</option>
              <option value="B2B">B2B</option>
            </select>
          </div>
          <div class="field" id="job-rate-field"><label>Domyślna stawka/h</label><input type="number" step="0.01" id="job-rate" /></div>
          <div class="field" id="job-fixed-net-field"><label>Stała kwota netto/mies. (opcjonalnie)</label><input type="number" step="0.01" id="job-fixed-net" /></div>
          <div class="field" id="job-vat-field">
            <label><input type="checkbox" id="job-vat-payer" /> Płatnik VAT</label>
          </div>
          <div class="field"><label>Data rozpoczęcia</label><input type="date" id="job-start" required /></div>
          <div class="field"><label>Data zakończenia (opcjonalnie)</label><input type="date" id="job-end" /></div>
          <div class="field">
            <button type="submit" class="btn" id="job-save">Zapisz</button>
            <button type="button" class="btn secondary" id="job-cancel-edit" style="display:none">Anuluj edycję</button>
          </div>
        </div>
      </form>
      <p class="muted">Zmiany zapisują się też automatycznie po zmianie pola - przycisk "Zapisz" daje pewność, że na pewno poszły (np. po wyczyszczeniu daty zakończenia).
      Jeśli umowa ma stałą kwotę miesięczną zamiast stawki godzinowej - wpisz ją w "Stała kwota netto/mies.", a we Wpisach godziny i stawka będą nieaktywne, bo nie mają zastosowania.</p>
    </div>
  `;

  const rateField = document.getElementById("job-rate-field");
  const fixedNetField = document.getElementById("job-fixed-net-field");
  const vatField = document.getElementById("job-vat-field");
  const typeSelect = document.getElementById("job-type");
  const toggleB2BFields = () => {
    const isB2B = typeSelect.value === "B2B";
    rateField.style.display = isB2B ? "" : "none";
    fixedNetField.style.display = isB2B ? "" : "none";
    vatField.style.display = isB2B ? "" : "none";
  };
  typeSelect.addEventListener("change", toggleB2BFields);
  toggleB2BFields();

  document.getElementById("job-start").value = new Date().toISOString().slice(0, 10);

  renderJobsTable();

  document.getElementById("job-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    autosaveJob();
  });
  document.getElementById("job-form").addEventListener("change", autosaveJob);
  document.getElementById("job-cancel-edit").addEventListener("click", resetJobForm);
}

async function autosaveJob() {
  const id = document.getElementById("job-id").value;
  const type = document.getElementById("job-type").value;
  const name = document.getElementById("job-name").value.trim();
  const startDate = document.getElementById("job-start").value;

  if (!name || !startDate) return; // za mało danych, żeby cokolwiek zapisać

  const payload = {
    name,
    type,
    default_hourly_rate: type === "B2B" ? (parseFloat(document.getElementById("job-rate").value) || null) : null,
    fixed_monthly_net: type === "B2B" ? (parseFloat(document.getElementById("job-fixed-net").value) || null) : null,
    vat_payer: type === "B2B" ? document.getElementById("job-vat-payer").checked : false,
    start_date: startDate,
    end_date: document.getElementById("job-end").value || null,
  };

  try {
    if (id) {
      await api(`/api/jobs/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      showToast("Zapisano ✓", "ok");
    } else {
      const created = await api("/api/jobs", { method: "POST", body: JSON.stringify(payload) });
      document.getElementById("job-id").value = created.id;
      document.getElementById("job-form-title").textContent = `Edytuj pracę: ${created.name}`;
      document.getElementById("job-cancel-edit").style.display = "";
      showToast("Praca utworzona ✓", "ok");
    }
    state.jobs = await api("/api/jobs?include_ended=true");
    renderJobsTable();
  } catch (err) {
    showToast("Błąd zapisu", "err");
  }
}

function renderJobsTable() {
  const tbody = document.getElementById("jobs-tbody");
  tbody.innerHTML = state.jobs.map((j) => `
    <tr>
      <td>${j.name}</td>
      <td><span class="badge ${j.type.toLowerCase()}">${j.type}</span></td>
      <td>${j.type === "B2B" && j.default_hourly_rate != null ? j.default_hourly_rate + " zł" : "—"}</td>
      <td>${j.type === "B2B" && j.fixed_monthly_net != null ? fmtMoney(j.fixed_monthly_net) : "—"}</td>
      <td>${j.type === "B2B" ? (j.vat_payer ? "tak" : "nie") : "—"}</td>
      <td>${j.start_date}</td>
      <td>${j.end_date ?? '<span class="ok-text">aktywna</span>'}</td>
      <td>
        <button class="btn small secondary" onclick="editJob(${j.id})">Edytuj</button>
        ${j.end_date ? "" : `<button class="btn small" onclick="endJob(${j.id})">Zakończ dziś</button>`}
        <button class="btn small danger" onclick="removeJob(${j.id})">Usuń</button>
      </td>
    </tr>
  `).join("");
}

function editJob(id) {
  const j = state.jobs.find((x) => x.id === id);
  if (!j) return;
  document.getElementById("job-form-title").textContent = `Edytuj pracę: ${j.name}`;
  document.getElementById("job-id").value = j.id;
  document.getElementById("job-name").value = j.name;
  document.getElementById("job-type").value = j.type;
  document.getElementById("job-type").dispatchEvent(new Event("change"));
  document.getElementById("job-rate").value = j.default_hourly_rate ?? "";
  document.getElementById("job-fixed-net").value = j.fixed_monthly_net ?? "";
  document.getElementById("job-vat-payer").checked = !!j.vat_payer;
  document.getElementById("job-start").value = j.start_date;
  document.getElementById("job-end").value = j.end_date ?? "";
  document.getElementById("job-cancel-edit").style.display = "";
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}

function resetJobForm() {
  document.getElementById("job-form-title").textContent = "Dodaj pracę";
  document.getElementById("job-form").reset();
  document.getElementById("job-id").value = "";
  document.getElementById("job-start").value = new Date().toISOString().slice(0, 10);
  document.getElementById("job-cancel-edit").style.display = "none";
  document.getElementById("job-type").dispatchEvent(new Event("change"));
}

async function endJob(id) {
  const today = new Date().toISOString().slice(0, 10);
  await api(`/api/jobs/${id}`, { method: "PUT", body: JSON.stringify({ end_date: today }) });
  await renderJobs();
}

async function removeJob(id) {
  if (!confirm("Usunąć tę pracę wraz ze wszystkimi jej wpisami miesięcznymi?")) return;
  await api(`/api/jobs/${id}`, { method: "DELETE" });
  await renderJobs();
}

// ---------- Entries ----------
async function renderEntries() {
  const el = document.getElementById("view-entries");
  if (state.jobs.length === 0) {
    state.jobs = await api("/api/jobs?include_ended=true");
  }
  const existingYears = await api("/api/entries/years");

  const candidateYears = new Set(existingYears);
  const now = new Date().getFullYear();
  candidateYears.add(now);
  state.extraYears.forEach((y) => candidateYears.add(y));
  state.jobs.forEach((j) => {
    const startY = new Date(j.start_date).getFullYear();
    // Praca bez daty zakończenia jest wciąż aktywna - z góry pokaż też kolejny rok.
    const endY = j.end_date ? new Date(j.end_date).getFullYear() : now + 1;
    for (let y = startY; y <= Math.max(endY, now); y++) candidateYears.add(y);
  });
  candidateYears.add(state.entriesYear);
  const years = [...candidateYears].sort((a, b) => a - b);

  el.innerHTML = `
    <div class="card card-narrow">${renderYearNav("entries", years, state.entriesYear)}</div>
    <div id="entries-jobs"></div>
    <div id="entries-b2b-fees"></div>
    <div class="card card-narrow">
      <h3>Podsumowanie miesięczne — ${state.entriesYear}</h3>
      <p class="muted">UoP + przychód B2B + VAT należny, wg miesiąca pracy/wystawienia faktury (niezależnie kiedy wpłynął przelew),
      minus wspólne ZUS, PIT i VAT faktycznie zapłacony za ten sam miesiąc. Jeśli zapłacisz mniej VAT-u niż pobrałeś, różnica zwiększa dochód.</p>
      <table>
        <thead><tr><th>Miesiąc</th><th>Dochód</th></tr></thead>
        <tbody id="entries-summary-tbody"></tbody>
      </table>
    </div>
  `;

  wireYearNav("entries", years, () => state.entriesYear, (y) => { state.entriesYear = y; }, renderEntries);
  await loadEntriesForYear(state.entriesYear);
}

async function loadEntriesForYear(year) {
  const [entries, fees, settingsThisYear] = await Promise.all([
    api(`/api/entries?year=${year}`),
    api(`/api/b2b-fees?year=${year}`),
    api(`/api/settings/${year}`),
  ]);
  const byJob = {};
  entries.forEach((e) => { (byJob[e.job_id] ??= {})[e.month] = e; });
  state.entriesByYear[year] = byJob;

  const byMonth = {};
  fees.forEach((f) => { byMonth[f.month] = f; });
  state.b2bFeesByYear[year] = byMonth;

  state.vatRateByYear ??= {};
  state.vatRateByYear[year] = settingsThisYear.vat_rate;

  renderEntriesJobs(year, byJob);
  renderB2BFeesCard(year, byMonth);
  updateEntriesSummary(year);
}

function hasInvoicedB2BThisMonth(month, byJob) {
  for (const jobId in byJob) {
    const entry = byJob[jobId][month];
    if (!entry) continue;
    const job = state.jobs.find((j) => j.id === parseInt(jobId, 10));
    if (job?.type === "B2B" && entry.invoiced) return true;
  }
  return false;
}

// Dochód liczy się zawsze do miesiąca pracy/wystawienia faktury - UoP i B2B
// tym samym miesiącem, niezależnie kiedy wpłynął przelew. VAT należny
// (przychód * stawka VAT) liczy się w tym samym miesiącu co przychód, bo
// obowiązek podatkowy powstaje w momencie wystawienia faktury.
function computeReceivedTotals(year, byJob) {
  const totals = {};
  for (let m = 1; m <= 12; m++) totals[m] = { uop: 0, b2b: 0, vatCollected: 0 };
  const vatRate = state.vatRateByYear?.[year] ?? 0.23;

  for (const jobId in byJob) {
    const job = state.jobs.find((j) => j.id === parseInt(jobId, 10));
    if (!job) continue;
    for (const m in byJob[jobId]) {
      const entry = byJob[jobId][m];
      if (job.type !== "B2B") {
        totals[entry.month].uop += entry.net_revenue;
        continue;
      }
      if (!entry.invoiced) continue;
      totals[entry.month].b2b += entry.net_revenue;
      if (job.vat_payer) totals[entry.month].vatCollected += entry.net_revenue * vatRate;
    }
  }
  return totals;
}

function emptyEntry(jobId, year, month) {
  return { id: null, job_id: jobId, year, month, hours: null, hourly_rate: null, net_revenue: 0, invoiced: false, notes: null };
}

function emptyB2BFee(year, month) {
  return { year, month, zus_amount: 0, zus_paid: false, pit_amount: 0, pit_paid: false, vat_amount: 0, vat_paid: false, notes: null };
}

function renderEntriesJobs(year, byJob) {
  const container = document.getElementById("entries-jobs");
  const relevantJobs = state.jobs.filter((j) => {
    const startY = new Date(j.start_date).getFullYear();
    const endY = j.end_date ? new Date(j.end_date).getFullYear() : Infinity;
    return startY <= year && year <= endY;
  });

  if (relevantJobs.length === 0) {
    container.innerHTML = `<div class="card"><p class="muted">Brak prac obejmujących rok ${year}.</p></div>`;
    return;
  }

  const fieldCols = (job) => (job.type === "B2B" ? 4 : 1);

  const groupHeaderRow = relevantJobs.map((job, idx) =>
    `<th colspan="${fieldCols(job)}" class="${tintClass(idx)} group-start">${job.name} <span class="badge ${job.type.toLowerCase()}">${job.type}</span></th>`
  ).join("");

  const fieldHeaderRow = relevantJobs.map((job, idx) => {
    const t = tintClass(idx);
    return job.type === "B2B"
      ? `<th class="${t} group-start group-hours">Godziny</th>
         <th class="${t} group-rate">Stawka/h</th>
         <th class="${t} group-net">Przychód netto</th>
         <th class="${t} group-invoiced">Faktura</th>`
      : `<th class="${t} group-start group-uop">Kwota netto</th>`;
  }).join("");

  const toClear = [];

  const rows = MONTHS.map((name, idx) => {
    const month = idx + 1;
    const cells = relevantJobs.map((job, jobIdx) => {
      const active = monthActive(job, year, month);
      const stored = (byJob[job.id] || {})[month];
      let e = stored || emptyEntry(job.id, year, month);
      // Wyszarzenie jest tylko wizualne (klasa "dim") - pole ma zawsze
      // zostać w pełni edytowalne. Ale jeśli miesiąc jest nieaktywny, a leży
      // tam jakaś wartość (np. z importu, albo sprzed zmiany dat pracy) -
      // czyścimy ją automatycznie, żeby nie zostawały "widmowe" wpisy.
      if (!active && stored && (stored.net_revenue || stored.hours || stored.hourly_rate || stored.invoiced)) {
        e = emptyEntry(job.id, year, month);
        toClear.push({ jobId: job.id, month, isB2B: job.type === "B2B" });
      }
      const dim = active ? "" : "dim";
      const t = tintClass(jobIdx);

      if (job.type !== "B2B") {
        return `<td class="${t} group-start group-uop"><input type="number" step="0.01" class="f-net ${dim}" data-job="${job.id}" data-month="${month}"
          id="net-${job.id}-${month}" value="${e.net_revenue || ""}" /></td>`;
      }

      // Część umów B2B ma stałą kwotę miesięczną zamiast stawki godzinowej -
      // wtedy godziny/stawka nie mają zastosowania (wyszarzone), a przychód
      // netto podpowiada się automatycznie tą stałą kwotą.
      const isFixed = job.fixed_monthly_net != null;
      const hoursRateDim = (!active || isFixed) ? "dim" : "";
      const netValue = e.net_revenue || (active && isFixed ? job.fixed_monthly_net : "") || "";

      return `
        <td class="${t} group-start group-hours"><input type="number" step="0.01" class="f-hours ${hoursRateDim}" data-job="${job.id}" data-month="${month}"
          id="hours-${job.id}-${month}" value="${e.hours ?? ""}" /></td>
        <td class="${t} group-rate"><input type="number" step="0.01" class="f-rate ${hoursRateDim}" data-job="${job.id}" data-month="${month}"
          id="rate-${job.id}-${month}" value="${e.hourly_rate ?? (active && !isFixed ? job.default_hourly_rate : null) ?? ""}" /></td>
        <td class="${t} group-net"><input type="number" step="0.01" class="f-net ${dim}" data-job="${job.id}" data-month="${month}"
          id="net-${job.id}-${month}" value="${netValue}" /></td>
        <td class="${t} group-invoiced" style="text-align:center"><input type="checkbox" class="f-invoiced ${dim}" data-job="${job.id}" data-month="${month}"
          id="invoiced-${job.id}-${month}" ${e.invoiced ? "checked" : ""} title="Faktura wystawiona" /></td>`;
    }).join("");

    return `<tr class="${relevantJobs.some((j) => monthActive(j, year, month)) ? "" : "inactive-month"}">
      <td class="month-col">${name}</td>${cells}
    </tr>`;
  }).join("");

  container.innerHTML = `
    <div class="card">
      <h3>Wpisy miesięczne — ${year}</h3>
      <div class="table-scroll">
        <table class="entries-table">
          <thead>
            <tr><th class="month-col"></th>${groupHeaderRow}</tr>
            <tr><th class="month-col">Miesiąc</th>${fieldHeaderRow}</tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="muted">Każda praca ma swój kolor tła i wyraźną kreskę oddzielającą jej kolumny. Kolumny są domyślnie wąskie — najedź, żeby się rozszerzyły.
      Zmiana stawki/h nadpisuje ją automatycznie we wszystkich kolejnych miesiącach danej pracy (wcześniejsze zostają bez zmian).
      Tylko miesiące z zaznaczoną fakturą liczą się do sum i wykresów.</p>
    </div>`;

  if (toClear.length > 0) {
    showToast(`Wyczyszczono ${toClear.length} nieaktywnych wpisów`, "ok");
    toClear.forEach(({ jobId, month, isB2B }) => saveRow(jobId, year, month, isB2B));
  }
}

function renderB2BFeesCard(year, byMonth) {
  const container = document.getElementById("entries-b2b-fees");
  const hasRelevantB2BJob = state.jobs.some((j) => {
    if (j.type !== "B2B") return false;
    for (let m = 1; m <= 12; m++) {
      if (monthActive(j, year, m)) return true;
    }
    return false;
  });
  if (!hasRelevantB2BJob) {
    container.innerHTML = "";
    return;
  }

  const toClear = [];

  const rows = MONTHS.map((name, idx) => {
    const month = idx + 1;
    const f = byMonth[month] || emptyB2BFee(year, month);

    // Opłata w danym miesiącu dotyczy pracy/faktury z TEGO SAMEGO miesiąca -
    // żadnego przesunięcia. Wyszarzenie jest tylko wizualne (pole zostaje
    // edytowalne), ALE jeśli miesiąc jest nieaktywny, a leżą tam jakieś
    // wartości (np. z importu, albo sprzed zmiany dat pracy) - czyścimy je
    // automatycznie, żeby nie było "widmowych" opłat.
    const active = state.jobs.some((j) => j.type === "B2B" && monthActive(j, year, month));
    const dim = active ? "" : "dim";

    let zus = f.zus_amount, pit = f.pit_amount, vat = f.vat_amount;
    let zusPaid = f.zus_paid, pitPaid = f.pit_paid, vatPaid = f.vat_paid;
    if (!active && (f.zus_amount || f.pit_amount || f.vat_amount || f.zus_paid || f.pit_paid || f.vat_paid)) {
      zus = pit = vat = 0;
      zusPaid = pitPaid = vatPaid = false;
      toClear.push(month);
    }

    return `<tr id="fee-row-${month}" data-month="${month}" class="${active ? "" : "inactive-month"}">
      <td class="month-col">${name}</td>
      <td class="tint-0 group-start fee-amount"><input type="number" step="0.01" class="ff-zus ${dim}" value="${zus || ""}" /></td>
      <td class="tint-0 fee-paid"><input type="checkbox" class="ff-zus-paid ${dim}" ${zusPaid ? "checked" : ""} /></td>
      <td class="tint-1 group-start fee-amount"><input type="number" step="0.01" class="ff-pit ${dim}" value="${pit || ""}" /></td>
      <td class="tint-1 fee-paid"><input type="checkbox" class="ff-pit-paid ${dim}" ${pitPaid ? "checked" : ""} /></td>
      <td class="tint-2 group-start fee-amount"><input type="number" step="0.01" class="ff-vat ${dim}" value="${vat || ""}" /></td>
      <td class="tint-2 fee-paid"><input type="checkbox" class="ff-vat-paid ${dim}" ${vatPaid ? "checked" : ""} /></td>
      <td class="fee-action"><button class="btn small secondary${dim || (zus || pit || vat) ? " faded" : ""}" onclick="recalcFeeRow(${year}, ${month})">Przelicz</button></td>
    </tr>`;
  }).join("");

  container.innerHTML = `
    <div class="card">
      <h3>Opłaty B2B (ZUS / PIT / VAT) — sumarycznie za wszystkie prace</h3>
      <p class="muted">Jedna wspólna kwota miesięcznie, tak jak rozlicza księgowa — niezależnie od liczby umów B2B.
      Wiersz dotyczy tego samego miesiąca co praca/faktura (np. "Wrzesień" = opłaty za wrzesień) - bez żadnego przesunięcia.
      "Przelicz" policzy kwoty na bazie zafakturowanej sprzedaży z danego miesiąca.</p>
      <table class="fees-table">
        <thead>
          <tr><th class="month-col"></th><th colspan="2" class="tint-0 group-start">ZUS</th><th colspan="2" class="tint-1 group-start">PIT</th><th colspan="2" class="tint-2 group-start">VAT</th><th></th></tr>
          <tr>
            <th class="month-col">Miesiąc</th>
            <th class="tint-0 group-start fee-amount">Kwota</th><th class="tint-0 fee-paid">Zapłacone</th>
            <th class="tint-1 group-start fee-amount">Kwota</th><th class="tint-1 fee-paid">Zapłacone</th>
            <th class="tint-2 group-start fee-amount">Kwota</th><th class="tint-2 fee-paid">Zapłacone</th>
            <th class="fee-action"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  if (toClear.length > 0) {
    showToast(`Wyczyszczono ${toClear.length} nieaktywnych opłat B2B`, "ok");
    toClear.forEach((month) => saveFeeRow(year, month));
  }
}

document.addEventListener("input", (ev) => {
  if (!ev.target.closest("#entries-jobs")) return;
  if (!(ev.target.classList.contains("f-hours") || ev.target.classList.contains("f-rate"))) return;
  const jobId = ev.target.dataset.job;
  const month = ev.target.dataset.month;
  const hours = document.getElementById(`hours-${jobId}-${month}`);
  const rate = document.getElementById(`rate-${jobId}-${month}`);
  const net = document.getElementById(`net-${jobId}-${month}`);
  if (hours && rate && net) {
    const h = parseFloat(hours.value) || 0;
    const r = parseFloat(rate.value) || 0;
    net.value = (h * r) || "";
  }
});

const AUTOSAVE_FIELDS = ["f-hours", "f-rate", "f-net", "f-invoiced"];
const FEE_AUTOSAVE_FIELDS = ["ff-zus", "ff-pit", "ff-vat", "ff-zus-paid", "ff-pit-paid", "ff-vat-paid"];

document.addEventListener("change", (ev) => {
  if (AUTOSAVE_FIELDS.some((c) => ev.target.classList.contains(c))) {
    if (!ev.target.closest("#entries-jobs")) return;
    const jobId = parseInt(ev.target.dataset.job, 10);
    const month = parseInt(ev.target.dataset.month, 10);
    const job = state.jobs.find((j) => j.id === jobId);
    const isB2B = job?.type === "B2B";
    const isRateChange = ev.target.classList.contains("f-rate");
    saveRow(jobId, state.entriesYear, month, isB2B, isRateChange);
    return;
  }
  if (FEE_AUTOSAVE_FIELDS.some((c) => ev.target.classList.contains(c))) {
    const tr = ev.target.closest("tr[data-month]");
    if (!tr || !tr.closest("#entries-b2b-fees")) return;
    saveFeeRow(state.entriesYear, parseInt(tr.dataset.month, 10));
  }
});

async function recalcFeeRow(year, month) {
  const tr = document.getElementById(`fee-row-${month}`);
  const suggestion = await api(`/api/b2b-fees/suggest?year=${year}&month=${month}`);
  tr.querySelector(".ff-zus").value = suggestion.zus_amount;
  tr.querySelector(".ff-pit").value = suggestion.pit_amount;
  tr.querySelector(".ff-vat").value = suggestion.vat_amount;
  await saveFeeRow(year, month);
}

async function saveFeeRow(year, month) {
  const tr = document.getElementById(`fee-row-${month}`);
  const payload = {
    year,
    month,
    zus_amount: parseFloat(tr.querySelector(".ff-zus").value) || 0,
    zus_paid: tr.querySelector(".ff-zus-paid").checked,
    pit_amount: parseFloat(tr.querySelector(".ff-pit").value) || 0,
    pit_paid: tr.querySelector(".ff-pit-paid").checked,
    vat_amount: parseFloat(tr.querySelector(".ff-vat").value) || 0,
    vat_paid: tr.querySelector(".ff-vat-paid").checked,
  };
  try {
    const saved = await api("/api/b2b-fees", { method: "POST", body: JSON.stringify(payload) });
    (state.b2bFeesByYear[year] ??= {})[month] = saved;
    updateEntriesSummary(year);
    showToast("Zapisano ✓", "ok");
  } catch (err) {
    showToast("Błąd zapisu", "err");
  }
}

async function saveRow(jobId, year, month, isB2B, propagateRate = false) {
  const netEl = document.getElementById(`net-${jobId}-${month}`);
  const payload = {
    job_id: jobId,
    year,
    month,
    net_revenue: parseFloat(netEl.value) || 0,
  };
  if (isB2B) {
    payload.hours = parseFloat(document.getElementById(`hours-${jobId}-${month}`).value) || null;
    payload.hourly_rate = parseFloat(document.getElementById(`rate-${jobId}-${month}`).value) || null;
    payload.invoiced = document.getElementById(`invoiced-${jobId}-${month}`).checked;
  }
  try {
    const saved = await api("/api/entries", { method: "POST", body: JSON.stringify(payload) });
    ((state.entriesByYear[year] ??= {})[jobId] ??= {})[month] = saved;
    updateEntriesSummary(year);
    showToast("Zapisano ✓", "ok");

    if (propagateRate && payload.hourly_rate) {
      const res = await api("/api/entries/propagate-rate", {
        method: "POST",
        body: JSON.stringify({ job_id: jobId, year, month, hourly_rate: payload.hourly_rate }),
      });
      if (res.updated_months > 0) {
        showToast(`Stawka nadpisana w ${res.updated_months} kolejnych mies.`, "ok");
        await loadEntriesForYear(year);
      }
    }
  } catch (err) {
    showToast("Błąd zapisu", "err");
  }
}

function updateEntriesSummary(year) {
  const byJob = state.entriesByYear[year] || {};
  const byMonth = state.b2bFeesByYear[year] || {};
  const tbody = document.getElementById("entries-summary-tbody");
  if (!tbody) return;

  const received = computeReceivedTotals(year, byJob);

  const totals = MONTHS.map((_, idx) => {
    const month = idx + 1;
    // VAT należny wpływa na konto razem z fakturą (ten sam miesiąc co
    // przychód); VAT faktycznie zapłacony do US (niżej) może być niższy
    // dzięki odliczeniom z kosztów - różnica zostaje jako realny dochód.
    let total = received[month].uop + received[month].b2b + received[month].vatCollected;
    // Opłata za dany miesiąc dotyczy pracy/faktury z TEGO SAMEGO miesiąca.
    const fee = byMonth[month];
    if (fee && hasInvoicedB2BThisMonth(month, byJob)) {
      total -= fee.zus_amount + fee.pit_amount + fee.vat_amount;
    }
    return total;
  });
  tbody.innerHTML = MONTHS.map((name, idx) => `<tr><td>${name}</td><td>${fmtMoney(totals[idx])}</td></tr>`).join("")
    + `<tr><td><b>Suma</b></td><td><b>${fmtMoney(totals.reduce((a, b) => a + b, 0))}</b></td></tr>`;
}

// ---------- Wydatki ----------
function escapeAttr(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

async function renderExpenses() {
  const el = document.getElementById("view-expenses");
  const [existingYears, transferCategories] = await Promise.all([
    api("/api/expenses/years"),
    api("/api/expenses/transfer-categories"),
  ]);
  state.expenseTransferCategories = transferCategories;

  const candidateYears = new Set(existingYears);
  const now = new Date().getFullYear();
  candidateYears.add(now);
  state.extraYears.forEach((y) => candidateYears.add(y));
  candidateYears.add(state.expensesYear);
  const years = [...candidateYears].sort((a, b) => a - b);

  el.innerHTML = `
    <div class="card card-narrow">${renderYearNav("expenses", years, state.expensesYear)}</div>
    <div id="expenses-months"></div>
    <div class="card card-narrow">
      <h3>Podsumowanie miesięczne — ${state.expensesYear}</h3>
      <table>
        <thead><tr><th>Miesiąc</th><th>Suma wydatków</th></tr></thead>
        <tbody id="expenses-summary-tbody"></tbody>
      </table>
    </div>
  `;

  wireYearNav("expenses", years, () => state.expensesYear, (y) => { state.expensesYear = y; }, renderExpenses);
  await loadExpensesForYear(state.expensesYear);
}

async function loadExpensesForYear(year) {
  const items = await api(`/api/expenses?year=${year}`);
  const byMonth = {};
  for (let m = 1; m <= 12; m++) byMonth[m] = [];
  items.forEach((it) => { byMonth[it.month].push(it); });
  state.expensesByYear ??= {};
  state.expensesByYear[year] = byMonth;
  renderExpenseMonths(year, byMonth);
  updateExpensesSummary(year);
}

function isTransferCategory(name) {
  return state.expenseTransferCategories.includes(name);
}

function monthExpenseSum(items) {
  return items.reduce((a, it) => a + (isTransferCategory(it.name) ? 0 : (it.amount || 0)), 0);
}

// Aktualny miesiac zawsze na gorze, pod nim wstecz poprzednie (grudzien
// przechodzi w listopad itd.). Miesiace z przyszlosci (dla biezacego roku)
// ida na sam dol, tylko przygaszone wizualnie (jak nieaktywne miesiace we
// Wpisach) - tabela jest kompaktowa, wiec zwijanie nie jest tu potrzebne.
function expenseMonthOrder(year) {
  const now = new Date();
  const curKey = now.getFullYear() * 12 + now.getMonth();
  const past = [];
  const future = [];
  for (let m = 1; m <= 12; m++) {
    const key = year * 12 + (m - 1);
    (key <= curKey ? past : future).push(m);
  }
  past.sort((a, b) => b - a);
  future.sort((a, b) => a - b);
  return { past, future };
}

// Kolejnosc kolumn wg pierwszego wystapienia danej nazwy w roku (styczen ->
// grudzien), zeby kolumny nie "skakaly" miejscami przy przeladowaniu.
function expenseNamesForYear(byMonth) {
  const names = [];
  for (let m = 1; m <= 12; m++) {
    (byMonth[m] || []).forEach((it) => { if (!names.includes(it.name)) names.push(it.name); });
  }
  return names;
}

function renderExpenseMonths(year, byMonth) {
  const container = document.getElementById("expenses-months");
  const { past, future } = expenseMonthOrder(year);
  const order = [...past, ...future];
  const names = expenseNamesForYear(byMonth);

  if (names.length === 0) {
    container.innerHTML = `
      <div class="card">
        <p class="muted">Brak jeszcze żadnych wydatków w ${year} r.</p>
        <button type="button" class="btn" id="expense-add-col-btn">+ Dodaj pierwszą pozycję</button>
      </div>`;
    document.getElementById("expense-add-col-btn").addEventListener("click", addExpenseCategoryColumn);
  } else {
    const headerRow = names.map((name, idx) => {
      const isTransfer = isTransferCategory(name);
      return `<th class="${tintClass(idx)} group-start cat-col hover-col ${isTransfer ? "is-transfer-col" : ""}" data-col="${idx}" title="${isTransfer ? "Przelew między własnymi kontami - wyłączone z sum (zarządzaj w Ustawieniach)" : ""}">${escapeAttr(name)}</th>`;
    }).join("");

    const rows = order.map((month) => {
      const items = byMonth[month] || [];
      const isFuture = future.includes(month);
      const cells = names.map((name, idx) => {
        const t = tintClass(idx);
        const item = items.find((it) => it.name === name);
        const amount = item ? item.amount : null;
        const paid = item ? item.paid : false;
        const excluded = isTransferCategory(name);
        const id = item ? item.id : "";
        return `
          <td class="${t} group-start cat-col hover-col" data-col="${idx}">
            <div class="expense-cell ${paid ? "is-paid" : ""} ${excluded ? "is-excluded" : ""}">
              <input type="number" step="0.01" class="exp-amount" data-name="${escapeAttr(name)}" data-month="${month}" data-id="${id}" value="${amount || ""}" />
              <input type="checkbox" class="exp-paid" data-name="${escapeAttr(name)}" data-month="${month}" data-id="${id}" title="Zapłacone" ${paid ? "checked" : ""} />
              ${item ? `<button type="button" class="expense-cell-del" data-action="delete-from-month" data-name="${escapeAttr(name)}" data-month="${month}" title="Zakończ „${escapeAttr(name)}” od tego miesiąca (usuwa ten i kolejne miesiące, wcześniejsze zostają)">✕</button>` : ""}
            </div>
          </td>`;
      }).join("");

      return `<tr class="${isFuture ? "inactive-month" : ""}">
        <td class="month-col">${MONTHS[month - 1]}</td>
        ${cells}
        <td class="cat-col-add"></td>
      </tr>`;
    }).join("");

    container.innerHTML = `
      <div class="card">
        <h3>Wydatki miesięczne — ${year}</h3>
        <div class="expense-copy-row">
          <label class="muted" for="expense-copy-month">Uzupełnij brakujące pozycje w</label>
          <select id="expense-copy-month">
            ${order.map((m) => `<option value="${m}">${MONTHS[m - 1]}</option>`).join("")}
          </select>
          <button type="button" class="btn small secondary" id="expense-copy-btn">z poprzedniego miesiąca</button>
        </div>
        <div class="table-scroll">
          <table class="expense-table">
            <thead>
              <tr>
                <th class="month-col">Miesiąc</th>${headerRow}
                <th class="cat-col-add"><button type="button" class="expense-add-col-btn" id="expense-add-col-btn" title="Dodaj nową pozycję">+</button></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <p class="muted">Każda pozycja ma swoją kolumnę (kwota + checkbox „zapłacone") — łatwo porównać kwotę z poprzednim miesiącem, patrząc w dół kolumny.
        Wpisanie kwoty w pustej komórce dodaje nową pozycję na ten miesiąc; wyczyszczenie kwoty (przy odznaczonym „zapłacone”) ją usuwa.
        „✕” przy wypełnionej komórce kończy tę pozycję od tego miesiąca (usuwa ten i wszystkie kolejne miesiące w tym roku, wcześniejsze zostają bez zmian).
        „+” na końcu dodaje nową pozycję (kolumnę). Nazwy z przerywanym podkreśleniem to przelewy między własnymi kontami
        (widoczne, wyszarzone kursywą, wyłączone z sum) — zarządzaj listą w Ustawieniach.</p>
      </div>`;

    document.getElementById("expense-add-col-btn").addEventListener("click", addExpenseCategoryColumn);
    document.getElementById("expense-copy-btn").addEventListener("click", () => {
      const month = parseInt(document.getElementById("expense-copy-month").value, 10);
      copyExpenseMonth(month);
    });
  }
}

function updateExpensesSummary(year) {
  const byMonth = state.expensesByYear[year] || {};
  const tbody = document.getElementById("expenses-summary-tbody");
  if (!tbody) return;
  const sums = MONTHS.map((_, idx) => monthExpenseSum(byMonth[idx + 1] || []));
  tbody.innerHTML = MONTHS.map((name, idx) => `<tr><td>${name}</td><td>${fmtMoney(sums[idx])}</td></tr>`).join("")
    + `<tr><td><b>Suma</b></td><td><b>${fmtMoney(sums.reduce((a, b) => a + b, 0))}</b></td></tr>`;
}

document.addEventListener("change", (ev) => {
  if (!ev.target.closest("#expenses-months")) return;
  if (!(ev.target.classList.contains("exp-amount") || ev.target.classList.contains("exp-paid"))) return;
  const cell = ev.target.closest(".expense-cell");
  if (!cell) return;
  const amountInput = cell.querySelector(".exp-amount");
  const paidInput = cell.querySelector(".exp-paid");
  const month = parseInt(ev.target.dataset.month, 10);
  const name = ev.target.dataset.name;
  const id = ev.target.dataset.id ? parseInt(ev.target.dataset.id, 10) : null;
  const amount = parseFloat(amountInput.value) || 0;
  const paid = paidInput.checked;
  saveExpenseCell(state.expensesYear, month, name, id, amount, paid);
});

document.addEventListener("click", (ev) => {
  const delBtn = ev.target.closest('[data-action="delete-from-month"]');
  if (delBtn && delBtn.closest("#expenses-months")) {
    deleteExpenseFromMonth(state.expensesYear, parseInt(delBtn.dataset.month, 10), delBtn.dataset.name);
  }
});

// Wspolny mechanizm dla Wydatkow (".cat-col") i Wpisow (".group-*") -
// kolumny sa domyslnie waskie, a po najechaniu na dowolna komorke danej
// kolumny/grupy cala ona (naglowek + wszystkie miesiace) sie rozszerza.
// Dziala dla dowolnej tabeli z komorkami oznaczonymi klasa "hover-col" i
// atrybutem data-col (stan najechania trzymany per-tabela w dataset).
document.addEventListener("mouseover", (ev) => {
  const cell = ev.target.closest(".hover-col");
  if (!cell) return;
  const table = cell.closest("table");
  const col = cell.dataset.col;
  if (table.dataset.hoverCol === col) return;
  table.querySelectorAll(".hover-col.col-hover").forEach((c) => c.classList.remove("col-hover"));
  table.querySelectorAll(`.hover-col[data-col="${col}"]`).forEach((c) => c.classList.add("col-hover"));
  table.dataset.hoverCol = col;
});

document.addEventListener("mouseout", (ev) => {
  const table = ev.target.closest("table");
  if (!table || !table.dataset.hoverCol) return;
  if (ev.relatedTarget && table.contains(ev.relatedTarget)) return;
  table.querySelectorAll(".hover-col.col-hover").forEach((c) => c.classList.remove("col-hover"));
  delete table.dataset.hoverCol;
});

async function saveExpenseCell(year, month, name, id, amount, paid) {
  try {
    if (!id) {
      if (amount === 0 && !paid) return; // pusta komorka - nic do zrobienia
      await api("/api/expenses", { method: "POST", body: JSON.stringify({ year, month, name, amount, paid }) });
      showToast("Zapisano ✓", "ok");
    } else if (amount === 0 && !paid) {
      await api(`/api/expenses/${id}`, { method: "DELETE" });
      showToast("Usunięto", "ok");
    } else {
      await api(`/api/expenses/${id}`, { method: "PUT", body: JSON.stringify({ amount, paid }) });
      showToast("Zapisano ✓", "ok");
    }
    await loadExpensesForYear(year);
  } catch (err) {
    showToast("Błąd zapisu", "err");
  }
}

async function addExpenseCategoryColumn() {
  const name = prompt("Nazwa nowej pozycji (np. Ubezpieczenie auta):");
  if (!name || !name.trim()) return;
  const year = state.expensesYear;
  const now = new Date();
  // Nowa pozycja startuje od biezacego miesiaca (jesli przegladamy biezacy
  // rok) albo od stycznia (dla innych lat) - amount=0, do uzupelnienia w
  // komorce.
  const month = year === now.getFullYear() ? now.getMonth() + 1 : 1;
  try {
    await api("/api/expenses", { method: "POST", body: JSON.stringify({ year, month, name: name.trim(), amount: 0, paid: false }) });
    showToast("Dodano ✓", "ok");
    await loadExpensesForYear(year);
  } catch (err) {
    showToast("Błąd zapisu", "err");
  }
}

// Konczy pozycje "name" od podanego miesiaca (usuwa TEN i kazdy PoZNIEJSZY
// (chronologicznie) miesiac w danym roku - wczesniejsze miesiace zostaja
// nietkniete). To odpowiednik ustawienia daty zakonczenia dla pracy.
async function deleteExpenseFromMonth(year, fromMonth, name) {
  const byMonth = state.expensesByYear[year] || {};
  const ids = [];
  for (let m = fromMonth; m <= 12; m++) (byMonth[m] || []).forEach((it) => { if (it.name === name) ids.push(it.id); });
  if (ids.length === 0) return;
  const monthsAffected = ids.length;
  const confirmed = confirm(
    `Zakończyć „${name}” od miesiąca ${MONTHS[fromMonth - 1]} ${year}?\n\n` +
    `Usunie to ${monthsAffected} poz. (ten i kolejne miesiące). Wcześniejsze miesiące zostaną bez zmian.`
  );
  if (!confirmed) return;
  try {
    await Promise.all(ids.map((id) => api(`/api/expenses/${id}`, { method: "DELETE" })));
    showToast(`Zakończono „${name}” od ${MONTHS[fromMonth - 1]} (usunięto ${monthsAffected} poz.)`, "ok");
    await loadExpensesForYear(year);
  } catch (err) {
    showToast("Błąd usuwania", "err");
  }
}

async function copyExpenseMonth(month) {
  const year = state.expensesYear;
  try {
    const created = await api("/api/expenses/copy-month", {
      method: "POST",
      body: JSON.stringify({ year, month }),
    });
    if (created.length === 0) {
      showToast("Brak nowych pozycji do skopiowania", "err");
      return;
    }
    showToast(`Skopiowano ${created.length} pozycji`, "ok");
    await loadExpensesForYear(year);
  } catch (err) {
    showToast("Błąd kopiowania", "err");
  }
}

// ---------- Settings ----------
async function renderSettings() {
  const el = document.getElementById("view-settings");
  el.innerHTML = `<div id="settings-jobs-section"></div><div id="settings-transfers-section"></div><div id="settings-rates-section"></div>`;
  await renderJobs();
  await renderTransferCategoriesSection();
  await renderRatesSection();
}

async function renderTransferCategoriesSection() {
  const el = document.getElementById("settings-transfers-section");
  const [names, transferCategories] = await Promise.all([
    api("/api/expenses/names"),
    api("/api/expenses/transfer-categories"),
  ]);
  const available = names.filter((n) => !transferCategories.includes(n));

  el.innerHTML = `
    <div class="card">
      <h2>Przelewy między kontami</h2>
      <p class="muted">Wybierz z listy nazwę pozycji z Wydatków, która w rzeczywistości jest przelewem między Twoimi własnymi kontami
      (nie realnym wydatkiem). Kwota zostanie widoczna w tabeli Wydatków, ale wyłączona z sum — dla wszystkich miesięcy i lat naraz.</p>
      <div class="form-row">
        <div class="field">
          <label>Nazwa pozycji</label>
          <select id="transfer-category-select">
            ${available.length === 0
              ? `<option value="">(brak dostępnych pozycji)</option>`
              : available.map((n) => `<option value="${escapeAttr(n)}">${escapeAttr(n)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <button type="button" class="btn" id="transfer-category-add-btn" ${available.length === 0 ? "disabled" : ""}>+ Dodaj</button>
        </div>
      </div>
      <table>
        <thead><tr><th>Nazwa</th><th></th></tr></thead>
        <tbody>
          ${transferCategories.length === 0
            ? `<tr><td colspan="2" class="muted">Brak oznaczonych pozycji.</td></tr>`
            : transferCategories.map((n) => `
              <tr>
                <td>${escapeAttr(n)}</td>
                <td><button type="button" class="btn small danger" data-action="remove-transfer-category" data-name="${escapeAttr(n)}">Usuń</button></td>
              </tr>`).join("")}
        </tbody>
      </table>
    </div>`;

  const addBtn = document.getElementById("transfer-category-add-btn");
  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      const select = document.getElementById("transfer-category-select");
      const name = select.value;
      if (!name) return;
      try {
        await api("/api/expenses/transfer-categories", { method: "POST", body: JSON.stringify({ name }) });
        showToast("Dodano ✓", "ok");
        renderTransferCategoriesSection();
      } catch (err) {
        showToast("Błąd zapisu", "err");
      }
    });
  }
}

document.addEventListener("click", (ev) => {
  const btn = ev.target.closest('[data-action="remove-transfer-category"]');
  if (!btn) return;
  const name = btn.dataset.name;
  api(`/api/expenses/transfer-categories/${encodeURIComponent(name)}`, { method: "DELETE" })
    .then(() => {
      showToast("Usunięto", "ok");
      renderTransferCategoriesSection();
    })
    .catch(() => showToast("Błąd usuwania", "err"));
});

async function renderRatesSection() {
  const el = document.getElementById("settings-rates-section");
  const now = new Date().getFullYear();
  const allSettings = await api("/api/settings");
  const years = new Set(allSettings.map((s) => s.year));
  years.add(now);
  state.extraYears.forEach((y) => years.add(y));
  const selectedYear = state.settingsYear ?? now;
  years.add(selectedYear);
  const yearList = [...years].sort((a, b) => a - b);
  state.settingsYear = selectedYear;

  el.innerHTML = `
    <div class="warning-banner">
      Wyliczenia ZUS/PIT/VAT poniżej to <b>uproszczone wartości orientacyjne</b>, bez uwzględniania kosztów uzyskania
      przychodu. Jeśli w danym miesiącu masz równolegle aktywną pracę UoP, do ZUS społecznego użyta zostanie osobna
      kwota "przy zbiegu z UoP" (domyślnie 0 zł — zwykle nie płaci się go podwójnie). Zweryfikuj wartości z
      księgową/księgowym i dostosuj poniższe pola — a przy każdym wpisie zawsze możesz nadpisać wyliczoną kwotę ręcznie.
    </div>
    <div class="card">
      <div class="form-row">
        <div class="field"><label>Rok</label>
          <select id="settings-year">
            ${yearList.map((y) => `<option value="${y}" ${y === selectedYear ? "selected" : ""}>${y}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>Nowy rok</label>
          <div style="display:flex; gap:6px">
            <input type="number" id="settings-year-custom" placeholder="np. 2027" />
            <button class="btn secondary" id="settings-year-add">Dodaj/edytuj</button>
          </div>
        </div>
      </div>
    </div>
    <div class="card" id="settings-form-card"></div>
  `;

  document.getElementById("settings-year").addEventListener("change", (e) => {
    state.settingsYear = parseInt(e.target.value, 10);
    renderRatesSection();
  });
  document.getElementById("settings-year-add").addEventListener("click", () => {
    const v = parseInt(document.getElementById("settings-year-custom").value, 10);
    if (v) { state.extraYears.add(v); state.settingsYear = v; renderRatesSection(); }
  });

  const s = await api(`/api/settings/${selectedYear}`);
  document.getElementById("settings-form-card").innerHTML = `
    <h3>Parametry na rok ${selectedYear}</h3>
    <form id="settings-form">
      <div class="form-row">
        <div class="field"><label>ZUS społeczny miesięcznie — bez UoP (zł)</label><input type="number" step="0.01" id="s-zus-spoleczny" value="${s.zus_spoleczny_monthly}" /></div>
        <div class="field"><label>ZUS społeczny miesięcznie — przy zbiegu z UoP (zł)</label><input type="number" step="0.01" id="s-zus-spoleczny-uop" value="${s.zus_spoleczny_with_uop_monthly}" /></div>
        <div class="field"><label>Stawka składki zdrowotnej (%)</label><input type="number" step="0.01" id="s-zus-zdrow-rate" value="${(s.zus_zdrowotna_rate * 100).toFixed(2)}" /></div>
        <div class="field"><label>Minimalna składka zdrowotna (zł)</label><input type="number" step="0.01" id="s-zus-zdrow-min" value="${s.zus_zdrowotna_min}" /></div>
      </div>
      <div class="form-row">
        <div class="field"><label>Sposób liczenia PIT</label>
          <select id="s-pit-mode">
            <option value="percent" ${s.pit_mode === "percent" ? "selected" : ""}>Procent dochodu</option>
            <option value="fixed" ${s.pit_mode === "fixed" ? "selected" : ""}>Stała kwota (np. IP Box)</option>
          </select>
        </div>
        <div class="field" id="s-pit-rate-field"><label>Stawka PIT liniowy (%)</label><input type="number" step="0.01" id="s-pit-rate" value="${(s.pit_rate * 100).toFixed(2)}" /></div>
        <div class="field" id="s-pit-fixed-field"><label>Stała kwota PIT miesięcznie (zł)</label><input type="number" step="0.01" id="s-pit-fixed" value="${s.pit_fixed_amount}" /></div>
        <div class="field"><label>Stawka VAT (%)</label><input type="number" step="0.01" id="s-vat-rate" value="${(s.vat_rate * 100).toFixed(2)}" /></div>
      </div>
    </form>
    <p class="muted">Zmiany zapisują się automatycznie.</p>
  `;

  const pitModeSelect = document.getElementById("s-pit-mode");
  const togglePitFields = () => {
    const fixed = pitModeSelect.value === "fixed";
    document.getElementById("s-pit-rate-field").style.display = fixed ? "none" : "";
    document.getElementById("s-pit-fixed-field").style.display = fixed ? "" : "none";
  };
  pitModeSelect.addEventListener("change", togglePitFields);
  togglePitFields();

  document.getElementById("settings-form").addEventListener("submit", (ev) => ev.preventDefault());
  document.getElementById("settings-form").addEventListener("change", async () => {
    const payload = {
      zus_spoleczny_monthly: parseFloat(document.getElementById("s-zus-spoleczny").value) || 0,
      zus_spoleczny_with_uop_monthly: parseFloat(document.getElementById("s-zus-spoleczny-uop").value) || 0,
      zus_zdrowotna_rate: (parseFloat(document.getElementById("s-zus-zdrow-rate").value) || 0) / 100,
      zus_zdrowotna_min: parseFloat(document.getElementById("s-zus-zdrow-min").value) || 0,
      pit_mode: pitModeSelect.value,
      pit_rate: (parseFloat(document.getElementById("s-pit-rate").value) || 0) / 100,
      pit_fixed_amount: parseFloat(document.getElementById("s-pit-fixed").value) || 0,
      vat_rate: (parseFloat(document.getElementById("s-vat-rate").value) || 0) / 100,
    };
    try {
      await api(`/api/settings/${selectedYear}`, { method: "PUT", body: JSON.stringify(payload) });
      showToast(`Zapisano ustawienia ${selectedYear} ✓`, "ok");
    } catch (err) {
      showToast("Błąd zapisu ustawień", "err");
    }
  });
}

// ---------- Init ----------
initTabs();
renderDashboard();
