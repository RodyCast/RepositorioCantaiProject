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
let podeEditarMusicas = false;
let emailUsuario = "";
let nomeGrupo = "";

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
const posicaoPorAba = {};     // guarda o scroll de cada aba (como um Dictionary<string, int>)
let abaAtual = "repositorio"; // aba que começa ativa

$$(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const nova = btn.dataset.tab;
    if (nova === abaAtual) return;

    // 1) Salva a posição da aba que está saindo, ANTES de esconder o painel
    posicaoPorAba[abaAtual] = window.scrollY;

    // 2) Troca de aba (igual ao que já existia)
    $$(".tab").forEach((b) => b.classList.remove("tab--active"));
    $$(".panel").forEach((p) => p.classList.remove("panel--active"));
    btn.classList.add("tab--active");
    $(`#panel-${nova}`).classList.add("panel--active");
    abaAtual = nova;

    // 3) Restaura a posição da aba que está entrando (0 se nunca foi visitada)
    window.scrollTo({ top: posicaoPorAba[nova] ?? 0, behavior: "instant" });
  });
});

// Marca a barra de abas quando ela gruda no topo
const sentinela = $("#tabs-sentinela");
const barraAbas = $("#tabs-barra");

new IntersectionObserver(([entrada]) => {
  // Fora da tela por ter passado do topo = barra grudada
  const grudada = !entrada.isIntersecting && entrada.boundingClientRect.top < 0;
  barraAbas.classList.toggle("tabs-barra--grudada", grudada);
}).observe(sentinela);

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
  podeEditarMusicas = false;
  emailUsuario = "";
  nomeGrupo = "";

  const { data: { session } } = await db.auth.getSession();
  if (session) {
    emailUsuario = session.user.email ?? "";
    // grupos(nome) traz o nome do grupo junto, pela chave grupo_id (em SQL, um JOIN)
    const { data: perfil, error: e1 } = await db
      .from('perfis')
      .select('grupo_id, pode_editar_musicas, grupos(nome)')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (e1) throw e1;

    if (!perfil) {
      await db.auth.signOut();
      throw new Error("Usuário sem grupo vinculado.");
    }
    grupoId = perfil.grupo_id;
    podeEditarMusicas = perfil.pode_editar_musicas === true;
    nomeGrupo = perfil.grupos?.nome ?? "";

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
  document.body.classList.toggle("editor", podeEditarMusicas);
  atualizarSessao();

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
  await inicializarFluxo();
  popularAbaMusicas();

  // quem saiu (ou entrou sem permissão) não pode continuar numa aba restrita
  if (!podeEditarMusicas && abaAtual === "musicas") $('.tab[data-tab="repositorio"]').click();
  if (!logado && abaAtual === "atualizar") $('.tab[data-tab="repositorio"]').click();
}

async function iniciarAplicacao() {
  try {
    await recarregarTudo();
  } catch (err) {
    console.error("Erro ao carregar dados do Supabase:", err);
    mostrarToast("Erro ao carregar músicas do banco.");
  }
}

// ---------- 11.1 JANELA DE LOGIN ----------
const authDialog = $("#auth-dialog");

// Mostra só uma etapa da janela: "entrar", "recuperar", "enviado" ou "nova-senha"
function mostrarEtapa(nome) {
  authDialog.querySelectorAll(".auth__etapa").forEach((el) => {
    el.hidden = el.dataset.etapa !== nome;
  });
  authDialog.querySelectorAll(".auth__erro").forEach((el) => (el.hidden = true));
  const primeiro = authDialog.querySelector(`[data-etapa="${nome}"] input`);
  if (primeiro) primeiro.focus();
}

function abrirLogin() {
  if (!authDialog.open) authDialog.showModal();
  mostrarEtapa("entrar");
}

function fecharLogin() {
  authDialog.close();
}

$("#btn-abrir-login").addEventListener("click", abrirLogin);
$("#auth-fechar").addEventListener("click", fecharLogin);

// Clique no fundo escurecido (fora da caixa) fecha a janela
authDialog.addEventListener("click", (e) => {
  if (e.target === authDialog) fecharLogin();
});

function mostrarErro(id, msg) {
  const el = $(id);
  el.textContent = msg;
  el.hidden = false;
}

// Desabilita o botão e mostra o spinner enquanto espera o Supabase
function carregando(btn, ativo) {
  btn.disabled = ativo;
  btn.classList.toggle("btn--carregando", ativo);
}

// Botão de olho: mostra/esconde a senha
$$(".campo-senha__olho").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.alvo);
    const mostrar = input.type === "password";
    input.type = mostrar ? "text" : "password";
    btn.classList.toggle("campo-senha__olho--ativo", mostrar);
    btn.setAttribute("aria-label", mostrar ? "Esconder senha" : "Mostrar senha");
  });
});

$("#form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#login-email").value.trim();
  const password = $("#login-senha").value;
  if (!email || !password) { mostrarErro("#login-erro", "Preencha e-mail e senha."); return; }

  const btn = $("#btn-login");
  carregando(btn, true);
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    carregando(btn, false);
    mostrarErro("#login-erro", "E-mail ou senha incorretos.");
    return;
  }

  try {
    await recarregarTudo();
  } catch (err) {
    console.error(err);
    carregando(btn, false);
    mostrarErro("#login-erro", "Não foi possível carregar os dados do seu grupo.");
    return;
  }

  carregando(btn, false);
  $("#login-senha").value = "";
  fecharLogin();
  mostrarToast("Login realizado!");
});

$("#btn-esqueci").addEventListener("click", () => {
  $("#recuperar-email").value = $("#login-email").value;
  mostrarEtapa("recuperar");
});

$("#btn-voltar-login").addEventListener("click", () => mostrarEtapa("entrar"));
$("#btn-enviado-voltar").addEventListener("click", () => mostrarEtapa("entrar"));

$("#form-recuperar").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#recuperar-email").value.trim();
  if (!email) { mostrarErro("#recuperar-erro", "Informe seu e-mail."); return; }

  const btn = $("#btn-enviar-link");
  carregando(btn, true);
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  });
  carregando(btn, false);

  if (error) {
    console.error(error);
    mostrarErro("#recuperar-erro", "Não foi possível enviar agora. Tente novamente em alguns minutos.");
    return;
  }
  // Mesma mensagem exista o e-mail ou não, para não revelar quem tem cadastro
  $("#enviado-email").textContent = email;
  mostrarEtapa("enviado");
});

// O Supabase dispara este evento quando a pessoa chega pelo link do e-mail
db.auth.onAuthStateChange((evento) => {
  if (evento === "PASSWORD_RECOVERY") {
    if (!authDialog.open) authDialog.showModal();
    mostrarEtapa("nova-senha");
  }
});

$("#form-nova-senha").addEventListener("submit", async (e) => {
  e.preventDefault();
  const senha = $("#nova-senha").value;
  const confirma = $("#nova-senha-confirma").value;

  if (senha.length < 6) { mostrarErro("#nova-senha-erro", "A senha precisa ter pelo menos 6 caracteres."); return; }
  if (senha !== confirma) { mostrarErro("#nova-senha-erro", "As senhas não são iguais."); return; }

  const btn = $("#btn-salvar-senha");
  carregando(btn, true);
  const { error } = await db.auth.updateUser({ password: senha });
  carregando(btn, false);
  if (error) {
    console.error(error);
    mostrarErro("#nova-senha-erro", "Não foi possível salvar a senha. Peça um novo link e tente de novo.");
    return;
  }

  $("#nova-senha").value = "";
  $("#nova-senha-confirma").value = "";
  history.replaceState(null, "", window.location.pathname + window.location.search); // limpa o token da URL
  fecharLogin();
  mostrarToast("Senha alterada com sucesso!");
});

// ---------- 11.2 SESSÃO (botão Entrar / chip com menu) ----------
const sessaoChip = $("#sessao-chip");
const sessaoMenu = $("#sessao-menu");

// Atualiza o chip com as iniciais e o e-mail de quem está logado
function atualizarSessao() {
  $("#sessao-iniciais").textContent = (emailUsuario[0] ?? "?").toUpperCase();
  $("#sessao-email").textContent = emailUsuario || "—";
  $("#sessao-grupo").textContent = nomeGrupo;
  $("#sessao-grupo").hidden = !nomeGrupo;
  sessaoChip.title = emailUsuario;
  fecharMenuSessao();
}

function fecharMenuSessao() {
  sessaoMenu.hidden = true;
  sessaoChip.setAttribute("aria-expanded", "false");
}

sessaoChip.addEventListener("click", (e) => {
  e.stopPropagation();
  const abrir = sessaoMenu.hidden;
  sessaoMenu.hidden = !abrir;
  sessaoChip.setAttribute("aria-expanded", String(abrir));
});

// Fecha o menu ao clicar fora dele ou apertar Esc
document.addEventListener("click", (e) => {
  if (!sessaoMenu.hidden && !sessaoMenu.contains(e.target)) fecharMenuSessao();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") fecharMenuSessao();
});

$("#btn-logout").addEventListener("click", async () => {
  fecharMenuSessao();
  await db.auth.signOut();
  await recarregarTudo();
  mostrarToast("Você saiu.");
});

// ---------- 12. ABA FLUXO DO CULTO ----------
// O fluxo tem duas partes:
// - o MODELO (momentos do culto e quantas músicas cada um tem), salvo no banco
//   por grupo, na tabela modelos_fluxo;
// - as MÚSICAS escolhidas, salvas só neste navegador (localStorage).
// Visitantes usam o modelo do grupo 1: podem editá-lo na tela, mas não salvar.
// Mudanças de modelo não salvas se perdem ao recarregar a página ou entrar/sair.

const GRUPO_MODELO_PADRAO = 1;
const MAX_MUSICAS_POR_SECAO = 10;

// Usado se o banco não responder ou ainda não tiver o modelo do grupo 1
const MODELO_PADRAO_FLUXO = [
  { id: "inicio",     titulo: "Início",           qtd_musicas: 1 },
  { id: "abertura",   titulo: "Abertura",         qtd_musicas: 4 },
  { id: "ceia",       titulo: "Ceia",             qtd_musicas: 1 },
  { id: "oferta",     titulo: "Oferta",           qtd_musicas: 1 },
  { id: "visitantes", titulo: "Visitantes",       qtd_musicas: 1 },
  { id: "mensagem",   titulo: "Leitura/Mensagem", qtd_musicas: 5 }
];

let modeloBanco = [];         // como o modelo está salvo no banco
let modeloAtual = [];         // o que está na tela (pode ter mudanças não salvas)
let rascunhoModelo = null;    // cópia em edição (null = fora do modo de edição)
let modeloEhDoGrupo = false;  // true se o grupo do usuário já salvou um modelo próprio
let modeloAtualizadoEm = null;
let musicasFluxo = {};        // { idDoMomento: [idDaMusica | null, ...] }

const copiar = (obj) => JSON.parse(JSON.stringify(obj));
const mesmoModelo = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const rotuloLouvor = (l) => `${l.nome}${l.acorde ? ` (${l.acorde})` : ""}`;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function escaparHtml(texto) {
  const mapa = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(texto ?? "").replace(/[&<>"']/g, (c) => mapa[c]);
}

function novoIdSecao() {
  return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Aceita o valor digitado no formato "Nome (Acorde)" ou só "Nome"
function encontrarLouvor(valor) {
  const v = valor.trim().toLowerCase();
  return louvores.find((l) => rotuloLouvor(l).toLowerCase() === v || l.nome.toLowerCase() === v);
}

// Confere o JSON vindo do banco, para um registro mal formado não quebrar a tela
function normalizarSecoes(secoes) {
  if (!Array.isArray(secoes)) return null;
  const validas = secoes
    .filter((s) => s && typeof s.id === "string" && typeof s.titulo === "string")
    .map((s) => ({
      id: s.id,
      titulo: s.titulo,
      qtd_musicas: Math.max(0, Math.min(MAX_MUSICAS_POR_SECAO, Math.trunc(Number(s.qtd_musicas)) || 0))
    }));
  return validas.length ? validas : null;
}

// ----- 12.1 Carregar e salvar -----

// Busca o modelo do grupo de quem está logado; se não houver, o do grupo 1
async function carregarModeloFluxo() {
  modeloEhDoGrupo = false;
  modeloAtualizadoEm = null;
  const grupos = grupoId !== null && grupoId !== GRUPO_MODELO_PADRAO
    ? [grupoId, GRUPO_MODELO_PADRAO]
    : [GRUPO_MODELO_PADRAO];

  try {
    const { data, error } = await db
      .from("modelos_fluxo")
      .select("grupo_id, secoes, atualizado_em")
      .in("grupo_id", grupos);
    if (error) throw error;

    const doGrupo = grupoId !== null ? data.find((m) => m.grupo_id === grupoId) : null;
    const escolhido = doGrupo ?? data.find((m) => m.grupo_id === GRUPO_MODELO_PADRAO);
    const secoes = normalizarSecoes(escolhido?.secoes);
    if (secoes) {
      modeloEhDoGrupo = !!doGrupo;
      modeloAtualizadoEm = escolhido.atualizado_em;
      return secoes;
    }
  } catch (err) {
    console.error("Erro ao carregar o modelo do fluxo:", err);
    mostrarToast("Não foi possível carregar o modelo do culto. Usando o padrão.");
  }
  return copiar(MODELO_PADRAO_FLUXO);
}

async function salvarModeloNoGrupo(secoes, btn) {
  if (grupoId === null) return;
  if (!(await confirmarSalvarModelo())) return;

  carregando(btn, true);
  try {
    const agora = new Date().toISOString();
    const { data, error } = await db
      .from("modelos_fluxo")
      .upsert({ grupo_id: grupoId, secoes, atualizado_em: agora }, { onConflict: "grupo_id" })
      .select("grupo_id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Nenhuma linha gravada (sem permissão).");

    modeloBanco = copiar(secoes);
    modeloAtual = copiar(secoes);
    rascunhoModelo = null;
    modeloEhDoGrupo = true;
    modeloAtualizadoEm = agora;
    renderFluxo();
    mostrarToast(`Modelo salvo para o grupo ${nomeGrupo}.`);
  } catch (err) {
    console.error("Erro ao salvar o modelo do fluxo:", err);
    mostrarToast("Erro ao salvar o modelo. Tente novamente.");
  } finally {
    carregando(btn, false);
  }
}

// As músicas escolhidas ficam separadas por grupo (ou "visitante") neste navegador
const chaveFluxoLocal = () => `cantai_fluxo_culto_${grupoId ?? "visitante"}`;

function carregarMusicasLocal() {
  musicasFluxo = {};
  try {
    const salvo = localStorage.getItem(chaveFluxoLocal());
    if (salvo) {
      const obj = JSON.parse(salvo);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) musicasFluxo = obj;
    } else {
      migrarFluxoAntigo();
    }
  } catch {
    musicasFluxo = {};
  }
}

function salvarMusicasLocal() {
  try { localStorage.setItem(chaveFluxoLocal(), JSON.stringify(musicasFluxo)); } catch { /* sem armazenamento */ }
}

// A versão anterior guardava uma lista única (títulos + músicas) em 'cantai_fluxo_culto'.
// Converte para o formato novo, usando os ids do modelo padrão.
function migrarFluxoAntigo() {
  const antigo = localStorage.getItem("cantai_fluxo_culto");
  if (!antigo) return;
  localStorage.removeItem("cantai_fluxo_culto");
  const lista = JSON.parse(antigo);
  if (!Array.isArray(lista)) return;

  const idPorTitulo = {
    "Abertura": "abertura", "Ceia": "ceia", "Oferta": "oferta",
    "Visitantes": "visitantes", "Leitura/Mensagem": "mensagem"
  };
  let secaoId = "inicio";
  lista.forEach((item) => {
    if (item.tipo === "titulo") { secaoId = idPorTitulo[item.texto] ?? secaoId; return; }
    (musicasFluxo[secaoId] ??= []).push(item.musicaId ?? null);
  });
  salvarMusicasLocal();
}

// Linhas de música de um momento: no mínimo a quantidade do modelo,
// mais as extras que a pessoa adicionou com o "+"
function linhasDaSecao(secao) {
  if (secao.qtd_musicas === 0) return [];
  const salvas = musicasFluxo[secao.id] ?? [];
  return Array.from({ length: Math.max(secao.qtd_musicas, salvas.length) }, (_, i) => salvas[i] ?? null);
}

async function inicializarFluxo() {
  rascunhoModelo = null;
  modeloBanco = await carregarModeloFluxo();
  modeloAtual = copiar(modeloBanco);
  carregarMusicasLocal();
  renderFluxo();
}

// ----- 12.2 Desenho da tela -----

const secoesEl = $("#fluxo-secoes");

function renderFluxo() {
  const editando = rascunhoModelo !== null;
  $("#fluxo-acoes-montar").hidden = editando;
  $("#fluxo-acoes-editar").hidden = !editando;
  $("#fluxo-subtitulo").textContent = editando
    ? "Renomeie, reordene, adicione ou remova momentos e defina quantas músicas cada um tem."
    : "Escolha os louvores de cada momento do culto.";
  secoesEl.classList.toggle("fluxo-secoes--editando", editando);
  atualizarInfoModelo();

  $("#lista-louvores-fluxo").innerHTML = [...louvores]
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map((l) => `<option value="${escaparHtml(rotuloLouvor(l))}"></option>`)
    .join("");

  secoesEl.innerHTML = editando ? htmlEdicaoModelo() : htmlMontarFluxo();
  renderizarGraficoFluxo();
}

// Etiqueta de origem do modelo e aviso de "modelo alterado"
function atualizarInfoModelo() {
  const logado = grupoId !== null;
  let origem = "Modelo padrão";
  if (logado) origem = modeloEhDoGrupo ? `Modelo do grupo ${nomeGrupo}` : "Modelo padrão (seu grupo ainda não salvou um)";
  $("#fluxo-origem").textContent = origem;

  $("#fluxo-aviso").hidden = rascunhoModelo !== null || mesmoModelo(modeloAtual, modeloBanco);
  $("#fluxo-aviso-texto").textContent = logado
    ? "Modelo alterado nesta tela, ainda não salvo para o grupo."
    : "Modelo alterado nesta tela. Visitantes não podem salvar o modelo.";
  $("#btn-restaurar-modelo").textContent = logado && modeloEhDoGrupo ? "Restaurar modelo do grupo" : "Restaurar modelo padrão";
}

function htmlMontarFluxo() {
  let ordem = 1;
  return modeloAtual.map((secao) => {
    const linhas = linhasDaSecao(secao);
    const id = escaparHtml(secao.id);
    const cabecalho = `
      <header class="secao__cabecalho">
        <h3 class="secao__titulo">${escaparHtml(secao.titulo)}</h3>
        <span class="secao__info">${linhas.length ? plural(linhas.length, "música", "músicas") : "Sem música"}</span>
      </header>`;
    if (!linhas.length) return `<article class="secao secao--marcador">${cabecalho}</article>`;

    const podeRemover = linhas.length > secao.qtd_musicas;
    const itens = linhas.map((musicaId, pos) => {
      const m = musicaId ? louvores.find((l) => l.id === musicaId) : null;
      return `
        <li class="secao__linha">
          <span class="secao__ordem">#${ordem++}</span>
          <input type="text" class="input-fluxo-musica" data-secao="${id}" data-pos="${pos}"
            list="lista-louvores-fluxo" value="${m ? escaparHtml(rotuloLouvor(m)) : ""}"
            placeholder="Digite o nome do louvor..." autocomplete="off"
            aria-label="${escaparHtml(secao.titulo)}, música ${pos + 1}">
          <div class="acoes-fluxo">
            <button type="button" class="btn btn--ghost btn--sm btn-add-mais" data-secao="${id}" data-pos="${pos}" title="Adicionar música logo abaixo" aria-label="Adicionar música logo abaixo">+</button>
            ${podeRemover ? `<button type="button" class="btn btn--ghost btn--sm btn-remover-extra" data-secao="${id}" data-pos="${pos}" title="Remover esta linha" aria-label="Remover esta linha">×</button>` : ""}
          </div>
        </li>`;
    }).join("");
    return `<article class="secao">${cabecalho}<ol class="secao__musicas">${itens}</ol></article>`;
  }).join("");
}

const ICONE_ALCA = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="5" r="1.6"/><circle cx="15" cy="5" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="19" r="1.6"/><circle cx="15" cy="19" r="1.6"/></svg>`;

function htmlEdicaoModelo() {
  const total = rascunhoModelo.length;
  const cards = rascunhoModelo.map((secao, i) => {
    const qtd = secao.qtd_musicas;
    return `
      <article class="secao secao--editando" data-index="${i}">
        <span class="secao__alca" title="Arraste para reordenar">${ICONE_ALCA}</span>
        <input type="text" class="secao__nome" data-index="${i}" value="${escaparHtml(secao.titulo)}"
          placeholder="Nome do momento" maxlength="40" aria-label="Nome do momento ${i + 1}">
        <div class="contador" role="group" aria-label="Quantidade de músicas">
          <button type="button" class="contador__btn" data-acao="menos" data-index="${i}" ${qtd === 0 ? "disabled" : ""} aria-label="Uma música a menos">−</button>
          <span class="contador__valor${qtd === 0 ? " contador__valor--vazio" : ""}">${qtd === 0 ? "Sem música" : plural(qtd, "música", "músicas")}</span>
          <button type="button" class="contador__btn" data-acao="mais" data-index="${i}" ${qtd >= MAX_MUSICAS_POR_SECAO ? "disabled" : ""} aria-label="Uma música a mais">+</button>
        </div>
        <div class="secao__mover">
          <button type="button" class="btn-icone" data-acao="subir" data-index="${i}" ${i === 0 ? "disabled" : ""} title="Mover para cima" aria-label="Mover para cima">↑</button>
          <button type="button" class="btn-icone" data-acao="descer" data-index="${i}" ${i === total - 1 ? "disabled" : ""} title="Mover para baixo" aria-label="Mover para baixo">↓</button>
          <button type="button" class="btn-icone btn-icone--perigo" data-acao="remover" data-index="${i}" ${total === 1 ? "disabled" : ""} title="Remover momento" aria-label="Remover momento">×</button>
        </div>
      </article>`;
  }).join("");

  const rodape = grupoId !== null && modeloEhDoGrupo && modeloAtualizadoEm
    ? `<p class="fluxo-rodape">Modelo do grupo salvo pela última vez em ${new Date(modeloAtualizadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.</p>`
    : "";
  return cards + `<button type="button" class="secao-nova" data-acao="adicionar">+ Adicionar momento</button>` + rodape;
}

// ----- 12.3 Montar o culto (escolher músicas) -----

function definirMusica(input, musicaId) {
  const secao = modeloAtual.find((s) => s.id === input.dataset.secao);
  if (!secao) return;
  const linhas = linhasDaSecao(secao);
  linhas[Number(input.dataset.pos)] = musicaId;
  musicasFluxo[secao.id] = linhas;
  salvarMusicasLocal();
  renderizarGraficoFluxo();
}

secoesEl.addEventListener("input", (e) => {
  if (e.target.matches(".secao__nome")) {
    rascunhoModelo[Number(e.target.dataset.index)].titulo = e.target.value;
    e.target.classList.remove("secao__nome--erro");
    return;
  }
  if (!e.target.matches(".input-fluxo-musica")) return;
  const valor = e.target.value.trim();
  if (!valor) { definirMusica(e.target, null); return; }
  const encontrada = encontrarLouvor(valor);
  if (encontrada) definirMusica(e.target, encontrada.id);
});

// Ao sair do campo: se o texto não for uma música da lista, o campo é limpo
secoesEl.addEventListener("change", (e) => {
  if (!e.target.matches(".input-fluxo-musica")) return;
  const valor = e.target.value.trim();
  if (!valor) { definirMusica(e.target, null); return; }
  const encontrada = encontrarLouvor(valor);
  if (encontrada) {
    e.target.value = rotuloLouvor(encontrada);
    definirMusica(e.target, encontrada.id);
  } else {
    e.target.value = "";
    definirMusica(e.target, null);
    mostrarToast("Música não encontrada. Selecione uma da lista.");
  }
});

secoesEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  if (rascunhoModelo) { tratarCliqueEdicao(btn); return; }

  const secao = modeloAtual.find((s) => s.id === btn.dataset.secao);
  if (!secao) return;
  const pos = Number(btn.dataset.pos);
  const linhas = linhasDaSecao(secao);

  if (btn.matches(".btn-add-mais")) {
    linhas.splice(pos + 1, 0, null);
  } else if (btn.matches(".btn-remover-extra")) {
    linhas.splice(pos, 1);
  } else {
    return;
  }
  musicasFluxo[secao.id] = linhas;
  salvarMusicasLocal();
  renderFluxo();
  if (btn.matches(".btn-add-mais")) {
    secoesEl.querySelector(`.input-fluxo-musica[data-secao="${CSS.escape(secao.id)}"][data-pos="${pos + 1}"]`)?.focus();
  }
});

$("#btn-limpar-fluxo").addEventListener("click", () => {
  if (!confirm("Deseja limpar todas as músicas escolhidas? O modelo do culto não muda.")) return;
  musicasFluxo = {};
  salvarMusicasLocal();
  renderFluxo();
  mostrarToast("Músicas do fluxo removidas.");
});

// ----- 12.4 Editar o modelo -----

function tratarCliqueEdicao(btn) {
  const acao = btn.dataset.acao;
  const i = Number(btn.dataset.index);
  let focar = null; // depois de redesenhar, devolve o foco ao botão equivalente

  switch (acao) {
    case "menos":
      rascunhoModelo[i].qtd_musicas = Math.max(0, rascunhoModelo[i].qtd_musicas - 1);
      focar = `[data-acao="menos"][data-index="${i}"]`;
      break;
    case "mais":
      rascunhoModelo[i].qtd_musicas = Math.min(MAX_MUSICAS_POR_SECAO, rascunhoModelo[i].qtd_musicas + 1);
      focar = `[data-acao="mais"][data-index="${i}"]`;
      break;
    case "subir":
    case "descer": {
      const destino = acao === "subir" ? i - 1 : i + 1;
      moverSecao(i, destino);
      focar = `[data-acao="${acao}"][data-index="${destino}"]`;
      break;
    }
    case "remover":
      rascunhoModelo.splice(i, 1);
      focar = `[data-acao="remover"][data-index="${Math.min(i, rascunhoModelo.length - 1)}"]`;
      break;
    case "adicionar":
      rascunhoModelo.push({ id: novoIdSecao(), titulo: "", qtd_musicas: 1 });
      focar = `.secao__nome[data-index="${rascunhoModelo.length - 1}"]`;
      break;
    default:
      return;
  }
  renderFluxo();
  const alvo = focar && secoesEl.querySelector(focar);
  if (alvo && !alvo.disabled) alvo.focus();
  else if (acao === "menos" || acao === "mais") secoesEl.querySelector(`.secao__nome[data-index="${i}"]`)?.focus();
}

function moverSecao(de, para) {
  if (para < 0 || para >= rascunhoModelo.length || de === para) return;
  const [secao] = rascunhoModelo.splice(de, 1);
  rascunhoModelo.splice(para, 0, secao);
}

// Confere os nomes e devolve o modelo pronto, ou null se faltar algum nome
function validarRascunho() {
  const secoes = rascunhoModelo.map((s) => ({ ...s, titulo: s.titulo.trim() }));
  const vazio = secoes.findIndex((s) => !s.titulo);
  if (vazio !== -1) {
    const campo = secoesEl.querySelector(`.secao__nome[data-index="${vazio}"]`);
    campo?.classList.add("secao__nome--erro");
    campo?.focus();
    mostrarToast("Dê um nome para todos os momentos.");
    return null;
  }
  return secoes;
}

$("#btn-editar-modelo").addEventListener("click", () => {
  rascunhoModelo = copiar(modeloAtual);
  renderFluxo();
});

$("#btn-cancelar-modelo").addEventListener("click", () => {
  rascunhoModelo = null;
  renderFluxo();
});

$("#btn-concluir-modelo").addEventListener("click", () => {
  const secoes = validarRascunho();
  if (!secoes) return;
  modeloAtual = secoes;
  rascunhoModelo = null;
  renderFluxo();
});

$("#btn-salvar-modelo").addEventListener("click", (e) => {
  const secoes = validarRascunho();
  if (secoes) salvarModeloNoGrupo(secoes, e.currentTarget);
});

$("#btn-salvar-modelo-aviso").addEventListener("click", (e) => {
  salvarModeloNoGrupo(copiar(modeloAtual), e.currentTarget);
});

$("#btn-restaurar-modelo").addEventListener("click", () => {
  modeloAtual = copiar(modeloBanco);
  renderFluxo();
  mostrarToast("Modelo restaurado.");
});

// Arrastar para reordenar (computador). No celular, usam-se as setas ↑ ↓.
// O card só fica arrastável enquanto a alça está pressionada, para não
// atrapalhar a seleção de texto no campo do nome.
let arrastandoIndex = null;

const limparMarcasArraste = () => secoesEl.querySelectorAll(".secao--editando").forEach((c) => {
  c.classList.remove("secao--arrastando", "secao--soltar-antes", "secao--soltar-depois");
});

secoesEl.addEventListener("pointerdown", (e) => {
  const alca = e.target.closest(".secao__alca");
  if (alca && rascunhoModelo) alca.closest(".secao").draggable = true;
});
secoesEl.addEventListener("pointerup", () => {
  if (arrastandoIndex === null) secoesEl.querySelectorAll(".secao[draggable]").forEach((c) => c.removeAttribute("draggable"));
});

secoesEl.addEventListener("dragstart", (e) => {
  const card = e.target.closest?.(".secao--editando");
  if (!card || !card.draggable) return;
  arrastandoIndex = Number(card.dataset.index);
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", ""); // necessário no Firefox
  card.classList.add("secao--arrastando");
});

secoesEl.addEventListener("dragover", (e) => {
  if (arrastandoIndex === null) return;
  const card = e.target.closest(".secao--editando");
  if (!card) return;
  e.preventDefault();
  const r = card.getBoundingClientRect();
  const depois = e.clientY > r.top + r.height / 2;
  secoesEl.querySelectorAll(".secao--soltar-antes, .secao--soltar-depois").forEach((c) => {
    if (c !== card) c.classList.remove("secao--soltar-antes", "secao--soltar-depois");
  });
  card.classList.toggle("secao--soltar-depois", depois);
  card.classList.toggle("secao--soltar-antes", !depois);
});

secoesEl.addEventListener("drop", (e) => {
  if (arrastandoIndex === null) return;
  const card = e.target.closest(".secao--editando");
  if (!card) return;
  e.preventDefault();
  let destino = Number(card.dataset.index) + (card.classList.contains("secao--soltar-depois") ? 1 : 0);
  if (destino > arrastandoIndex) destino--;
  moverSecao(arrastandoIndex, destino);
  arrastandoIndex = null;
  renderFluxo();
});

secoesEl.addEventListener("dragend", () => {
  arrastandoIndex = null;
  limparMarcasArraste();
  secoesEl.querySelectorAll(".secao[draggable]").forEach((c) => c.removeAttribute("draggable"));
});

// Confirmação antes de salvar o modelo para o grupo inteiro
const confirmarModeloDialog = $("#confirmar-modelo");

function confirmarSalvarModelo() {
  confirmarModeloDialog.querySelectorAll(".js-nome-grupo").forEach((el) => { el.textContent = nomeGrupo || "seu grupo"; });
  confirmarModeloDialog.returnValue = "";
  confirmarModeloDialog.showModal();
  return new Promise((resolve) => {
    confirmarModeloDialog.addEventListener("close", () => resolve(confirmarModeloDialog.returnValue === "salvar"), { once: true });
  });
}

confirmarModeloDialog.addEventListener("click", (e) => {
  if (e.target === confirmarModeloDialog) confirmarModeloDialog.close();
});

// Avisa antes de sair da página com mudanças de modelo não salvas
window.addEventListener("beforeunload", (e) => {
  const naTela = rascunhoModelo ?? modeloAtual;
  if (!mesmoModelo(naTela, modeloBanco)) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// ----- 12.5 Gráfico da curva do culto -----

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

  // Todas as linhas de música do culto, na ordem dos momentos
  const musicasNoFluxo = modeloAtual
    .flatMap(linhasDaSecao)
    .map((musicaId) => {
      if (!musicaId) return { valor: null, nome: "Espaço vazio" };
      const m = louvores.find(l => l.id === musicaId);
      const valorFluxo = m ? extrairNumeroFluxo(m.fluxo_culto) : null;
      return {
        valor: valorFluxo,
        nome: m ? escaparHtml(m.nome) : "Desconhecida"
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

// ---------- 13. ABA GERENCIAR MÚSICAS ----------
let musicaEditando = null; // null = cadastrando uma música nova
let notasEditando = [];    // sequência da "1ª Nota", ex.: ["A#2", "D#3", "F3"]

// Valores permitidos (seguem o padrão de escrita já usado no banco)
const NOTAS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTAS_COM_OITAVA = [2, 3, 4].flatMap((oitava) => NOTAS.map((n) => `${n}${oitava}`));
const MAX_NOTAS = 8;
// Para cada tom: maior, menor e menor com a relativa maior (ex.: "C", "Cm", "Cm / D#")
const ACORDES = NOTAS.flatMap((n, i) => [n, `${n}m`, `${n}m / ${NOTAS[(i + 3) % 12]}`]);
const FLUXOS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) =>
  `${num <= 5 ? "Contemplação" : "Celebração"} ${String(num).padStart(2, "0")}`);
// Quando o compasso muda na música, é salvo como "4/4 - 2/4"
const COMPASSOS = ["2/2", "2/4", "3/4", "4/4", "6/4", "9/4", "3/8", "6/8", "9/8", "12/8"];

// Monta as <option> de uma lista. Se a música já tem um valor fora do padrão,
// ele aparece marcado, para não ser apagado sem querer ao salvar outros campos.
function opcoesDaLista(lista, valorAtual) {
  let html = lista.map((v) => `<option value="${v}">${v}</option>`).join("");
  if (valorAtual && !lista.includes(valorAtual)) {
    html = `<option value="${valorAtual}">${valorAtual} (fora do padrão)</option>` + html;
  }
  return html;
}

function renderNotas() {
  const caixa = $("#musica-notas");
  caixa.innerHTML = notasEditando.map((nota, i) => `
    <div class="nota-item">
      <select class="select-nota" data-index="${i}" aria-label="Nota ${i + 1}">
        <option value="">—</option>
        ${opcoesDaLista(NOTAS_COM_OITAVA, nota)}
      </select>
      ${notasEditando.length > 1 ? `<button type="button" class="btn btn--ghost btn--sm btn-remover-extra btn-remover-nota" data-index="${i}" title="Remover nota">×</button>` : ""}
    </div>`).join("") +
    (notasEditando.length < MAX_NOTAS ? `<button type="button" class="btn btn--ghost btn--sm" id="btn-add-nota">+ Nota</button>` : "");

  $$("#musica-notas .select-nota").forEach((sel) => { sel.value = notasEditando[sel.dataset.index]; });
}

$("#musica-notas").addEventListener("change", (e) => {
  if (e.target.matches(".select-nota")) notasEditando[e.target.dataset.index] = e.target.value;
});
$("#musica-notas").addEventListener("click", (e) => {
  if (e.target.id === "btn-add-nota") {
    notasEditando.push("");
    renderNotas();
  } else if (e.target.matches(".btn-remover-nota")) {
    notasEditando.splice(Number(e.target.dataset.index), 1);
    renderNotas();
  }
});

function popularAbaMusicas() {
  const sel = $("#select-editar");
  sel.innerHTML = '<option value="">— Nova música —</option>';
  const opcoes = [...louvores]
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map((l) => `<option value="${l.id}">${l.nome}</option>`).join("");
  sel.insertAdjacentHTML("beforeend", opcoes);

  preencherFormMusica(musicaEditando ? louvores.find((l) => l.id === musicaEditando.id) ?? null : null);
}

function preencherFormMusica(musica) {
  musicaEditando = musica;
  $$("#panel-musicas .campo--erro").forEach((c) => c.classList.remove("campo--erro"));
  $("#select-editar").value = musica ? musica.id : "";
  $("#musica-nome").value     = musica?.nome ?? "";
  $("#musica-acorde").innerHTML = '<option value="">Selecione...</option>' + opcoesDaLista(ACORDES, musica?.acorde);
  $("#musica-fluxo").innerHTML  = '<option value="">Selecione...</option>' + opcoesDaLista(FLUXOS, musica?.fluxo_culto);
  $("#musica-acorde").value   = musica?.acorde ?? "";
  $("#musica-fluxo").value    = musica?.fluxo_culto ?? "";
  notasEditando = musica?.primeiras_notas ? musica.primeiras_notas.split("-") : [""];
  renderNotas();
  const [compasso = "", compasso2 = ""] = musica?.compasso ? musica.compasso.split(" - ") : [];
  $("#musica-compasso").innerHTML   = '<option value="">Selecione...</option>' + opcoesDaLista(COMPASSOS, compasso);
  $("#musica-compasso-2").innerHTML = '<option value="">Não muda</option>' + opcoesDaLista(COMPASSOS, compasso2);
  $("#musica-compasso").value   = compasso;
  $("#musica-compasso-2").value = compasso2;
  $("#musica-sobe").checked   = !!musica?.sobe_meio_tom;
  $("#musica-desce").checked  = !!musica?.desce_meio_tom;
  $("#form-musica-titulo").textContent = musica ? `Editar "${musica.nome}"` : "Nova música";
  $("#btn-salvar-musica").textContent  = musica ? "Salvar alterações" : "Cadastrar música";
}

$("#select-editar").addEventListener("change", (e) => {
  const id = Number(e.target.value);
  preencherFormMusica(louvores.find((l) => l.id === id) || null);
});
$("#btn-nova-musica").addEventListener("click", () => {
  preencherFormMusica(null);
  $("#musica-nome").focus();
});
$("#btn-cancelar-musica").addEventListener("click", () => preencherFormMusica(musicaEditando));

$("#btn-salvar-musica").addEventListener("click", async () => {
  const dados = {
    nome:            $("#musica-nome").value.trim(),
    primeiras_notas: notasEditando.join("-"),
    acorde:          $("#musica-acorde").value,
    fluxo_culto:     $("#musica-fluxo").value,
    compasso:        [$("#musica-compasso").value, $("#musica-compasso-2").value].filter(Boolean).join(" - "),
    sobe_meio_tom:   $("#musica-sobe").checked,
    desce_meio_tom:  $("#musica-desce").checked,
  };

  const faltando = validarFormMusica(dados);
  if (faltando.length) { mostrarToast(`Preencha: ${faltando.join(", ")}.`); return; }
  if ($("#musica-compasso-2").value === $("#musica-compasso").value) {
    mostrarToast('O compasso em "Muda para" precisa ser diferente do principal.');
    return;
  }
  const repetida = louvores.find((l) =>
    l.nome.toLowerCase() === dados.nome.toLowerCase() && l.id !== musicaEditando?.id);
  if (repetida) { mostrarToast("Já existe uma música com esse nome."); return; }

  const btn = $("#btn-salvar-musica");
  btn.disabled = true;
  try {
    const salva = await salvarMusicaNoBanco(musicaEditando?.id ?? null, dados);
    if (musicaEditando) {
      Object.assign(musicaEditando, dados);
    } else {
      musicaEditando = { ...salva, ultima_utilizacao: null };
      louvores.push(musicaEditando);
    }
    mostrarToast(`"${dados.nome}" salva com sucesso!`);
    atualizarTelasAposEdicao();
  } catch (err) {
    mostrarToast("Erro ao salvar a música. Tente novamente.");
    console.error(err);
  } finally {
    btn.disabled = false;
  }
});

// Marca em vermelho os campos obrigatórios vazios e devolve os nomes deles.
// Só "Muda para" é opcional; Sobe/Desce tom são caixas de marcar (desmarcada = Não).
function validarFormMusica(dados) {
  const faltando = [];
  const marcar = (seletor, rotulo, vazio) => {
    $(seletor).closest(".campo").classList.toggle("campo--erro", vazio);
    if (vazio) faltando.push(rotulo);
  };
  marcar("#musica-nome", "Nome", !dados.nome);
  marcar("#musica-notas", "1ª Nota (escolha ou remova as notas em —)", notasEditando.some((n) => !n));
  marcar("#musica-acorde", "Acorde", !dados.acorde);
  marcar("#musica-fluxo", "Fluxo", !dados.fluxo_culto);
  marcar("#musica-compasso", "Compasso", !$("#musica-compasso").value);
  return faltando;
}

// Tira o destaque de erro assim que o campo é preenchido
["input", "change"].forEach((evento) =>
  $("#panel-musicas").addEventListener(evento, (e) =>
    e.target.closest(".campo")?.classList.remove("campo--erro")));

async function salvarMusicaNoBanco(id, dados) {
  const consulta = id
    ? db.from('musicas').update(dados).eq('id', id)
    : db.from('musicas').insert(dados);
  const { data, error } = await consulta.select();

  if (error) {
    console.error("Erro ao salvar música no Supabase:", error);
    throw error;
  }
  if (!data || data.length === 0) {
    throw new Error("Nenhuma linha gravada (sem permissão).");
  }
  return data[0];
}

// Redesenha as outras abas sem perder filtros e seleções atuais
function atualizarTelasAposEdicao() {
  popularSelectsDeFiltro();
  $("#filtro-acorde").value = filtros.acorde;
  $("#filtro-fluxo").value  = filtros.fluxo;
  $("#filtro-status").value = filtros.status;

  popularSelectLouvores();
  if (louvorSelecionado) $("#select-louvor").value = louvorSelecionado.id;

  renderTabela();
  atualizarPreview();
  renderFluxo();
  popularAbaMusicas();
}

document.addEventListener("DOMContentLoaded", iniciarAplicacao);