# Configuração da publicação automática · @prospeccao.recife

Este guia leva você do zero até os posts saindo sozinhos no Instagram.
Siga na ordem. O teste da parte 3 vem **antes** de ligar o agendamento.

**Como funciona, em uma frase:** a cada 30 minutos o GitHub Actions roda
`tools/publicar.mjs`, que lê `export/posts.json`, publica pela API oficial do
Instagram o post cujo horário chegou (as imagens vêm do GitHub Pages) e anota
em `export/state.json` o que já saiu, para nunca repetir.

| O que | Onde |
|---|---|
| Repositório | https://github.com/brenohenriquegs07/planner-prospeccao |
| Imagens públicas | https://brenohenriquegs07.github.io/planner-prospeccao/media/ |
| Calendário | 30 posts, de 23/10 a 21/11/2026 (Reels ficam de fora e são manuais) |

---

## Parte 1 · Meta (Instagram e app de desenvolvedor)

Método usado: **Instagram API com Instagram Login** (`graph.instagram.com`).
Ele **não precisa de Página do Facebook**. Os nomes dos menus da Meta mudam
com frequência; se algum não bater exatamente, procure o equivalente.

### 1.1 Deixar a conta como Profissional

No app do Instagram, logado em **@prospeccao.recife**:

1. Perfil → ☰ (menu) → **Configurações e atividade**.
2. **Tipo de conta e ferramentas** → **Mudar para conta profissional**.
3. Escolha uma categoria (ex.: *Empresa de tecnologia*) e o tipo **Empresa**
   (Creator também funciona).
4. Confira que a conta está **pública** (Privacidade da conta → desligado).
   A Meta exige conta pública para usar a API.

### 1.2 Criar o app no developers.facebook.com

1. Acesse **https://developers.facebook.com** e entre com o seu Facebook.
   Se for a primeira vez, conclua o cadastro de desenvolvedor (pede
   confirmação por telefone ou e-mail).
2. **Meus apps** → **Criar app**.
3. Nome do app: algo como `Publicador Prospeccao` (não pode conter
   "Instagram" ou "IG"). E-mail de contato: o seu.
4. Caso de uso: **Outro** → tipo de app: **Empresa** (*Business*).
   O produto Instagram só aparece em apps do tipo Empresa.
5. Portfólio empresarial: pode pular agora ("conectar depois").
6. No painel do app, em **Adicionar produtos**, encontre **Instagram** e
   clique em **Configurar**. Abre a página
   **Configuração da API com login do Instagram** (*API setup with Instagram
   business login*).

> O app fica em **modo de desenvolvimento**. Nesse modo ele funciona para
> as contas adicionadas ao próprio app, que é o nosso caso, sem passar
> pela Análise do App (App Review). A documentação também menciona
> "Verificação da Empresa" antes de publicar o **app** (deixá-lo público
> para outras contas). Não precisamos disso. Se mesmo assim a API recusar
> por permissão, veja o erro na tabela de problemas no fim do guia.

### 1.3 Gerar o token de longa duração

Na página **Configuração da API com login do Instagram**:

1. Seção **1. Gerar tokens de acesso** → **Adicionar conta**.
2. Entre com **@prospeccao.recife** e autorize. As permissões necessárias
   são `instagram_business_basic` e `instagram_business_content_publish`;
   deixe as duas marcadas.
3. A conta aparece na lista, com o número de ID ao lado. Clique em
   **Gerar token**, faça login de novo se pedir e **copie o token**.

Esse token **vale 60 dias**. Trate como senha: não mande por WhatsApp, não
cole em issue, não salve em arquivo dentro do repositório.

### 1.4 Obter o IG user id e conferir o token

Na pasta do projeto, no seu computador:

1. Copie `.env.example` para `.env` e preencha só a linha `IG_ACCESS_TOKEN=`.
2. Rode:
   ```
   npm run ver-conta
   ```
3. A saída mostra algo assim:
   ```
   Conta:        @prospeccao.recife
   Tipo:         BUSINESS
   IG_USER_ID:   17841400000000000
   Publicações:  0 de 100 nas últimas 24h
   ```
   O número de `IG_USER_ID` é o que vai para o GitHub. Se der erro, veja a
   tabela de problemas.

> **Atenção, OneDrive:** esta pasta está no OneDrive, então o `.env` também
> é sincronizado para a nuvem da Microsoft (ele **não** vai para o GitHub,
> o `.gitignore` impede). Se preferir não deixar o token lá, apague a linha
> do token do `.env` depois de usar.

Sem Node instalado? Abra no navegador, trocando `TOKEN` pelo seu token:
`https://graph.instagram.com/v26.0/me?fields=user_id,username&access_token=TOKEN`
e use o valor de `user_id` (não o `id`).

### 1.5 Renovar o token antes de expirar

O token vence 60 dias depois de gerado. O calendário atual acaba em 21/11,
então um token gerado em outubro cobre tudo. Para campanhas futuras, renove
uns 10 dias antes de vencer, por um destes caminhos:

- **Pelo painel (mais simples):** repita o passo 1.3 (**Gerar token**).
- **Pelo terminal:** com o token atual no `.env`, rode `npm run renovar-token`.
  Ele mostra o token novo, válido por mais 60 dias. O token atual precisa ter
  mais de 24 horas e ainda não ter vencido.

Depois de renovar, **atualize o Secret `IG_ACCESS_TOKEN` no GitHub** (passo
2.1) e o `.env`, se usar. Se o token vencer, as execuções falham com erro
**190** e nada é publicado; basta gerar um novo e atualizar o Secret.

---

## Parte 2 · GitHub

### 2.1 Cadastrar os Secrets

No repositório: **Settings** → **Secrets and variables** → **Actions** →
aba **Secrets** → **New repository secret**. Crie dois:

| Nome | Valor |
|---|---|
| `IG_ACCESS_TOKEN` | o token do passo 1.3 |
| `IG_USER_ID` | o número do passo 1.4 |

O GitHub nunca mostra o valor de novo nem o imprime nos logs.

### 2.2 GitHub Pages (já feito)

Já está ativo em **Settings → Pages → Source: GitHub Actions**. Sempre que
as artes em `export/media` mudarem e você der push, o workflow
**Publicar imagens no GitHub Pages** atualiza o site sozinho.

### 2.3 Não crie ainda a variável `AUTOMACAO_ATIVA`

Ela é a chave do agendamento automático. Sem ela, o workflow agendado
fica parado e só o gatilho manual funciona. Ela é criada no passo 3.4.

---

## Parte 3 · Teste antes de liberar o agendamento

### 3.1 Dry-run (não publica nada)

1. **Actions** → **Publicar no Instagram** → **Run workflow**.
2. `modo`: **dry-run** · `post`: **post-01** → **Run workflow**.
3. Abra a execução → job **publicar** → passo **Publicar**. Deve aparecer:
   - `Seria publicado: post-01 · imagem · 1 arquivo(s)`;
   - `✓ https://brenohenriquegs07.github.io/.../media/post-01.jpg image/jpeg`;
   - `limite de publicação: 0 de …` (isso prova que o token e o ID funcionam).

Se aparecer `não consegui consultar o limite`, o problema é token ou ID:
veja a tabela de problemas antes de seguir.

### 3.2 Publicar 1 post de teste

O teste usa um post de verdade do calendário: o **post-01** ("Muito prazer,
somos a Prospecção"), que é o primeiro da sequência. Ideal: rodar no dia
**23/10, perto das 19h**, para ele sair no horário planejado.

1. **Actions** → **Publicar no Instagram** → **Run workflow**.
2. `modo`: **publicar** · `post`: **post-01** → **Run workflow**.
3. No log, a sequência esperada é: `criando container de imagem` →
   `chamando media_publish` → `✓ post-01 publicado` → `link: https://www.instagram.com/p/…`.
4. Abra o link e confira imagem e legenda no Instagram.
5. No repositório deve aparecer um commit novo do **github-actions[bot]**:
   *Atualiza state.json (publicação automática)*.

> Prefere um teste que não seja um post do calendário? Publique o post-01
> assim mesmo e, se não gostar, arquive ou apague pelo app do Instagram (a
> API não apaga posts). Depois apague a entrada `post-01` de
> `export/state.json` se quiser que ele saia de novo no horário.

### 3.3 Conferir que não duplica

Rode de novo **Run workflow** com `modo: publicar` e `post: post-01`. O log
deve dizer `post-01 já foi publicado em …. Nada a fazer.`

### 3.4 Ligar o agendamento automático

**Settings** → **Secrets and variables** → **Actions** → aba **Variables** →
**New repository variable**:

| Nome | Valor |
|---|---|
| `AUTOMACAO_ATIVA` | `true` |

Pronto. A partir daí o workflow roda nos minutos **3 e 33 de cada hora**
(o cron do GitHub é em UTC e pode atrasar alguns minutos; o script compara
os horários em America/Sao_Paulo). O post das 19:00 sai, em geral, entre
19:03 e 19:30. Para conferir: **Actions** → **Publicar no Instagram** → a
execução mais recente.

**Pausar:** mude `AUTOMACAO_ATIVA` para `false` (ou apague a variável).

---

## Regras da automação

- **Só fotos e carrosséis.** Reels (posts 04, 10, 17, 24, 31) estão como
  *rascunho* no planner e não entram no `posts.json`. Publique à mão.
- **1 post por execução.** Se vários estiverem atrasados, saem um a cada
  30 minutos, em ordem.
- **Tolerância de 6 horas.** Post que passou mais de 6 h do horário sem ser
  publicado **não sai sozinho**: o log mostra
  `⚠ post-XX passou da tolerância`. Para publicar mesmo assim, use o gatilho
  manual com `modo: publicar` e `post: post-XX`.
- **Limite diário da Meta.** Antes de publicar, o script consulta o
  `content_publishing_limit`; se estiver cheio, tenta na próxima execução.
- **Nunca duplica.** O `state.json` é gravado logo após cada publicação; se a
  execução cair no meio, a seguinte confere com a Meta se o post saiu.

## No dia a dia

- **Antes de qualquer push seu, rode `git pull`.** O Action faz commit do
  `state.json`, então o seu computador fica para trás.
- **Não edite `export/state.json` à mão** com a automação ligada.
- **Mudar um post (texto, data, arte):** as edições feitas no planner pelo
  navegador ficam só no navegador; o exportador lê os dados do
  `mockup-perfil-instagram.html` (lista `DADOS_PLANILHA`). Altere lá (ou peça
  ajuda), depois rode `npm run exportar`, confira, faça commit e push. O
  Pages republica as artes sozinho. Não mude o número (`nn`) de um post já
  publicado: é ele que identifica o post no `state.json`.
- **Testar localmente sem publicar:** `npm run publicar -- --dry-run`
  (com `--agora 2026-10-24T19:05:00-03:00` para simular um horário).

## Problemas comuns

| Sintoma no log | Causa provável | O que fazer |
|---|---|---|
| `código 190` / *Invalid OAuth access token* | Token errado, vencido ou colado com espaço | Gere outro (1.3) e atualize o Secret |
| `código 10` ou `200` / *permission* / *Application does not have permission* | Conta não adicionada ao app, ou permissão `instagram_business_content_publish` não concedida | Refaça 1.3 marcando as duas permissões. Se persistir, a Meta pode estar exigindo Análise do App ou Verificação da Empresa para a sua conta; me chame com o `fbtrace_id` |
| `código 100` / *does not exist* em `/media` | `IG_USER_ID` errado (usou o `id` em vez do `user_id`) | Rode `npm run ver-conta` e corrija o Secret |
| `subcódigo 2207052` / *media could not be fetched* | A Meta não conseguiu baixar a imagem | Confira se a URL do log abre no navegador e se o Pages está verde |
| `código 4`, `9` ou `32` / limite | Muitas chamadas ou posts em 24 h | Espere; o script tenta de novo sozinho |
| `container ... ERROR` | A Meta rejeitou a imagem | Rode `npm run exportar` de novo e faça push |
| `Execução anterior deixou post-XX pendente` | Uma execução caiu no meio | Nada: o script resolve sozinho na execução seguinte |
| `não consegui salvar o state.json` | Falha no push do bot | Veja em **Actions** e me chame antes da próxima execução, para não duplicar |
| Workflow agendado não aparece rodando | `AUTOMACAO_ATIVA` não é exatamente `true` | Corrija a variável (3.4) |

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `mockup-perfil-instagram.html` | O planner (fonte dos dados) |
| `img/` | Artes originais (720×900) usadas pelo planner |
| `export/media/` | Artes 1080×1350 em JPEG, servidas pelo Pages |
| `export/posts.json` | O que publicar e quando (gerado por `npm run exportar`) |
| `export/state.json` | O que já foi publicado (atualizado pelo Action) |
| `tools/exportar.mjs` | Gera artes e `posts.json` |
| `tools/publicar.mjs` | Publica pela API do Instagram |
| `tools/ver-conta.mjs` | Confere token e mostra o IG user id |
| `tools/renovar-token.mjs` | Renova o token por mais 60 dias |
| `.github/workflows/publicar.yml` | Agendamento a cada 30 min + gatilho manual |
| `.github/workflows/pages.yml` | Publica `export/media` no GitHub Pages |
