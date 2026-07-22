/* ============================================================
   Repositório Cantai - JS puro
   ------------------------------------------------------------
   MANUTENÇÃO:
   - Para ligar no banco de dados real, substitua "dadosFalsos"
     abaixo por um fetch() na sua API. Ex:
       const louvores = await fetch('/api/louvores').then(r => r.json());
   - Para salvar a data no banco, edite a função salvarNoBanco().
   ============================================================ */

// ---------- 1. DADOS DE TESTE (substitua depois pelo fetch da API) ----------
let louvores = [
  { Id: 1, Nome: "A Alegria",         PrimeiraNota: "G3",     Acorde: "G",  UltimaUtilizacao: "2026-06-15" },
  { Id: 2, Nome: "A Ele a Glória",    PrimeiraNota: "E3",     Acorde: "Em", UltimaUtilizacao: "2026-07-05" },
  { Id: 3, Nome: "Cortaram o Madeiro",PrimeiraNota: "C3 F3",  Acorde: "F",  UltimaUtilizacao: "2026-04-20" },
  { Id: 4, Nome: "Grande é o Senhor", PrimeiraNota: "D3",     Acorde: "D",  UltimaUtilizacao: "2026-07-18" },
  { Id: 5, Nome: "Aleluia",           PrimeiraNota: "A3",     Acorde: "Am", UltimaUtilizacao: "2026-03-02" },
  { Id: 6, Nome: "Santo Espírito",    PrimeiraNota: "C3",     Acorde: "C",  UltimaUtilizacao: null       },
  { Id: 7, Nome: "Digno é o Cordeiro",PrimeiraNota: "F3",     Acorde: "F",  UltimaUtilizacao: "2026-05-28"},
  { Id: 8, Nome: "Rei dos Reis",      PrimeiraNota: "G3",     Acorde: "G",  UltimaUtilizacao: "2025-12-10"},
];

// ---------- 2. ESTADO DA UI ----------
let filtros = { busca: "", acorde: "", nota: "" };
let ordenacao = { campo: "Nome", asc: true };

// ---------- 3. HELPERS ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function formatarData(iso) {
  if (!iso) return "Nunca cantado";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function diasDesde(iso) {
  if (!iso) return null;
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
  const acordes = [...new Set(louvores.map((l) => l.Acorde))].sort();
  const notas   = [...new Set(louvores.map((l) => l.PrimeiraNota))].sort();
  const selA = $("#filtro-acorde");
  const selN = $("#filtro-nota");
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
    if (filtros.busca && !l.Nome.toLowerCase().includes(filtros.busca)) return false;
    if (filtros.acorde && l.Acorde !== filtros.acorde) return false;
    if (filtros.nota && l.PrimeiraNota !== filtros.nota) return false;
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
    tbody.innerHTML = `<tr><td colspan="6" class="vazio">Nenhum louvor encontrado com esses filtros.</td></tr>`;
  } else {
    tbody.innerHTML = lista.map((l) => {
      const dias = diasDesde(l.UltimaUtilizacao);
      const st = statusPorDias(dias);
      return `
        <tr>
          <td>${l.Id}</td>
          <td class="nome">${l.Nome}</td>
          <td><span class="chip">${l.PrimeiraNota}</span></td>
          <td><span class="chip">${l.Acorde}</span></td>
          <td>${formatarData(l.UltimaUtilizacao)}</td>
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
  const opcoes = [...louvores]
    .sort((a, b) => a.Nome.localeCompare(b.Nome))
    .map((l) => `<option value="${l.Id}">${l.Nome}</option>`).join("");
  sel.insertAdjacentHTML("beforeend", opcoes);
}

$("#select-louvor").addEventListener("change", (e) => {
  const id = Number(e.target.value);
  louvorSelecionado = louvores.find((l) => l.Id === id) || null;
  atualizarPreview();
});

function atualizarPreview() {
  const preview = $("#preview");
  if (!louvorSelecionado) { preview.hidden = true; $("#btn-salvar").disabled = true; return; }
  preview.hidden = false;
  $("#preview-nome").textContent  = louvorSelecionado.Nome;
  $("#preview-atual").textContent = formatarData(louvorSelecionado.UltimaUtilizacao);
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
    await salvarNoBanco(louvorSelecionado.Id, dataSelecionada);
    louvorSelecionado.UltimaUtilizacao = dataSelecionada;
    mostrarToast(`"${louvorSelecionado.Nome}" atualizado com sucesso!`);
    renderTabela();
    atualizarPreview();
  } catch (err) {
    mostrarToast("Erro ao salvar. Tente novamente.");
    console.error(err);
  }
});

/**
 * PONTO DE INTEGRAÇÃO COM O BANCO
 * Troque o conteúdo desta função por uma chamada fetch() para sua API.
 * Exemplo:
 *   await fetch(`/api/louvores/${id}`, {
 *     method: 'PATCH',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ UltimaUtilizacao: dataISO })
 *   });
 */
async function salvarNoBanco(id, dataISO) {
  console.log(`[SIMULAÇÃO] Salvando louvor ${id} com data ${dataISO}`);
  await new Promise((r) => setTimeout(r, 300));
  return true;
}

// ---------- 11. INICIALIZAÇÃO ----------
popularSelectsDeFiltro();
popularSelectLouvores();
renderTabela();
