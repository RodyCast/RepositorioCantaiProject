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
let filtros = { busca: "", acorde: "", fluxo: "", status: "" };
let ordenacao = { campo: "nome", asc: true };
let grupoId = null; // grupo de quem está logado (null = visitante)

// ---------- 3. HELPERS ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function formatarData(iso) {
  if (!iso) return "Nunca cantado";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function diasDesde(iso) {
  if (!iso) return 99999;
  const hoje = new Date();
  const data = new Date(iso + "T00:00:00");
  return Math.floor((hoje - data) / (1000 * 60 * 60 * 24));
}

function statusPorDias(dias) {
  if (dias === 99999) return { classe: "status--nunca", texto: "Nunca cantado" };
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
  // Extrai fluxos únicos e ordena numericamente se possível
  const fluxos = [...new Set(louvores.map((l) => l.fluxo_culto))].filter(Boolean).sort((a, b) => {
    const numA = extrairNumeroFluxo(a) || 0;
    const numB = extrairNumeroFluxo(b) || 0;
    return numA - numB;
  });

  const selA = $("#filtro-acorde");
  const selF = $("#filtro-fluxo");
  const selS = $("#filtro-status");
  
  // Limpa opções antigas
  selA.innerHTML = '<option value="">Todos os acordes</option>';
  if (selF) selF.innerHTML = '<option value="">Todos os fluxos</option>';
  if (selS) selS.innerHTML = '<option value="">Todos os status</option>';

  acordes.forEach((a) => selA.insertAdjacentHTML("beforeend", `<option value="${a}">${a}</option>`));
  
  if (selF) {
    fluxos.forEach((f) => selF.insertAdjacentHTML("beforeend", `<option value="${f}">${f}</option>`));
  }

  // Opções padrão de status baseadas na sua regra de dias
  if (selS) {
    selS.insertAdjacentHTML("beforeend", `
      <option value="nunca">Nunca cantado</option>
      <option value="recente">Há menos de 30 dias</option>
      <option value="medio">Entre 30 e 90 dias</option>
      <option value="antigo">Há mais de 90 dias</option>
    `);
  }
}

$("#filtro-busca").addEventListener("input", (e) => { filtros.busca = e.target.value.toLowerCase(); renderTabela(); });
$("#filtro-acorde").addEventListener("change", (e) => { filtros.acorde = e.target.value; renderTabela(); });

// Novos filtros de fluxo e status (substituem o filtro de nota)
$("#filtro-fluxo").addEventListener("change", (e) => { filtros.fluxo = e.target.value; renderTabela(); });
$("#filtro-status").addEventListener("change", (e) => { filtros.status = e.target.value; renderTabela(); });

$("#btn-limpar").addEventListener("click", () => {
  filtros = { busca: "", acorde: "", fluxo: "", status: "" };
  $("#filtro-busca").value = "";
  $("#filtro-acorde").value = "";
  if ($("#filtro-fluxo")) $("#filtro-fluxo").value = "";
  if ($("#filtro-status")) $("#filtro-status").value = "";
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
    
    // Filtro por fluxo
    if (filtros.fluxo && l.fluxo_culto !== filtros.fluxo) return false;

    // Filtro por status (baseado nos dias desde a última utilização)
    if (filtros.status) {
      const dias = diasDesde(l.ultima_utilizacao);
      const st = statusPorDias(dias);
      
      // Mapeia a classe ou condição para o valor selecionado
      if (filtros.status === "nunca" && dias !== 99999) return false;
      if (filtros.status === "recente" && dias > 30) return false;
      if (filtros.status === "medio" && (dias <= 30 || dias > 90)) return false;
      if (filtros.status === "antigo" && (dias <= 90 || dias === 99999)) return false;
    }

    return true;
  });

lista.sort((a, b) => {
  let va = a[ordenacao.campo];
  let vb = b[ordenacao.campo];

  if (ordenacao.campo === "ultima_utilizacao") {
    va = va ? new Date(va + "T00:00:00").getTime() : 0;
    vb = vb ? new Date(vb + "T00:00:00").getTime() : 0;
  } else if (typeof va === "string" && typeof vb === "string") {
    va = va.toLowerCase();
    vb = vb.toLowerCase();
  }

  va = va ?? "";
  vb = vb ?? "";

  if (va < vb) return ordenacao.asc ? -1 : 1;
  if (va > vb) return ordenacao.asc ? 1 : -1;
  return 0;
});

  const tbody = $("#tbody-louvores");
  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="vazio">Nenhum louvor encontrado com esses filtros.</td></tr>`;
  } else {
    tbody.innerHTML = lista.map((l) => {
      const dias = diasDesde(l.ultima_utilizacao);
      const st = statusPorDias(dias);
      
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
          <td class="so-logado">${formatarData(l.ultima_utilizacao)}</td>
          <td class="status so-logado ${st.classe}">${st.texto}</td>
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
  $("#preview-atual").textContent = formatarData(louvorSelecionado.ultima_utilizacao);
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
    louvorSelecionado.ultima_utilizacao = dataSelecionada;
    mostrarToast(`"${louvorSelecionado.nome}" atualizado com sucesso!`);
    renderTabela();
    atualizarPreview();
  } catch (err) {
    mostrarToast("Erro ao salvar. Tente novamente.");
    console.error(err);
  }
});

async function salvarNoBanco(musicaId, dataISO) {
  const { data, error } = await db
    .from('utilizacoes')
    .upsert(
      { musica_id: musicaId, grupo_id: grupoId, ultima_utilizacao: dataISO },
      { onConflict: 'musica_id,grupo_id' }
    )
    .select();

  if (error) {
    console.error("Erro ao salvar no Supabase:", error);
    throw error;
  }
  if (!data || data.length === 0) {
    throw new Error("Nenhuma linha gravada (sem permissão).");
  }
  return true;
}

// ---------- 11. INICIALIZAÇÃO E LOGIN ----------

// Busca as músicas e, se houver login, as datas do grupo da pessoa
async function carregarDados() {
  const { data: musicas, error } = await db.from('musicas').select('*');
  if (error) throw error;

  const datas = {};
  grupoId = null;

  const { data: { session } } = await db.auth.getSession();
  if (session) {
    const { data: perfil, error: e1 } = await db
      .from('perfis')
      .select('grupo_id')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (e1) throw e1;

    if (!perfil) {
      await db.auth.signOut();
      throw new Error("Usuário sem grupo vinculado.");
    }
    grupoId = perfil.grupo_id;

    const { data: uts, error: e2 } = await db
      .from('utilizacoes')
      .select('musica_id, ultima_utilizacao')
      .eq('grupo_id', grupoId);
    if (e2) throw e2;

    uts.forEach((u) => { datas[u.musica_id] = u.ultima_utilizacao; });
  }

  // Junta música + data do grupo (em C#, seria um Join).
  // O "...m" copia todos os campos da música; depois sobrescrevemos a data.
  louvores = musicas.map((m) => ({ ...m, ultima_utilizacao: datas[m.id] ?? null }));
}

// Recarrega dados e redesenha a tela conforme o estado de login
async function recarregarTudo() {
  await carregarDados();
  const logado = grupoId !== null;

  document.body.classList.toggle("logado", logado);
  atualizarCaixas();

  // zera filtros, ordenação por data e seleção da aba Atualizar
  filtros = { busca: "", acorde: "", fluxo: "", status: "" };
  $("#filtro-busca").value = "";
  if (!logado && ordenacao.campo === "ultima_utilizacao") {
    ordenacao = { campo: "nome", asc: true };
  }
  louvorSelecionado = null;
  dataSelecionada = null;
  $("#dp-label").textContent = "Selecione uma data";

  popularSelectsDeFiltro();
  popularSelectLouvores();
  renderTabela();
  atualizarPreview();
  inicializarFluxo();
}

async function iniciarAplicacao() {
  try {
    await recarregarTudo();
  } catch (err) {
    console.error("Erro ao carregar dados do Supabase:", err);
    mostrarToast("Erro ao carregar músicas do banco.");
  }
}

async function fazerLogin() {
  const email = $("#login-email").value.trim();
  const password = $("#login-senha").value;

  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    mostrarToast("E-mail ou senha incorretos.");
    return;
  }
  $("#login-senha").value = "";
  try {
    await recarregarTudo();
    mostrarToast("Login realizado!");
  } catch (err) {
    console.error(err);
    mostrarToast("Erro ao carregar os dados do seu grupo.");
  }
}

$("#btn-login").addEventListener("click", fazerLogin);
$("#login-senha").addEventListener("keydown", (e) => {
  if (e.key === "Enter") fazerLogin();
});

$("#btn-logout").addEventListener("click", async () => {
  await db.auth.signOut();
  await recarregarTudo();
  mostrarToast("Você saiu.");
});

// ---------- 11.1 REDEFINIÇÃO DE SENHA ----------
let pedindoLink = false;    // true = mostrando a caixa "Enviar link"
let emRecuperacao = false;  // true = a pessoa chegou pelo link do e-mail

// Decide qual caixa da aba "Atualizar Data" fica visível
function atualizarCaixas() {
  const logado = grupoId !== null;
  $("#login-box").hidden      = logado || pedindoLink || emRecuperacao;
  $("#recuperar-box").hidden  = logado || !pedindoLink || emRecuperacao;
  $("#nova-senha-box").hidden = !emRecuperacao;
  $("#area-atualizar").hidden = !logado || emRecuperacao;
}

$("#btn-esqueci").addEventListener("click", () => {
  pedindoLink = true;
  $("#recuperar-email").value = $("#login-email").value;
  atualizarCaixas();
});

$("#btn-voltar-login").addEventListener("click", () => {
  pedindoLink = false;
  atualizarCaixas();
});

$("#btn-enviar-link").addEventListener("click", async () => {
  const email = $("#recuperar-email").value.trim();
  if (!email) { mostrarToast("Informe seu e-mail."); return; }

  const btn = $("#btn-enviar-link");
  btn.disabled = true;
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  });
  btn.disabled = false;

  if (error) {
    console.error(error);
    mostrarToast("Não foi possível enviar agora. Tente novamente em alguns minutos.");
    return;
  }
  // Mesma mensagem exista o e-mail ou não, para não revelar quem tem cadastro
  mostrarToast("Se o e-mail estiver cadastrado, você receberá o link em instantes.");
});

// O Supabase dispara este evento quando a pessoa chega pelo link do e-mail
db.auth.onAuthStateChange((evento) => {
  if (evento === "PASSWORD_RECOVERY") {
    emRecuperacao = true;
    $('.tab[data-tab="atualizar"]').click();  // abre a aba certa
    atualizarCaixas();
  }
});

async function salvarNovaSenha() {
  const senha = $("#nova-senha").value;
  const confirma = $("#nova-senha-confirma").value;

  if (senha.length < 6) { mostrarToast("A senha precisa ter pelo menos 6 caracteres."); return; }
  if (senha !== confirma) { mostrarToast("As senhas não são iguais."); return; }

  const { error } = await db.auth.updateUser({ password: senha });
  if (error) {
    console.error(error);
    mostrarToast("Não foi possível salvar a senha. Peça um novo link e tente de novo.");
    return;
  }

  $("#nova-senha").value = "";
  $("#nova-senha-confirma").value = "";
  emRecuperacao = false;
  history.replaceState(null, "", window.location.pathname + window.location.search); // limpa o token da URL
  atualizarCaixas();
  mostrarToast("Senha alterada com sucesso!");
}

$("#btn-salvar-senha").addEventListener("click", salvarNovaSenha);
$("#nova-senha-confirma").addEventListener("keydown", (e) => {
  if (e.key === "Enter") salvarNovaSenha();
});

// ---------- 12. ABA FLUXO DO CULTO ----------

// Estrutura padrão do culto no Centro
// tipo: 'musica' (permite selecionar música e adicionar extras) ou 'titulo' (título fixo do culto)
const ESTRUTURA_PADRAO_FLUXO = [
  { tipo: 'musica', grupo: 'inicial' },
  { tipo: 'titulo', texto: 'Abertura' },
  { tipo: 'musica', grupo: 'abertura_1' },
  { tipo: 'musica', grupo: 'abertura_2' },
  { tipo: 'musica', grupo: 'abertura_3' },
  { tipo: 'musica', grupo: 'abertura_4' },
  { tipo: 'titulo', texto: 'Ceia' },
  { tipo: 'musica', grupo: 'ceia' },
  { tipo: 'titulo', texto: 'Oferta' },
  { tipo: 'musica', grupo: 'oferta' },
  { tipo: 'titulo', texto: 'Visitantes' },
  { tipo: 'musica', grupo: 'visitantes' },
  { tipo: 'titulo', texto: 'Leitura/Mensagem' },
  { tipo: 'musica', grupo: 'mensagem_1' },
  { tipo: 'musica', grupo: 'mensagem_2' },
  { tipo: 'musica', grupo: 'mensagem_3' },
  { tipo: 'musica', grupo: 'mensagem_4' },
  { tipo: 'musica', grupo: 'mensagem_5' }
];

let fluxoCulto = [];

function inicializarFluxo() {
  // Carrega do localStorage se já houver algo salvo, senão usa o padrão
  const salvo = localStorage.getItem('cantai_fluxo_culto');
  if (salvo) {
    try {
      fluxoCulto = JSON.parse(salvo);
    } catch (e) {
      fluxoCulto = JSON.parse(JSON.stringify(ESTRUTURA_PADRAO_FLUXO));
    }
  } else {
    fluxoCulto = JSON.parse(JSON.stringify(ESTRUTURA_PADRAO_FLUXO));
  }
  renderFluxo();
}

function salvarFluxoLocal() {
  localStorage.setItem('cantai_fluxo_culto', JSON.stringify(fluxoCulto));
}

function renderFluxo() {
  const tbody = $("#tbody-fluxo");
  let html = "";
  let contadorMusica = 1;

  // Cria a lista de opções para o datalist apenas com o nome (e acorde opcional)
  const datalistOpcoes = [...louvores]
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map(l => `<option value="${l.nome}${l.acorde ? ` (${l.acorde})` : ''}"></option>`)
    .join("");

  let datalistHtml = `<datalist id="lista-louvores-fluxo">${datalistOpcoes}</datalist>`;

  fluxoCulto.forEach((item, index) => {
    if (item.tipo === 'titulo') {
      html += `
        <tr class="tr-titulo">
          <td colspan="4"><strong>${item.texto}</strong></td>
        </tr>
      `;
    } else {
      // Busca o nome formatado da música selecionada para exibir no input
      let textoInput = "";
      if (item.musicaId) {
        const m = louvores.find(l => l.id === item.musicaId);
        if (m) textoInput = `${m.nome}${m.acorde ? ` (${m.acorde})` : ''}`;
      }

      html += `
        <tr data-index="${index}">
          <td class="td-ordem">#${contadorMusica}</td>
          <td><span class="badge-slot">Espaço para música</span></td>
          <td>
            <input type="text" class="input-fluxo-musica" data-index="${index}" list="lista-louvores-fluxo" value="${textoInput}" placeholder="Digite o nome do louvor..." autocomplete="off">
          </td>
          <td>
            <div class="acoes-fluxo">
              <button type="button" class="btn btn--ghost btn--sm btn-add-mais" data-index="${index}" title="Adicionar música logo abaixo">+</button>
              ${item.extra ? `<button type="button" class="btn btn--ghost btn--sm btn-remover-extra" data-index="${index}" title="Remover esta linha">×</button>` : ''}
            </div>
          </td>
        </tr>
      `;
      contadorMusica++;
    }
  });

  tbody.innerHTML = html + datalistHtml;

  renderizarGraficoFluxo();

  // Evento para validar e salvar quando o usuário seleciona ou digita o nome
  document.querySelectorAll(".input-fluxo-musica").forEach(input => {
    const idx = input.dataset.index;

    input.addEventListener("input", (e) => {
      const valorDigitado = e.target.value.trim();
      
      if (!valorDigitado) {
        fluxoCulto[idx].musicaId = null;
        salvarFluxoLocal();
        renderizarGraficoFluxo();
        return;
      }

      // Tenta encontrar a música correspondente pelo nome exato (ignorando maiúsculas/minúsculas)
      // O valor do input vem no formato "Nome (Acorde)" ou apenas "Nome"
      const encontrada = louvores.find(l => {
        const nomeFormatado = `${l.nome}${l.acorde ? ` (${l.acorde})` : ''}`;
        return nomeFormatado.toLowerCase() === valorDigitado.toLowerCase() || l.nome.toLowerCase() === valorDigitado.toLowerCase();
      });

      if (encontrada) {
        fluxoCulto[idx].musicaId = encontrada.id;
        salvarFluxoLocal();
        renderizarGraficoFluxo();
      } else {
        // Se ainda está digitando e não achou correspondência exata, limpa temporariamente o ID
        fluxoCulto[idx].musicaId = null;
        renderizarGraficoFluxo();
      }
    });

    // Ao sair do campo (blur), garante que se o usuário digitou algo inválido que não existe na lista, o campo é limpo
    input.addEventListener("change", (e) => {
      const valorDigitado = e.target.value.trim();
      if (!valorDigitado) {
        fluxoCulto[idx].musicaId = null;
        salvarFluxoLocal();
        renderizarGraficoFluxo();
        return;
      }

      const encontrada = louvores.find(l => {
        const nomeFormatado = `${l.nome}${l.acorde ? ` (${l.acorde})` : ''}`;
        return nomeFormatado.toLowerCase() === valorDigitado.toLowerCase() || l.nome.toLowerCase() === valorDigitado.toLowerCase();
      });

      if (encontrada) {
        fluxoCulto[idx].musicaId = encontrada.id;
        input.value = `${encontrada.nome}${encontrada.acorde ? ` (${encontrada.acorde})` : ''}`;
      } else {
        fluxoCulto[idx].musicaId = null;
        input.value = "";
        mostrarToast("Música não encontrada. Selecione uma da lista.");
      }
      salvarFluxoLocal();
      renderizarGraficoFluxo();
    });
  });

  // Evento para adicionar música extra logo abaixo
  document.querySelectorAll(".btn-add-mais").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = Number(e.target.dataset.index);
      fluxoCulto.splice(idx + 1, 0, { tipo: 'musica', musicaId: null, extra: true });
      salvarFluxoLocal();
      renderFluxo();
      renderizarGraficoFluxo();
    });
  });

  // Evento para remover música extra criada
  document.querySelectorAll(".btn-remover-extra").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = Number(e.target.dataset.index);
      fluxoCulto.splice(idx, 1);
      salvarFluxoLocal();
      renderFluxo();
      renderizarGraficoFluxo();
    });
  });
}

// Função auxiliar para extrair o número do fluxo (ex: "Contemplação 05" vira 5)
function extrairNumeroFluxo(fluxoTexto) {
  if (!fluxoTexto) return null;
  const match = fluxoTexto.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function renderizarGraficoFluxo() {
  const gElementos = $("#grafico-elementos");
  const divLegenda = $("#grafico-legenda");
  if (!gElementos) return;

  // Filtra apenas os itens que são músicas e que têm uma música selecionada
  const musicasNoFluxo = fluxoCulto
    .filter(item => item.tipo === 'musica')
    .map(item => {
      if (!item.musicaId) return { valor: null, nome: "Espaço vazio" };
      const m = louvores.find(l => l.id === item.musicaId);
      const valorFluxo = m ? extrairNumeroFluxo(m.fluxo_culto) : null;
      return {
        valor: valorFluxo,
        nome: m ? m.nome : "Desconhecida"
      };
    });

  const total = musicasNoFluxo.length;
  if (total === 0) {
    gElementos.innerHTML = `<text x="300" y="75" text-anchor="middle" fill="#94a3b8" font-size="14">Preencha o fluxo para ver a curva do culto</text>`;
    divLegenda.innerHTML = "<p>Nenhuma música selecionada no momento.</p>";
    return;
  }

  // Dimensões da viewBox do SVG: Largura 600, Altura 150
  const larguraSvg = 600;
  const alturaSvg = 150;
  const paddingX = 40;
  const larguraUtil = larguraSvg - (paddingX * 2);

  let pontosCoordenadas = [];
  musicasNoFluxo.forEach((item, index) => {
    // Calcula a posição X proporcional ao número de músicas
    const x = total === 1 ? larguraSvg / 2 : paddingX + (index / (total - 1)) * larguraUtil;
    
    // Calcula a posição Y (Escala de 1 a 10: 10 fica em cima, 1 fica embaixo)
    // Invertemos o eixo Y do SVG (0 é em cima, 150 é embaixo)
    let y = alturaSvg / 2; // Padrão no meio se não tiver valor
    if (item.valor !== null) {
      // Mapeia 1 a 10 para a altura do SVG (deixando margens de 15px em cima e embaixo)
      const minY = 20;
      const maxY = alturaSvg - 20;
      y = maxY - ((item.valor - 1) / 9) * (maxY - minY);
    }

    pontosCoordenadas.push({ x, y, ...item });
  });

  // Monta o caminho da linha (path d="M x y L x y ...")
  let pathD = "";
  let circulosHtml = "";

  pontosCoordenadas.forEach((p, i) => {
    if (p.valor !== null) {
      if (!pathD) {
        pathD = `M ${p.x} ${p.y}`;
      } else {
        pathD += ` L ${p.x} ${p.y}`;
      }
      circulosHtml += `<circle cx="${p.x}" cy="${p.y}" r="6" class="ponto-grafico" data-nome="${p.nome}" data-valor="${p.valor}"><title>${p.nome} (Fluxo: ${p.valor})</title></circle>`;
    }
  });

  let svgContent = "";
  if (pathD) {
    // Desenha a linha de tendência conectando os pontos válidos
    svgContent += `<path d="${pathD}" fill="none" stroke="#2563eb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`;
  }
  svgContent += circulosHtml;

  gElementos.innerHTML = svgContent;

  // Análise simples para dar feedback ao usuário sobre o formato de sorriso
  const valoresValidos = musicasNoFluxo.filter(m => m.valor !== null).map(m => m.valor);
  let analiseTexto = "Continue preenchendo o fluxo para avaliar o formato.";
  
  if (valoresValidos.length >= 3) {
    const inicio = valoresValidos[0];
    const meio = valoresValidos[Math.floor(valoresValidos.length / 2)];
    const fim = valoresValidos[valoresValidos.length - 1];

    if (inicio >= 6 && meio <= 5 && fim >= 6) {
      analiseTexto = "✨ **Perfeito!** O formato está em 'sorriso' (Início festivo, momento contemplativo no meio e encerramento festivo).";
    } else {
      analiseTexto = "💡 **Dica:** Tente colocar músicas mais contemplativas (1-5) no meio do culto e celebrações (6-10) no início e no fim.";
    }
  }

  divLegenda.innerHTML = `<p>${analiseTexto}</p>`;
}

// Botão limpar fluxo completo (volta ao padrão)
$("#btn-limpar-fluxo").addEventListener("click", () => {
  if (confirm("Deseja realmente redefinir o fluxo do culto para o padrão?")) {
    fluxoCulto = JSON.parse(JSON.stringify(ESTRUTURA_PADRAO_FLUXO));
    salvarFluxoLocal();
    renderFluxo();
    renderizarGraficoFluxo();
    mostrarToast("Fluxo redefinido para o padrão.");
  }
});

document.addEventListener("DOMContentLoaded", iniciarAplicacao);