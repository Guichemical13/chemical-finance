# Chemical Finance

Webapp pessoal de finanças: importa a fatura do Nubank (CSV) sem duplicar nada, acompanha o orçamento, o plano de quitação e o patrimônio. Funciona no celular e no computador e pode ser instalado como app (PWA).

**Privacidade.** Este repositório tem só o código, nenhum dado. Os dados ficam numa planilha Google sua. O backend (Apps Script) só responde a quem entra com a conta Google autorizada. O app guarda uma cópia local no aparelho para consulta offline; em computador compartilhado, use *Ajustes › Desconectar aparelho*.

Sem configurar nada, a tela inicial tem **"Ver a demonstração"** com dados fictícios.

---

## Instalação (uma vez, ~20 min)

São quatro peças: o site (GitHub Pages), o login (Google Cloud), o backend (Apps Script + planilha) e a conexão no app.

### 1. Publicar o site no GitHub Pages

1. Crie um repositório **público** chamado `chemical-finance` e envie todos os arquivos desta pasta.
2. Em **Settings › Pages**, escolha *Deploy from a branch*, branch `main`, pasta `/ (root)`.
3. Anote o endereço, por exemplo `https://SEU-USUARIO.github.io/chemical-finance/`.

### 2. Criar o Client ID do login Google

1. Abra o [Google Cloud Console](https://console.cloud.google.com/) e crie um projeto (ex.: *Chemical Finance*).
2. **APIs e serviços › Tela de consentimento OAuth**: tipo *Externo*, nome do app, seu e-mail. Em *Usuários de teste*, adicione o seu Gmail. Pode deixar em modo *Teste*.
3. **APIs e serviços › Credenciais › Criar credenciais › ID do cliente OAuth**:
   - Tipo: **Aplicativo da Web**
   - Origens JavaScript autorizadas: `https://SEU-USUARIO.github.io` (só o domínio, sem `/chemical-finance`)
4. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`).

### 3. Criar a planilha e o backend

1. Crie uma planilha Google vazia chamada *Chemical Finance*.
2. **Extensões › Apps Script**. Apague o conteúdo de `Código.gs` e cole o de [`apps-script/Code.gs`](apps-script/Code.gs).
3. Em **Configurações do projeto** (engrenagem):
   - marque *Mostrar o arquivo de manifesto "appsscript.json"* e cole nele o conteúdo de [`apps-script/appsscript.json`](apps-script/appsscript.json);
   - em **Propriedades do script**, adicione:
     - `CLIENT_ID` = o ID do cliente do passo 2
     - `EMAIL_LIBERADO` = o seu Gmail
4. No editor, selecione a função **`prepararPlanilha`** e clique em *Executar*. Autorize o acesso; isso cria as abas.
5. **Implantar › Nova implantação › App da Web**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**

   O acesso "Qualquer pessoa" é necessário porque o navegador chama o script diretamente. Mesmo assim, o script recusa qualquer chamada que não traga um login Google válido do e-mail liberado.
6. Copie a **URL do app da Web** (termina em `/exec`).

### 4. Conectar o app

Abra o site, cole a URL `/exec` e o Client ID e entre com o Google. Na primeira vez, o app cria as 12 categorias (elementos).

No celular, use *Adicionar à tela de início* (Safari) ou *Instalar app* (Chrome).

---

## Migração da Central Financeira

O arquivo `chemical-finance-migracao.json` foi gerado à parte e **não vai para o repositório**. Ele traz:
- lançamentos, já nas novas categorias;
- salários;
- marcos do plano;
- premissas do simulador;
- a foto de outubro do patrimônio e das dívidas.

1. **Ajustes › Importar backup** e escolha o arquivo.
2. Em **Importar fatura**, reimporte os CSVs de **02/10** e **02/11**. Quase tudo aparece como duplicada ou já existente. Faltam só pares que se anulam (IOF + IOF de volta, compra + estorno), e o app passa a guardar os centavos reais de cada parcela. Depois disso, as duas faturas batem com o arquivo.

## Atualizar o backend depois

Quando o `Code.gs` mudar, cole a nova versão e use **Implantar › Gerenciar implantações › Editar (lápis) › Versão: Nova versão**. Assim a URL `/exec` continua a mesma.

## Para outra pessoa usar

Ela faz os passos 2 a 4 com a própria conta: planilha, Apps Script e Client ID próprios, com a origem do mesmo site do GitHub Pages. No primeiro acesso, ela cola os endereços dela. Os dados de cada um ficam separados.

## Estrutura

```
index.html, manifest.webmanifest, sw.js   PWA
css/app.css                               design "Laboratório" (claro e escuro)
js/core/                                  regras sem interface: CSV, importação, modelo, simulador
js/screens/                               as 7 telas
js/store.js, js/auth.js                   dados (Apps Script ou demonstração) e login Google
apps-script/                              backend
```
