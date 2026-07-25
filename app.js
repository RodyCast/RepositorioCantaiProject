/* ============================================================
   Repositório Cantai - JS puro (Integrado com Supabase)
   ============================================================ */

// ---------- 0. Conexão com Supabase --------------
const SUPABASE_URL = 'https://wvhonvtsufhqtvbihzut.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_R0pzifNa3l3WehFcmZV9wg_FX-ZZIN2';

// Usamos o nome 'db' para evitar conflito com a biblioteca global
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Lista das musicas
let louvores = [];

// ---------- 2. ESTADO DA UI ----------
let filtros = { busca: "", acorde: "", nota: "" };
let ordenacao = { campo: "nome", asc: true };

// ---------- 3. HELPERS ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function formatarData(iso) {
  if (!iso || iso === '2026-01-01') return "Nunca cantado";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function diasDesde(iso) {
  if (!iso || iso === '2026-01-01') return null;
  const hoje = new Date();
  const data = new Date(iso + "T00:00:00");
  return Math.floor((hoje - data) / (1000 * 60 * 60 * 24));
}

function statusPorDias(dias) {
  if (dias === null) return { classe: "status--nunca", texto: "Nunca cantado" };
  if (dias <= 30)   return { classe: "status--recente", texto: `Há ${dias} dias` };
  if (dias <= 90)   return { classe: "status--medio",  texto: `Há ${dias} dias` };
  return { classe: "status--antigo", texto: `Há ${dias} dias` };
}

function mostrarToast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.hidden = true), 3000);
}

// ---------- 4. TABS ----------
$$(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".tab").forEach((b) => b.classList.remove("tab--active"));
    $$(".panel").forEach((p) => p.classList.remove("panel--active"));
    btn.classList.add("tab--active");
    $(`#panel-${btn.dataset.tab}`).classList.add("panel--active");
  });
});

// ---------- 5. FILTROS (aba Repositório) ----------
function popularSelectsDeFiltro() {
  const acordes = [...new Set(louvores.map((l) => l.acorde))].sort();
  const notas   = [...new Set(louvores.map((l) => l.primeiras_notas))].sort();
  const selA = $("#filtro-acorde");
  const selN = $("#filtro-nota");
  
  // Limpa opções antigas se houver
  selA.innerHTML = '<option value="">Todos os acordes</option>';
  selN.innerHTML = '<option value="">Todas as notas</option>';

  acordes.forEach((a) => selA.insertAdjacentHTML("beforeend", `<option value="${a}">${a}</option>`));
  notas.forEach((n)   => selN.insertAdjacentHTML("beforeend", `<option value="${n}">${n}</option>`));
}

$("#filtro-busca").addEventListener("input", (e) => { filtros.busca = e.target.value.toLowerCase(); renderTabela(); });
$("#filtro-acorde").addEventListener("change", (e) => { filtros.acorde = e.target.value; renderTabela(); });
$("#filtro-nota").addEventListener("change",   (e) => { filtros.nota   = e.target.value; renderTabela(); });
$("#btn-limpar").addEventListener("click", () => {
  filtros = { busca: "", acorde: "", nota: "" };
  $("#filtro-busca").value = "";
  $("#filtro-acorde").value = "";
  $("#filtro-nota").value = "";
  renderTabela();
});

// ---------- 6. ORDENAÇÃO ----------
$$(".tabela thead th[data-sort]").forEach((th) => {
  th.addEventListener("click", () => {
    const campo = th.dataset.sort;
    if (ordenacao.campo === campo) ordenacao.asc = !ordenacao.asc;
    else { ordenacao.campo = campo; ordenacao.asc = true; }
    renderTabela();
  });
});

// ---------- 7. RENDER TABELA ----------
function renderTabela() {
  let lista = louvores.filter((l) => {
    if (filtros.busca && !l.nome.toLowerCase().includes(filtros.busca)) return false;
    if (filtros.acorde && l.acorde !== filtros.acorde) return false;
    if (filtros.nota && l.primeiras_notas !== filtros.nota) return false;
    return true;
  });

  lista.sort((a, b) => {
    const va = a[ordenacao.campo] ?? "";
    const vb = b[ordenacao.campo] ?? "";
    if (va < vb) return ordenacao.asc ? -1 : 1;
    if (va > vb) return ordenacao.asc ?  1 : -1;
    return 0;
  });

  const tbody = $("#tbody-louvores");
  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="vazio">Nenhum louvor encontrado com esses filtros.</td></tr>`;
  } else {
    tbody.innerHTML = lista.map((l) => {
      const dias = diasDesde(l.ultima_atualizacao);
      const st = statusPorDias(dias);
      
      // Formatação amigável para os booleanos (Sobe/Desce meio tom)
      const sobeTom = l.sobe_meio_tom ? "Sim" : "Não";
      const desceTom = l.desce_meio_tom ? "Sim" : "Não";

      return `
        <tr>
          <td>${l.id}</td>
          <td class="nome">${l.nome}</td>
          <td><span class="chip">${l.primeiras_notas}</span></td>
          <td><span class="chip">${l.acorde}</span></td>
          <td>${l.fluxo_culto}</td>
          <td>${l.compasso}</td>
          <td>${sobeTom}</td>
          <td>${desceTom}</td>
          <td>${formatarData(l.ultima_atualizacao)}</td>
          <td class="status ${st.classe}">${st.texto}</td>
        </tr>`;
    }).join("");
  }

  $("#contagem").textContent = `${lista.length} ${lista.length === 1 ? "louvor" : "louvores"}`;

  // marcar coluna ordenada
  $$(".tabela thead th").forEach((th) => {
    th.classList.remove("sorted", "asc");
    if (th.dataset.sort === ordenacao.campo) {
      th.classList.add("sorted");
      if (ordenacao.asc) th.classList.add("asc");
    }
  });
}

// ---------- 8. ABA ATUALIZAR ----------
let louvorSelecionado = null;
let dataSelecionada = null;

function popularSelectLouvores() {
  const sel = $("#select-louvor");
  sel.innerHTML = '<option value="">Selecione uma música...</option>';
  const opcoes = [...louvores]
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map((l) => `<option value="${l.id}">${l.nome}</option>`).join("");
  sel.insertAdjacentHTML("beforeend", opcoes);
}

$("#select-louvor").addEventListener("change", (e) => {
  const id = Number(e.target.value);
  louvorSelecionado = louvores.find((l) => l.id === id) || null;
  atualizarPreview();
});

function atualizarPreview() {
  const preview = $("#preview");
  if (!louvorSelecionado) { preview.hidden = true; $("#btn-salvar").disabled = true; return; }
  preview.hidden = false;
  $("#preview-nome").textContent  = louvorSelecionado.nome;
  $("#preview-atual").textContent = formatarData(louvorSelecionado.ultima_atualizacao);
  $("#preview-nova").textContent  = dataSelecionada ? formatarData(dataSelecionada) : "—";
  $("#btn-salvar").disabled = !dataSelecionada;
}

// ---------- 9. DATEPICKER (calendário customizado) ----------
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
let dpMes = new Date().getMonth();
let dpAno = new Date().getFullYear();

$("#dp-toggle").addEventListener("click", () => {
  const pop = $("#dp-popover");
  pop.hidden = !pop.hidden;
  if (!pop.hidden) renderCalendario();
});
document.addEventListener("click", (e) => {
  if (!$("#datepicker").contains(e.target)) $("#dp-popover").hidden = true;
});
$("#dp-prev").addEventListener("click", () => { dpMes--; if (dpMes<0){dpMes=11;dpAno--;} renderCalendario(); });
$("#dp-next").addEventListener("click", () => { dpMes++; if (dpMes>11){dpMes=0;dpAno++;} renderCalendario(); });
$("#dp-hoje").addEventListener("click", () => {
  const h = new Date();
  selecionarData(h.getFullYear(), h.getMonth(), h.getDate());
});

function renderCalendario() {
  $("#dp-title").textContent = `${MESES[dpMes]} ${dpAno}`;
  const primeiro = new Date(dpAno, dpMes, 1);
  const ultimo  = new Date(dpAno, dpMes + 1, 0);
  const inicioSemana = primeiro.getDay(); // 0=Dom
  const totalDias = ultimo.getDate();
  const hoje = new Date(); hoje.setHours(0,0,0,0);

  let html = "";
  for (let i = 0; i < inicioSemana; i++) html += `<button class="dp__day dp__day--outside" disabled></button>`;
  for (let d = 1; d <= totalDias; d++) {
    const data = new Date(dpAno, dpMes, d);
    const iso = `${dpAno}-${String(dpMes+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const classes = ["dp__day"];
    if (data.getTime() === hoje.getTime()) classes.push("dp__day--hoje");
    if (dataSelecionada === iso) classes.push("dp__day--selecionado");
    const desabilitado = data > hoje ? "disabled" : "";
    html += `<button class="${classes.join(" ")}" ${desabilitado} data-dia="${d}">${d}</button>`;
  }
  $("#dp-grid").innerHTML = html;

  $$("#dp-grid .dp__day:not(:disabled)").forEach((btn) => {
    btn.addEventListener("click", () => selecionarData(dpAno, dpMes, Number(btn.dataset.dia)));
  });
}

function selecionarData(ano, mes, dia) {
  dataSelecionada = `${ano}-${String(mes+1).padStart(2,"0")}-${String(dia).padStart(2,"0")}`;
  dpAno = ano; dpMes = mes;
  $("#dp-label").textContent = formatarData(dataSelecionada);
  $("#dp-popover").hidden = true;
  atualizarPreview();
}

// ---------- 10. SALVAR ----------
$("#btn-salvar").addEventListener("click", async () => {
  if (!louvorSelecionado || !dataSelecionada) return;
  try {
    await salvarNoBanco(louvorSelecionado.id, dataSelecionada);
    louvorSelecionado.ultima_atualizacao = dataSelecionada;
    mostrarToast(`"${louvorSelecionado.nome}" atualizado com sucesso!`);
    renderTabela();
    atualizarPreview();
  } catch (err) {
    mostrarToast("Erro ao salvar. Tente novamente.");
    console.error(err);
  }
});

async function salvarNoBanco(id, dataISO) {
  const { error } = await db // <-- trocado de supabase para db
    .from('musicas')
    .update({ ultima_atualizacao: dataISO })
    .eq('id', id);

  if (error) {
    console.error("Erro ao atualizar no Supabase:", error);
    throw error;
  }
  return true;
}

// ---------- 11. INICIALIZAÇÃO ----------
async function iniciarAplicacao() {
  try {
    const { data, error } = await db // <-- trocado de supabase para db
      .from('musicas')
      .select('*');

    if (error) throw error;

    louvores = data || [];
    popularSelectsDeFiltro();
    popularSelectLouvores();
    renderTabela();
  } catch (err) {
    console.error("Erro ao carregar dados do Supabase:", err);
    mostrarToast("Erro ao carregar músicas do banco.");
  }
}

document.addEventListener("DOMContentLoaded", iniciarAplicacao);